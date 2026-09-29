/* eslint-disable @typescript-eslint/no-require-imports -- this Node smoke test is CommonJS */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { generateKeyPair, exportJWK, SignJWT } = require('jose');
const { PrismaClient } = require('@prisma/client');

const projectRoot = path.resolve(__dirname, '..');

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function waitForServer(baseUrl, child) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Portal exited: ${child.exitCode}`);
    try {
      if ((await fetch(`${baseUrl}/api/v1/activities`)).ok) return;
    } catch { /* Server still starting. */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('Portal did not become ready');
}

async function main() {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'cqai-plugin-submissions-'));
  const databasePath = path.join(tempDirectory, 'submissions.db');
  fs.writeFileSync(databasePath, '');
  const databaseUrl = `file:${databasePath}`;
  const migrate = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
  assert.equal(migrate.status, 0, migrate.stderr || migrate.stdout);

  const { privateKey, publicKey } = await generateKeyPair('ES384');
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'plugin-smoke';
  jwk.alg = 'ES384';
  const jwksServer = http.createServer((request, response) => {
    if (request.url !== '/oidc/jwks') { response.writeHead(404).end(); return; }
    response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ keys: [jwk] }));
  });
  const jwksPort = await new Promise((resolve, reject) => {
    jwksServer.once('error', reject);
    jwksServer.listen(0, '127.0.0.1', () => resolve(jwksServer.address().port));
  });
  const issuer = `http://127.0.0.1:${jwksPort}/oidc`;
  const appPort = await availablePort();
  const baseUrl = `http://127.0.0.1:${appPort}`;
  const adminToken = randomBytes(32).toString('hex');
  const memberToken = randomBytes(32).toString('hex');
  const app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(appPort)], {
    cwd: projectRoot,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      LOGTO_ENDPOINT: `http://127.0.0.1:${jwksPort}`,
      LOGTO_APP_ID: 'plugin-smoke-web',
      LOGTO_APP_SECRET: 'plugin-smoke-secret',
      LOGTO_COOKIE_SECRET: 'plugin-smoke-cookie-secret-0123456789',
      BASE_URL_PROD: 'https://cqaiclub.asia',
      BASE_URL_DEV: baseUrl,
      NODE_ENV: 'production',
      CI: 'true',
      CQAI_CI_AUTH_BYPASS: 'enabled-for-smoke-tests',
      CQAI_CI_ADMIN_TOKEN: adminToken,
      CQAI_CI_AUTHENTICATED_TOKEN: memberToken,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  app.stdout.on('data', chunk => { output += String(chunk); });
  app.stderr.on('data', chunk => { output += String(chunk); });
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const sign = (sub, audience = 'https://cqaiclub.asia/') => new SignJWT({ scope: 'openid', name: sub })
    .setProtectedHeader({ alg: 'ES384', kid: 'plugin-smoke' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(privateKey);

  async function request(pathname, options = {}) {
    const response = await fetch(`${baseUrl}${pathname}`, {
      method: options.method || 'GET',
      headers: {
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.origin ? { Origin: baseUrl } : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });
    return { status: response.status, body: await response.json() };
  }

  try {
    await waitForServer(baseUrl, app);
    const alice = await sign('alice');
    const bob = await sign('bob');
    const wrongAudience = await sign('mallory', 'https://account.cqaiclub.asia');
    const payload = {
      packageName: '@cqai/plugin-smoke',
      displayName: '投稿流程测试',
      summary: '验证登录投稿与待审核隔离',
      description: '## 插件能力\n\n- 由临时数据库承载\n- 支持 Markdown 说明',
      categories: ['productivity'],
      keywords: ['cqai'],
      repositoryUrl: 'https://github.com/cqai/plugin-smoke',
      homepageUrl: '', iconUrl: '', compatibilityApiVersion: '', compatibilityHosts: [],
    };

    assert.equal((await request('/api/v1/plugin-submissions', { method: 'POST', origin: true, body: payload })).status, 401);
    assert.equal((await request('/api/v1/plugin-submissions', { method: 'POST', token: wrongAudience, body: payload })).status, 401);
    assert.equal((await request('/api/v1/plugin-submissions', { method: 'POST', token: alice, body: { ...payload, packageName: 'BAD PACKAGE' } })).status, 400);
    const submitted = await request('/api/v1/plugin-submissions', { method: 'POST', token: alice, body: payload });
    assert.equal(submitted.status, 201, JSON.stringify(submitted.body));
    assert.equal(submitted.body.status, 'pending');
    assert.equal((await request('/api/v1/plugin-submissions', { method: 'POST', token: bob, body: payload })).status, 409);
    assert.equal((await request('/api/v1/me/plugin-submissions', { token: alice })).body.length, 1);
    assert.equal((await request('/api/v1/me/plugin-submissions', { token: bob })).body.length, 0);
    assert.equal((await request('/api/v1/me/plugin-submissions', { token: wrongAudience })).status, 401);
    assert.equal((await request('/v1/plugins')).body.items.length, 0);

    const reviewPath = `/api/admin/plugin-submissions/${encodeURIComponent(submitted.body.id)}/review`;
    assert.equal((await request('/api/admin/plugin-submissions', { token: memberToken })).status, 403);
    assert.equal((await request(reviewPath, { method: 'POST', token: memberToken, origin: true, body: { decision: 'approve' } })).status, 403);
    assert.equal((await request(reviewPath, { method: 'POST', token: adminToken, body: { decision: 'approve' } })).status, 403);
    assert.equal((await request('/api/admin/plugin-submissions', { token: adminToken })).body.data.length, 1);
    const approved = await request(reviewPath, { method: 'POST', token: adminToken, origin: true, body: { decision: 'approve' } });
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    assert.equal(approved.body.status, 'approved');
    const plugin = await db.plugin.findUnique({ where: { packageName: payload.packageName } });
    assert.equal(plugin.status, 'draft');
    assert.equal(plugin.description, payload.description, 'multiline Markdown should survive submission and review');
    assert.equal((await request('/v1/plugins')).body.items.length, 0);
    assert.equal((await request(reviewPath, { method: 'POST', token: adminToken, origin: true, body: { decision: 'approve' } })).status, 409);
    assert.equal((await request('/api/v1/me/plugin-submissions', { token: alice })).body[0].status, 'approved');

    const other = await request('/api/v1/plugin-submissions', { method: 'POST', token: bob, body: { ...payload, packageName: '@cqai/plugin-rejected' } });
    assert.equal(other.status, 201);
    const rejected = await request(`/api/admin/plugin-submissions/${other.body.id}/review`, {
      method: 'POST', token: adminToken, origin: true, body: { decision: 'reject', note: '请补充使用说明。' },
    });
    assert.equal(rejected.status, 200, JSON.stringify(rejected.body));
    assert.equal(rejected.body.status, 'rejected');
    assert.equal((await request('/api/v1/me/plugin-submissions', { token: bob })).body[0].reviewNote, '请补充使用说明。');
    console.log('Plugin submission smoke test passed.');
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.stack : String(error)}\nPortal output:\n${output.slice(-4000)}`);
  } finally {
    app.kill('SIGTERM');
    await db.$disconnect();
    await new Promise(resolve => jwksServer.close(resolve));
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
