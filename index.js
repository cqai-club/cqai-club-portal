const fs = require('node:fs');
const dotenv = require('dotenv');
const environmentFile = fs.existsSync('.env') ? '.env' : (fs.existsSync('.env.local') ? '.env.local' : null);
dotenv.config(environmentFile ? { path: environmentFile } : undefined);

const express = require('express');
const xss = require('xss');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { Parser } = require('json2csv');
const multer = require('multer');
const { createRemoteJWKSet, jwtVerify } = require('jose');

const app = express();
const prisma = new PrismaClient();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const LOGTO_ISSUER = String(process.env.LOGTO_ISSUER || '').replace(/\/$/, '');
const LOGTO_CLIENT_ID = process.env.LOGTO_CLIENT_ID || '';
const LOGTO_CLIENT_SECRET = process.env.LOGTO_CLIENT_SECRET || '';
const LOGTO_REDIRECT_URI = process.env.LOGTO_REDIRECT_URI || `http://localhost:${PORT}/auth/callback`;
const LOGTO_POST_LOGOUT_REDIRECT_URI = process.env.LOGTO_POST_LOGOUT_REDIRECT_URI || `http://localhost:${PORT}/admin/`;
const LOGTO_ADMIN_ROLE = process.env.LOGTO_ADMIN_ROLE || 'club-admin';
const LEGACY_ADMIN_LOGIN_ENABLED = process.env.LEGACY_ADMIN_LOGIN_ENABLED === 'true';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const adminSessions = new Map();
const oidcTransactions = new Map();
let oidcConfigurationPromise;
let oidcJwks;
const portalDirectory = path.join(__dirname, 'web');
const applicationDirectory = path.join(__dirname, 'public');
const collectionUploadDirectory = path.join(__dirname, 'storage', 'uploads', 'collection');
fs.mkdirSync(collectionUploadDirectory, { recursive: true });

app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

// API Rate limit protecting /api/apply
const applyLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // Limit each IP to 5 requests per `window`
  handler: (req, res) => {
    res.status(429).json({ error: '请求过于频繁，请稍后再试。' });
  }
});

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ error: '登录尝试过于频繁，请稍后再试。' });
  }
});

const collectionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ error: '提交过于频繁，请稍后再试。' });
  }
});

