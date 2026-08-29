const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');

const projectRoot = path.resolve(__dirname, '..');
const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'cqai-club-ci-'));
const databasePath = path.join(tempDirectory, 'smoke-test.db');
const adminUsername = 'ci-admin';
const adminPassword = 'ci-password-for-tests-only';
let applicationProcess;

const checkWebsiteAssets = () => {
  const websiteRoot = path.join(projectRoot, 'web');
  const entryFile = path.join(websiteRoot, 'index.html');
  assert.ok(fs.existsSync(entryFile), 'official website entry should exist');

  const html = fs.readFileSync(entryFile, 'utf8');
  assert.match(html, /<title>重庆AI创享俱乐部/, 'official website should have the expected title');
  assert.match(html, /href=["']\/apply\/["']/, 'official website should link to the local application route');
  assert.doesNotMatch(
    html,
    /https?:\/\/(?:localhost|127\.0\.0\.1|8\.137\.71\.156)(?=[:/]|$)/,
    'official website should not link to a local or retired server address'
  );

  const references = [
    ...Array.from(html.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi), match => match[1]),
    ...Array.from(html.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi), match => match[1])
  ];

  const localReferences = references
    .filter(Boolean)
    .filter(reference => !/^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(reference));

  for (const reference of new Set(localReferences)) {
    const relativePath = reference.split(/[?#]/, 1)[0];
    if (!relativePath) continue;

    const assetPath = path.resolve(websiteRoot, relativePath);
    assert.ok(
      assetPath.startsWith(`${websiteRoot}${path.sep}`),
      `website asset should remain inside web/: ${reference}`
    );
    assert.ok(fs.existsSync(assetPath), `website asset should exist: ${reference}`);
  }
};

const prepareDatabase = async databaseUrl => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const migrationsDirectory = path.join(projectRoot, 'prisma', 'migrations');
  const migrationFiles = fs.readdirSync(migrationsDirectory, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(migrationsDirectory, entry.name, 'migration.sql'))
    .filter(file => fs.existsSync(file))
    .sort();

  assert.ok(migrationFiles.length > 0, 'at least one database migration should exist');

  try {
    for (const migrationFile of migrationFiles) {
      const statements = fs.readFileSync(migrationFile, 'utf8')
        .replace(/^\s*--.*$/gm, '')
        .split(';')
        .map(statement => statement.trim())
        .filter(Boolean);

      for (const statement of statements) {
        await prisma.$executeRawUnsafe(statement);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
};

const reservePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.unref();
  server.on('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    server.close(error => {
      if (error) return reject(error);
      resolve(address.port);
    });
  });
});

const request = async (baseUrl, pathname, options = {}) => {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const body = await response.text();
  return { response, body };
};

