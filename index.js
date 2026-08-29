require('dotenv').config();

const express = require('express');
const xss = require('xss');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { Parser } = require('json2csv');

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const adminSessions = new Map();
const portalDirectory = path.join(__dirname, 'web');
const applicationDirectory = path.join(__dirname, 'public');

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

const safeEqual = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const requireAdmin = (req, res, next) => {
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

// 2. Admin login. Credentials are configured locally through environment variables.
app.post('/api/admin/login', adminLoginLimiter, (req, res) => {
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

// Frontend entries: official portal, member application, and admin dashboard.
const sendApplicationPage = (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(applicationDirectory, 'index.html'));
};

const sendAdminPage = (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(applicationDirectory, 'admin.html'));
};

app.get(['/apply', '/apply/', '/apply/index.html'], sendApplicationPage);
app.get(['/admin', '/admin/', '/admin.html'], sendAdminPage);

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