const collectionUpload = multer({
  storage: multer.diskStorage({
    destination: collectionUploadDirectory,
    filename: (req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase();
      callback(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${extension}`);
    }
  }),
  limits: {
    files: 2,
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (req, file, callback) => {
    if (!['image/jpeg', 'image/png'].includes(file.mimetype)) {
      return callback(new Error('仅支持 JPG 或 PNG 图片。'));
    }
    callback(null, true);
  }
});

const safeEqual = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const parseCookies = header => Object.fromEntries(
  String(header || '').split(';').map(part => part.trim()).filter(Boolean).map(part => {
    const index = part.indexOf('=');
    return index === -1 ? [part, ''] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
  })
);

const setSessionCookie = (res, value, maxAgeSeconds = ADMIN_SESSION_TTL_MS / 1000) => {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('base64url');
  res.set('Set-Cookie', `cqai_session=${encodeURIComponent(`${value}.${signature}`)}; Max-Age=${maxAgeSeconds}; Path=/; HttpOnly; SameSite=Lax${secure}`);
};

const clearSessionCookie = res => {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.set('Set-Cookie', `cqai_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure}`);
};

const getSessionId = req => {
  const raw = parseCookies(req.get('cookie')).cqai_session || '';
  const separator = raw.lastIndexOf('.');
  if (separator < 1) return '';
  const sessionId = raw.slice(0, separator);
  const signature = raw.slice(separator + 1);
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(sessionId).digest('base64url');
  return safeEqual(signature, expected) ? sessionId : '';
};

const logtoConfigured = () => Boolean(LOGTO_ISSUER && LOGTO_CLIENT_ID && LOGTO_CLIENT_SECRET);

const getOidcConfiguration = async () => {
  if (!logtoConfigured()) throw new Error('Logto 尚未配置完整。');
  if (!oidcConfigurationPromise) {
    oidcConfigurationPromise = fetch(`${LOGTO_ISSUER}/.well-known/openid-configuration`)
      .then(async response => {
        if (!response.ok) throw new Error(`Logto discovery failed: ${response.status}`);
        const configuration = await response.json();
        if (configuration.issuer !== LOGTO_ISSUER) throw new Error('Logto issuer 与 discovery 配置不一致。');
        return configuration;
      })
      .catch(error => {
        oidcConfigurationPromise = undefined;
        throw error;
      });
  }
  return oidcConfigurationPromise;
};

const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
const pkceChallenge = verifier => crypto.createHash('sha256').update(verifier).digest('base64url');

const requireSameOrigin = (req, res, next) => {
  const origin = req.get('origin');
  const forwardedProtocol = req.get('x-forwarded-proto') || req.protocol;
  if (origin && origin !== `${forwardedProtocol}://${req.get('host')}`) {
    return res.status(403).json({ error: '请求来源不受信任。' });
  }
  next();
};

const requireAdmin = (req, res, next) => {
  const sessionId = getSessionId(req);
  const session = sessionId ? adminSessions.get(sessionId) : null;
  if (session && session.expiresAt > Date.now()) {
    req.admin = session.user;
    return next();
  }
  if (sessionId) adminSessions.delete(sessionId);

  if (!LEGACY_ADMIN_LOGIN_ENABLED) {
    return res.status(401).json({ error: '请先使用 Logto 登录。' });
  }

  const authorization = req.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const expiresAt = adminSessions.get(token);

  if (!token || !expiresAt || expiresAt <= Date.now()) {
    if (token) adminSessions.delete(token);
    return res.status(401).json({ error: '管理员登录已失效，请重新登录。' });
  }

  next();
};

// Helper to escape xss in strings or arrays/objects
const sanitizeData = (data) => {
  if (typeof data === 'string') return xss(data);
  if (Array.isArray(data)) return data.map(sanitizeData);
  if (data !== null && typeof data === 'object') {
    const cleanObj = {};
    for (const key in data) {
      cleanObj[key] = sanitizeData(data[key]);
    }
    return cleanObj;
  }
  return data;
};

// Prevent spreadsheet programs from interpreting user-controlled CSV cells as formulas.
const sanitizeCsvCell = (value) => {
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(value)) {
    return `'${value}`;
  }
  return value;
};

const parsePositiveInteger = (value, fallback, maximum) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
};

const collectionTypes = new Set(['member', 'enterprise', 'project']);
const collectionStatuses = new Set(['new', 'reviewing', 'approved', 'rejected']);
const collectionRequiredFields = {
  member: ['name', 'identity', 'bio'],
  enterprise: ['company', 'companyBio', 'business', 'products', 'website', 'contact'],
  project: ['projectName', 'owner', 'oneLine', 'stage', 'projectFocus', 'projectBio', 'projectContact']
};

const cleanupUploadedFiles = files => {
  const uploaded = Object.values(files || {}).flat();
  for (const file of uploaded) {
    try {
      fs.unlinkSync(file.path);
    } catch {
      // Ignore cleanup failures after a rejected submission.
    }
  }
};

const collectionUploadMiddleware = (req, res, next) => {
  collectionUpload.fields([
    { name: 'avatar', maxCount: 1 },
    { name: 'companyLogo', maxCount: 1 }
  ])(req, res, error => {
    if (!error) return next();
    cleanupUploadedFiles(req.files);
    const message = error.code === 'LIMIT_FILE_SIZE'
      ? '图片大小不能超过 5MB。'
      : error.message || '图片上传失败。';
    return res.status(400).json({ error: message });
  });
};

const collectionPayloadFromRequest = req => {
  const cleanBody = sanitizeData(req.body || {});
  const type = cleanBody.type;
  const payload = { ...cleanBody };
  delete payload.type;
  delete payload.consent;
  return {
    type,
    payload,
    consent: cleanBody.consent === 'true' || cleanBody.consent === 'on'
  };
};

const collectionDisplayFields = {
  member: {
    displayName: payload => payload.name,
    contact: payload => payload.phone || payload.profileUrl || '未提供',
    phone: payload => payload.phone,
    email: payload => payload.email
  },
  enterprise: {
    displayName: payload => payload.company,
    contact: payload => payload.contact,
    phone: () => undefined,
    email: payload => payload.email
  },
  project: {
    displayName: payload => payload.projectName,
    contact: payload => payload.projectContact,
    phone: payload => (/^1[3-9]\d{9}$/.test(payload.projectContact || '') ? payload.projectContact : undefined),
    email: payload => payload.email
  }
};

const collectionWhere = ({ type, status, search }) => {
  const filters = [];
  if (collectionTypes.has(type)) filters.push({ type });
  if (collectionStatuses.has(status)) filters.push({ status });
  if (typeof search === 'string' && search.trim()) {
    const term = search.trim();
    filters.push({
      OR: [
        { displayName: { contains: term } },
        { contact: { contains: term } },
        { phone: { contains: term } },
        { email: { contains: term } }
      ]
    });
  }
  return filters.length ? { AND: filters } : {};
};

const serializeCollectionSubmission = submission => {
  let payload = {};
  try {
    payload = JSON.parse(submission.payloadJson);
  } catch {
    payload = {};
  }
  return {
    id: submission.id,
    type: submission.type,
    status: submission.status,
    displayName: submission.displayName,
    contact: submission.contact,
    phone: submission.phone,
    email: submission.email,
    payload,
    consent: submission.consent,
    consentAt: submission.consentAt,
    ipAddress: submission.ipAddress,
    createdAt: submission.createdAt,
    updatedAt: submission.updatedAt,
    assets: (submission.assets || []).map(asset => ({
      id: asset.id,
      kind: asset.kind,
      originalName: asset.originalName,
      mimeType: asset.mimeType,
      size: asset.size,
      createdAt: asset.createdAt,
      downloadUrl: `/api/admin/collection-submissions/${submission.id}/assets/${asset.id}`
    }))
  };
};

app.get('/auth/login', async (req, res) => {
  if (!logtoConfigured()) return res.status(503).send('Logto 尚未配置，请先设置 LOGTO_ISSUER、LOGTO_CLIENT_ID 和 LOGTO_CLIENT_SECRET。');
  try {
    const configuration = await getOidcConfiguration();
    const state = randomToken();
    const nonce = randomToken();
    const verifier = randomToken(48);
    const requestedReturnTo = typeof req.query.returnTo === 'string'
      && req.query.returnTo.startsWith('/')
      && !req.query.returnTo.startsWith('//')
      ? req.query.returnTo
      : '/admin/';
    oidcTransactions.set(state, { nonce, verifier, returnTo: requestedReturnTo, createdAt: Date.now() });
    const authorizationUrl = new URL(configuration.authorization_endpoint);
    authorizationUrl.search = new URLSearchParams({
      response_type: 'code',
      client_id: LOGTO_CLIENT_ID,
      redirect_uri: LOGTO_REDIRECT_URI,
      scope: 'openid profile email roles',
      state,
      nonce,
      code_challenge: pkceChallenge(verifier),
      code_challenge_method: 'S256'
    }).toString();
    res.redirect(authorizationUrl.toString());
  } catch (error) {
    console.error('Logto login initialization error:', error);
    res.status(503).send('暂时无法连接 Logto，请稍后重试。');
  }
});

app.get('/auth/callback', async (req, res) => {
  const { code, state, error, error_description: errorDescription } = req.query;
  const transaction = state ? oidcTransactions.get(state) : null;
  if (state) oidcTransactions.delete(state);
  if (error) return res.status(401).send(`Logto 登录未完成：${errorDescription || error}`);
  if (!code || !transaction || Date.now() - transaction.createdAt > 10 * 60 * 1000) {
    return res.status(400).send('登录请求已失效，请重新登录。');
  }

  try {
    const configuration = await getOidcConfiguration();
    const tokenResponse = await fetch(configuration.token_endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: String(code),
        client_id: LOGTO_CLIENT_ID,
        client_secret: LOGTO_CLIENT_SECRET,
        redirect_uri: LOGTO_REDIRECT_URI,
        code_verifier: transaction.verifier
      })
    });
    const tokenResult = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !tokenResult.id_token) {
      throw new Error(tokenResult.error_description || `Logto token exchange failed: ${tokenResponse.status}`);
    }

    oidcJwks ||= createRemoteJWKSet(new URL(configuration.jwks_uri));
    const { payload } = await jwtVerify(tokenResult.id_token, oidcJwks, {
      issuer: LOGTO_ISSUER,
      audience: LOGTO_CLIENT_ID
    });
    if (payload.nonce !== transaction.nonce) throw new Error('Logto nonce 校验失败。');

    let userInfo = {};
    if (configuration.userinfo_endpoint && tokenResult.access_token) {
      const userInfoResponse = await fetch(configuration.userinfo_endpoint, {
        headers: { Authorization: `Bearer ${tokenResult.access_token}` }
      });
      if (userInfoResponse.ok) userInfo = await userInfoResponse.json();
    }
    const user = {
      id: String(payload.sub || userInfo.sub || ''),
      name: String(userInfo.name || payload.name || userInfo.username || payload.username || ''),
      email: String(userInfo.email || payload.email || ''),
      roles: Array.isArray(userInfo.roles) ? userInfo.roles : (Array.isArray(payload.roles) ? payload.roles : [])
    };
    if (!user.id) throw new Error('Logto 未返回用户标识。');
    if (LOGTO_ADMIN_ROLE && !user.roles.includes(LOGTO_ADMIN_ROLE)) {
      return res.status(403).send('你的 Logto 账号没有俱乐部后台权限。');
    }

    const sessionId = randomToken();
    adminSessions.set(sessionId, { user, idToken: tokenResult.id_token, expiresAt: Date.now() + ADMIN_SESSION_TTL_MS });
    setSessionCookie(res, sessionId);
    res.redirect(transaction.returnTo || '/admin/');
  } catch (error) {
    console.error('Logto callback error:', error);
    res.status(401).send('Logto 登录校验失败，请检查应用配置后重试。');
  }
});

