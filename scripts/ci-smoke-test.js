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

  const publicPage = await request(baseUrl, '/');
  assert.equal(publicPage.response.status, 200, 'public application page should load');

  const adminPage = await request(baseUrl, '/admin.html');
  assert.equal(adminPage.response.status, 200, 'admin page should load');

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

  const exportResult = await request(baseUrl, '/api/admin/members/export', { headers: authorization });
  assert.equal(exportResult.response.status, 200, `CSV export should succeed: ${exportResult.body}`);
  assert.match(exportResult.response.headers.get('content-type') || '', /text\/csv/);
  assert.match(exportResult.body, /CI 测试用户/);
  assert.match(exportResult.body, /'=CI_TEST_ORG/, 'CSV export should neutralize spreadsheet formulas');

  console.log('Smoke test passed: pages, authentication, submission, member query, and CSV export.');

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