const waitForServer = async baseUrl => {
  const deadline = Date.now() + 15_000;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const result = await request(baseUrl, '/');
      if (result.response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  throw new Error(`Server did not become ready: ${lastError || 'timeout'}`);
};

const stopApplication = async () => {
  if (!applicationProcess || applicationProcess.exitCode !== null) return;

  applicationProcess.kill('SIGTERM');
  await Promise.race([
    new Promise(resolve => applicationProcess.once('exit', resolve)),
    new Promise(resolve => setTimeout(resolve, 3_000))
  ]);

  if (applicationProcess.exitCode === null) applicationProcess.kill('SIGKILL');
};

const main = async () => {
  checkWebsiteAssets();

  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env,
    DATABASE_URL: `file:${databasePath}`,
    PORT: String(port),
    ADMIN_USERNAME: adminUsername,
    ADMIN_PASSWORD: adminPassword
  };

  await prepareDatabase(env.DATABASE_URL);

  applicationProcess = spawn(process.execPath, ['index.js'], {
    cwd: projectRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let serverOutput = '';
  applicationProcess.stdout.on('data', chunk => { serverOutput += chunk; });
  applicationProcess.stderr.on('data', chunk => { serverOutput += chunk; });

  await waitForServer(baseUrl);

  const health = await request(baseUrl, '/health');
  assert.equal(health.response.status, 200, 'health endpoint should load');
  assert.deepEqual(JSON.parse(health.body), { status: 'ok' });

  const portalPage = await request(baseUrl, '/');
  assert.equal(portalPage.response.status, 200, 'official portal should load');
  assert.match(portalPage.body, /重庆AI创享俱乐部 \| 在重庆，做AI/);
  assert.equal(portalPage.response.headers.get('x-powered-by'), null, 'server signature should be hidden');

  const portalImage = await request(baseUrl, '/images/logo-nav.png');
  assert.equal(portalImage.response.status, 200, 'official portal assets should load');
  assert.match(portalImage.response.headers.get('content-type') || '', /image\/png/);

  const applicationPage = await request(baseUrl, '/apply/');
  assert.equal(applicationPage.response.status, 200, 'member application page should load');
  assert.match(applicationPage.body, /重庆AI创享俱乐部 入会申请/);
  assert.match(applicationPage.body, /href=["']\/["']>← 返回俱乐部官网/);

  const adminPage = await request(baseUrl, '/admin/');
  assert.equal(adminPage.response.status, 200, 'admin page should load');

  const legacyAdminPage = await request(baseUrl, '/admin.html');
  assert.equal(legacyAdminPage.response.status, 200, 'legacy admin URL should remain compatible');

  const unauthorizedMembers = await request(baseUrl, '/api/admin/members');
  assert.equal(unauthorizedMembers.response.status, 401, 'admin API should reject anonymous access');

  const invalidLogin = await request(baseUrl, '/api/admin/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: adminUsername, password: 'incorrect-test-password' })
  });
  assert.equal(invalidLogin.response.status, 401, 'invalid admin credentials should be rejected');

  const validLogin = await request(baseUrl, '/api/admin/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: adminUsername, password: adminPassword })
  });
  assert.equal(validLogin.response.status, 200, 'valid admin credentials should be accepted');
  const { token } = JSON.parse(validLogin.body);
  assert.ok(token, 'admin login should return a session token');

  const testPhone = ['199', '0000', '0000'].join('');
  const application = {
    name: 'CI 测试用户',
    phone: testPhone,
    wechat: 'ci-test-user',
    email: 'ci-test@example.invalid',
    organization: '=CI_TEST_ORG',
    title: '测试工程师',
    orgType: '其他',
    orgTypeOther: '自动化测试',
    provideRes: ['技术能力'],
    provideResOther: '',
    needRes: ['行业交流'],
    needResOther: '',
    purpose: '资源链接',
    purposeOther: '',
    events: ['技术分享'],
    eventsOther: '',
    timePref: '周末',
    city: '重庆',
    cityOther: '',
    roleIntent: '普通会员',
    bio: '仅用于自动化测试',
    privacy: '同意俱乐部内部使用'
  };

  const incompleteSubmission = await request(baseUrl, '/api/apply', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...application, events: [] })
  });
  assert.equal(incompleteSubmission.response.status, 400, 'incomplete application should be rejected');

  const submission = await request(baseUrl, '/api/apply', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(application)
  });
  assert.equal(submission.response.status, 201, `application should be accepted: ${submission.body}`);

  const duplicateSubmission = await request(baseUrl, '/api/apply', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(application)
  });
  assert.equal(duplicateSubmission.response.status, 400, 'duplicate phone should be rejected');

  const authorization = { authorization: `Bearer ${token}` };
  const members = await request(baseUrl, '/api/admin/members?limit=10', { headers: authorization });
  assert.equal(members.response.status, 200, `member query should succeed: ${members.body}`);
  const membersPayload = JSON.parse(members.body);
  assert.equal(membersPayload.total, 1, 'member query should return the submitted application');
  assert.equal(membersPayload.data[0].phone, application.phone);

  const boundedMembers = await request(baseUrl, '/api/admin/members?page=-1&limit=1000', {
    headers: authorization
  });
  assert.equal(boundedMembers.response.status, 200, 'invalid pagination values should be normalized');
  assert.equal(JSON.parse(boundedMembers.body).page, 1);

  const exportResult = await request(baseUrl, '/api/admin/members/export', { headers: authorization });
  assert.equal(exportResult.response.status, 200, `CSV export should succeed: ${exportResult.body}`);
  assert.match(exportResult.response.headers.get('content-type') || '', /text\/csv/);
  assert.match(exportResult.body, /CI 测试用户/);
  assert.match(exportResult.body, /'=CI_TEST_ORG/, 'CSV export should neutralize spreadsheet formulas');

  console.log('Smoke test passed: portal, application, admin, authentication, submission, member query, and CSV export.');

  if (applicationProcess.exitCode !== null && applicationProcess.exitCode !== 0) {
    throw new Error(`Application exited unexpectedly.\n${serverOutput}`);
  }
};

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await stopApplication();
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  });