app.get('/auth/logout', async (req, res) => {
  const sessionId = getSessionId(req);
  const session = sessionId ? adminSessions.get(sessionId) : null;
  if (sessionId) adminSessions.delete(sessionId);
  clearSessionCookie(res);
  if (logtoConfigured() && session?.idToken) {
    try {
      const configuration = await getOidcConfiguration();
      if (configuration.end_session_endpoint) {
        const logoutUrl = new URL(configuration.end_session_endpoint);
        logoutUrl.search = new URLSearchParams({
          id_token_hint: session.idToken,
          post_logout_redirect_uri: LOGTO_POST_LOGOUT_REDIRECT_URI,
          client_id: LOGTO_CLIENT_ID
        }).toString();
        return res.redirect(logoutUrl.toString());
      }
    } catch (error) {
      console.error('Logto logout initialization error:', error);
    }
  }
  res.redirect(LOGTO_POST_LOGOUT_REDIRECT_URI);
});

app.get('/api/auth/me', (req, res) => {
  const sessionId = getSessionId(req);
  const session = sessionId ? adminSessions.get(sessionId) : null;
  if (!session || session.expiresAt <= Date.now()) {
    if (sessionId) adminSessions.delete(sessionId);
    return res.json({ authenticated: false });
  }
  res.set('Cache-Control', 'no-store');
  res.json({ authenticated: true, user: session.user });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// 1. Submit application
app.post('/api/apply', applyLimiter, async (req, res) => {
  try {
    const rawData = req.body || {};

    // Basic validation
    if (!rawData.phone || !/^1[3-9]\d{9}$/.test(rawData.phone)) {
      return res.status(400).json({ error: '无效的手机号码' });
    }

    const requiredStringFields = [
      'name',
      'wechat',
      'organization',
      'title',
      'orgType',
      'purpose',
      'timePref',
      'city',
      'roleIntent',
      'privacy'
    ];
    if (requiredStringFields.some(field => typeof rawData[field] !== 'string' || !rawData[field].trim())) {
      return res.status(400).json({ error: '缺少必填字段' });
    }

    const data = sanitizeData(rawData);

    // Business Logic: Identify High-Value Members
    // Rules: provision of '资金/投资' or '产业场景/业务需求' or roleIntent uses '愿意成为理事/合作单位'
    const provideRes = Array.isArray(data.provideRes) ? data.provideRes : [];
    if (provideRes.length < 1) {
      return res.status(400).json({ error: '请至少选择一项可提供的资源' });
    }

    let isHighValue = false;
    if (
      provideRes.includes('资金/投资') ||
      provideRes.includes('产业场景/业务需求') ||
      data.roleIntent === '愿意成为理事/合作单位'
    ) {
      isHighValue = true;
    }

    // Check constraints: needResources between 1 and 3
    const needRes = Array.isArray(data.needRes) ? data.needRes : [];
    if (needRes.length < 1 || needRes.length > 3) {
      return res.status(400).json({ error: '希望链接的资源请选择1-3项' });
    }

    const events = Array.isArray(data.events) ? data.events : [];
    if (events.length < 1) {
      return res.status(400).json({ error: '请至少选择一项期待活动' });
    }

    await prisma.memberApplication.create({
      data: {
        name: data.name,
        phone: data.phone,
        wechat: data.wechat,
        email: data.email,
        organization: data.organization,
        title: data.title,
        orgType: data.orgType,
        orgTypeOther: data.orgTypeOther,
        provideResources: JSON.stringify(provideRes),
        provideResourcesOther: data.provideResOther,
        needResources: JSON.stringify(needRes),
        needResourcesOther: data.needResOther,
        joinPurpose: data.purpose,
        joinPurposeOther: data.purposeOther,
        expectEvents: JSON.stringify(events),
        expectEventsOther: data.eventsOther,
        timePreference: data.timePref,
        city: data.city,
        cityOther: data.cityOther,
        roleIntent: data.roleIntent,
        bio: data.bio,
        privacyPreference: data.privacy,
        isHighValue: isHighValue,
        ipAddress: req.ip
      }
    });

    res.status(201).json({ success: true, isHighValue });
  } catch (error) {
    console.error('Apply error:', error);
    if (error.code === 'P2002') {
       return res.status(400).json({ error: '该手机号码已提交过申请' });
    }
    res.status(500).json({ error: '内部服务器错误' });
  }
});

// 2. Submit a member, enterprise, or AI project collection form.
app.post('/api/collection-submissions', collectionLimiter, collectionUploadMiddleware, async (req, res) => {
  const files = req.files || {};
  try {
    const { type, payload, consent } = collectionPayloadFromRequest(req);
    if (!collectionTypes.has(type)) {
      cleanupUploadedFiles(files);
      return res.status(400).json({ error: '请选择有效的征集类型。' });
    }

    const missingField = collectionRequiredFields[type]
      .find(field => typeof payload[field] !== 'string' || !payload[field].trim());
    if (missingField) {
      cleanupUploadedFiles(files);
      return res.status(400).json({ error: '请补充所有必填信息。' });
    }

    if (!consent) {
      cleanupUploadedFiles(files);
      return res.status(400).json({ error: '请先同意授权说明。' });
    }

    const fields = collectionDisplayFields[type];
    const displayName = String(fields.displayName(payload) || '').trim();
    const contact = String(fields.contact(payload) || '').trim();
    if (!displayName || !contact) {
      cleanupUploadedFiles(files);
      return res.status(400).json({ error: '请补充姓名、企业名称或联系方式。' });
    }

    const phone = fields.phone(payload);
    const email = fields.email(payload);
    const assetEntries = [];
    for (const [fieldName, kind] of [['avatar', 'avatar'], ['companyLogo', 'companyLogo']]) {
      const file = files[fieldName]?.[0];
      if (!file) continue;
      assetEntries.push({
        kind,
        storageKey: path.basename(file.filename),
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size
      });
    }

    const submission = await prisma.collectionSubmission.create({
      data: {
        type,
        status: 'new',
        displayName,
        contact,
        phone: phone || undefined,
        email: email || undefined,
        payloadJson: JSON.stringify(payload),
        consent: true,
        consentAt: new Date(),
        ipAddress: req.ip,
        assets: assetEntries.length ? { create: assetEntries } : undefined
      },
      include: { assets: true }
    });

    res.status(201).json({
      success: true,
      id: submission.id,
      type: submission.type
    });
  } catch (error) {
    cleanupUploadedFiles(files);
    console.error('Collection submission error:', error);
    res.status(500).json({ error: '提交失败，请稍后重试。' });
  }
});

// 2. Admin login. Credentials are configured locally through environment variables.
app.post('/api/admin/login', adminLoginLimiter, (req, res) => {
  if (!LEGACY_ADMIN_LOGIN_ENABLED) {
    return res.status(410).json({ error: '账号密码登录已停用，请使用 Logto 登录。' });
  }
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    return res.status(503).json({ error: '管理员账号尚未配置。' });
  }

  const { username, password } = req.body || {};
  if (!safeEqual(username, ADMIN_USERNAME) || !safeEqual(password, ADMIN_PASSWORD)) {
    return res.status(401).json({ error: '账号或密码错误！' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  adminSessions.set(token, Date.now() + ADMIN_SESSION_TTL_MS);
  res.set('Cache-Control', 'no-store');
  res.json({ token, expiresIn: ADMIN_SESSION_TTL_MS / 1000 });
});

// 3. Admin dashboard API to list members
app.get('/api/admin/members', requireAdmin, async (req, res) => {
  try {
    const { orgType, city, isHighValue } = req.query;
    const page = parsePositiveInteger(req.query.page, 1, 1_000_000);
    const limit = parsePositiveInteger(req.query.limit, 10, 100);
    const skip = (page - 1) * limit;

    const where = {};
    if (orgType) where.orgType = orgType;
    if (city) where.city = city;
    if (isHighValue === 'true') where.isHighValue = true;

    const [members, total] = await Promise.all([
      prisma.memberApplication.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.memberApplication.count({ where })
    ]);

    res.json({
      data: members.map(m => ({
        ...m,
        provideResources: JSON.parse(m.provideResources),
        needResources: JSON.parse(m.needResources),
        expectEvents: JSON.parse(m.expectEvents)
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('List members error:', error);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// 4. Admin dashboard API to export to CSV
app.get('/api/admin/members/export', requireAdmin, async (req, res) => {
  try {
    const members = await prisma.memberApplication.findMany({
      orderBy: { createdAt: 'desc' }
    });

    // Flatten metadata for CSV
    const csvData = members.map(member => Object.fromEntries(
      Object.entries(member).map(([key, value]) => [key, sanitizeCsvCell(value)])
    ));

    const parser = new Parser();
    const csv = parser.parse(csvData);

    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.attachment('members.csv');
    // Prepend BOM to fix Chinese encoding in Excel
    res.send('\uFEFF' + csv);
  } catch (err) {
    console.error(err);
    res.status(500).send('Export failed');
  }
});

// 5. Project collection management APIs.
app.get('/api/admin/collection-submissions', requireAdmin, async (req, res) => {
  try {
    const page = parsePositiveInteger(req.query.page, 1, 1_000_000);
    const limit = parsePositiveInteger(req.query.limit, 20, 100);
    const skip = (page - 1) * limit;
    const where = collectionWhere(req.query);
    const [submissions, total] = await Promise.all([
      prisma.collectionSubmission.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { assets: true }
      }),
      prisma.collectionSubmission.count({ where })
    ]);

    res.json({
      data: submissions.map(serializeCollectionSubmission),
      total,
      page,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('List collection submissions error:', error);
    res.status(500).json({ error: '获取征集资料失败。' });
  }
});

app.get('/api/admin/collection-submissions/export', requireAdmin, async (req, res) => {
  try {
    const submissions = await prisma.collectionSubmission.findMany({
      where: collectionWhere(req.query),
      orderBy: { createdAt: 'desc' }
    });
    const csvData = submissions.map(submission => {
      let payload = {};
      try {
        payload = JSON.parse(submission.payloadJson);
      } catch {
        payload = {};
      }
      const row = {
        id: submission.id,
        type: submission.type,
        status: submission.status,
        displayName: submission.displayName,
        contact: submission.contact,
        phone: submission.phone || '',
        email: submission.email || '',
        consent: submission.consent,
        createdAt: submission.createdAt.toISOString(),
        updatedAt: submission.updatedAt.toISOString()
      };
      for (const [key, value] of Object.entries(payload)) {
        row[`field_${key}`] = Array.isArray(value) ? value.join(', ') : value;
      }
      return Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key, sanitizeCsvCell(value)])
      );
    });

    const baseFields = ['id', 'type', 'status', 'displayName', 'contact', 'phone', 'email', 'consent', 'createdAt', 'updatedAt'];
    const fields = csvData.length
      ? Array.from(new Set(csvData.flatMap(row => Object.keys(row))))
      : baseFields;
    const parser = new Parser({ fields });
    const csv = parser.parse(csvData);
    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.attachment('collection-submissions.csv');
    res.send('\uFEFF' + csv);
  } catch (error) {
    console.error('Export collection submissions error:', error);
    res.status(500).send('Export failed');
  }
});

app.get('/api/admin/collection-submissions/:id', requireAdmin, async (req, res) => {
  try {
    const submission = await prisma.collectionSubmission.findUnique({
      where: { id: req.params.id },
      include: { assets: true }
    });
    if (!submission) return res.status(404).json({ error: '未找到这条征集资料。' });
    res.json(serializeCollectionSubmission(submission));
  } catch (error) {
    console.error('Get collection submission error:', error);
    res.status(500).json({ error: '获取征集详情失败。' });
  }
});

app.patch('/api/admin/collection-submissions/:id/status', requireAdmin, requireSameOrigin, async (req, res) => {
  const status = typeof req.body?.status === 'string' ? req.body.status : '';
  if (!collectionStatuses.has(status)) {
    return res.status(400).json({ error: '无效的审核状态。' });
  }

  try {
    const submission = await prisma.collectionSubmission.update({
      where: { id: req.params.id },
      data: { status },
      include: { assets: true }
    });
    res.json(serializeCollectionSubmission(submission));
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: '未找到这条征集资料。' });
    console.error('Update collection submission status error:', error);
    res.status(500).json({ error: '更新审核状态失败。' });
  }
});

app.get('/api/admin/collection-submissions/:id/assets/:assetId', requireAdmin, async (req, res) => {
  try {
    const asset = await prisma.submissionAsset.findFirst({
      where: {
        id: req.params.assetId,
        submissionId: req.params.id
      }
    });
    if (!asset) return res.status(404).json({ error: '未找到附件。' });

    const filePath = path.join(collectionUploadDirectory, path.basename(asset.storageKey));
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: '附件文件不存在。' });
    res.type(asset.mimeType);
    res.sendFile(filePath);
  } catch (error) {
    console.error('Get collection asset error:', error);
    res.status(500).json({ error: '读取附件失败。' });
  }
});

// Frontend entries: official portal, member application, and admin dashboard.
const sendApplicationPage = (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(applicationDirectory, 'index.html'));
};

const sendAdminPage = (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(applicationDirectory, 'admin.html'));
};

const sendCollectionAdminPage = (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(applicationDirectory, 'collection-admin.html'));
};

app.get(['/apply', '/apply/', '/apply/index.html'], sendApplicationPage);
app.get(['/admin', '/admin/', '/admin.html'], sendAdminPage);
app.get(['/admin/collections', '/admin/collections/', '/admin/collections.html'], sendCollectionAdminPage);

app.use(express.static(portalDirectory, {
  setHeaders: (res, filePath) => {
    if (/\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(filePath)) {
      res.set('Cache-Control', 'public, max-age=604800');
      return;
    }
    res.set('Cache-Control', 'no-cache');
  }
}));

const server = app.listen(PORT, () => {
  console.log(`Club portal is running at http://localhost:${PORT}`);
});

const shutdown = signal => {
  console.log(`Received ${signal}, shutting down.`);
  const forceExitTimer = setTimeout(() => process.exit(1), 10_000);
  forceExitTimer.unref();

  server.close(async () => {
    clearTimeout(forceExitTimer);
    await prisma.$disconnect();
    process.exit(0);
  });
};

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
