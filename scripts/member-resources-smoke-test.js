/* eslint-disable @typescript-eslint/no-require-imports -- Node integration test */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const sharp = require('sharp');
const { startMembershipMock } = require('./helpers/logto-membership-mock');

async function main() {
  const root = path.resolve(__dirname, '..');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cqai-resources-'));
  const databaseUrl = `file:${path.join(directory, 'resources.db')}`;
  fs.writeFileSync(path.join(directory, 'resources.db'), '');
  const storage = path.join(directory, 'storage');
  let app; let membershipMock;
  let output = '';
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const migration = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
      cwd: root, encoding: 'utf8', env: { ...process.env, DATABASE_URL: databaseUrl },
    });
    assert.equal(migration.status, 0, migration.stderr || migration.stdout);
    membershipMock = await startMembershipMock(['ci-member']);
    await db.memberOrganizationBinding.update({ where: { id: 'innovation' }, data: { validatedAt: new Date() } });
    const port = await new Promise((resolve, reject) => {
      const server = net.createServer(); server.once('error', reject);
      server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
    });
    const base = `http://127.0.0.1:${port}`;
    const admin = randomBytes(32).toString('hex');
    const member = randomBytes(32).toString('hex');
    app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port)], {
      cwd: root,
      env: { ...process.env, DATABASE_URL: databaseUrl, CQAI_STORAGE_ROOT: storage,
        NODE_ENV: 'production', CI: 'true', CQAI_CI_AUTH_BYPASS: 'enabled-for-smoke-tests',
        CQAI_CI_ADMIN_TOKEN: admin, CQAI_CI_AUTHENTICATED_TOKEN: member,
        ...membershipMock.env, LOGTO_APP_ID: 'resource-smoke', LOGTO_APP_SECRET: 'resource-smoke',
        LOGTO_COOKIE_SECRET: 'resource-smoke-cookie-secret-0123456789', BASE_URL_PROD: base, BASE_URL_DEV: base,
      }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    app.stdout.on('data', bytes => { output += String(bytes); });
    app.stderr.on('data', bytes => { output += String(bytes); });
    for (let i = 0; i < 100; i++) {
      assert.equal(app.exitCode, null, output);
      try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* Starting */ }
      if (i === 99) throw new Error('Server startup timeout');
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    const list = '/member/api/resources';
    const management = '/member/api/admin/resources';
    const image = await sharp({ create: { width: 40, height: 80, channels: 3, background: '#7733aa' } }).png().toBuffer();
    function form({ published = false, externalUrl = 'https://example.org/learning?code=abc', description = '详细介绍\n第二行', imageBytes = image, updatedAt } = {}) {
      const data = new FormData();
      data.set('description', description); data.set('externalUrl', externalUrl); data.set('published', String(published));
      if (imageBytes) data.set('image', new Blob([imageBytes], { type: 'image/png' }), 'resource.png');
      if (updatedAt) data.set('updatedAt', updatedAt);
      return data;
    }
    const request = (pathname, token, options = {}) => fetch(`${base}${pathname}`, {
      ...options, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), Origin: base, ...options.headers },
    });
    async function status(pathname, token, expected, options = {}) {
      const response = await request(pathname, token, options);
      assert.equal(response.status, expected, `${pathname}: ${await response.text()}`);
    }
    await status(list, null, 401);
    await status(management, null, 401);
    await status(management, member, 403);
    await status(management, member, 403, { method: 'POST', body: form() });
    await status(list, member, 405, { method: 'POST', body: form() });
    await status(management, admin, 403, { method: 'POST', body: form(), headers: { Origin: 'https://evil.example' } });
    for (const externalUrl of ['javascript:alert(1)', `${base}/member`, 'https://cqaiclub.asia/projects/', 'https://cqaiclub.asia./', 'https://name:password@example.org/', '/relative-link']) {
      await status(management, admin, 400, { method: 'POST', body: form({ externalUrl }) });
    }
    await status(management, admin, 400, { method: 'POST', body: form({ description: ' ' }) });
    await status(management, admin, 400, { method: 'POST', body: form({ imageBytes: null }) });
    await status(management, admin, 400, { method: 'POST', body: form({ imageBytes: Buffer.from('<svg onload="alert(1)"></svg>') }) });
    await status(management, admin, 400, { method: 'POST', body: form({ imageBytes: Buffer.alloc(5 * 1024 * 1024 + 1) }) });
    assert.equal(await db.memberResource.count(), 0);
    const created = await request(management, admin, { method: 'POST', body: form() });
    assert.equal(created.status, 201, await created.clone().text());
    const draft = await created.json();
    const editPath = `${management}/${draft.id}`;
    assert.equal((await (await request(list, member)).json()).total, 0);
    await status(draft.imageUrl, null, 401);
    await status(draft.imageUrl, member, 403);
    const memberImage = `/member/api/resources/${draft.id}/image`;
    await status(memberImage, member, 404);
    const draftImage = await request(draft.imageUrl, admin);
    assert.equal(draftImage.status, 200);
    assert.match(draftImage.headers.get('cache-control'), /private.*no-store/);
    const metadata = await sharp(Buffer.from(await draftImage.arrayBuffer())).metadata();
    assert.equal(metadata.format, 'jpeg'); assert.equal(metadata.width, 40); assert.equal(metadata.height, 80);
    await status(editPath, member, 403, { method: 'PATCH', body: form({ updatedAt: draft.updatedAt, published: true }) });
    const updated = await request(editPath, admin, { method: 'PATCH', body: form({ published: true, updatedAt: draft.updatedAt, imageBytes: null }) });
    assert.equal(updated.status, 200, await updated.clone().text());
    const published = await updated.json();
    const publishedList = await request(list, member);
    assert.match(publishedList.headers.get('cache-control'), /private.*no-store/);
    const memberList = await publishedList.json();
    assert.equal(memberList.total, 1);
    assert.equal(memberList.data[0].imageUrl.split('?')[0], memberImage);
    assert.equal(memberList.data[0].externalUrl, 'https://example.org/learning?code=abc');
    assert.ok(!('imageStorageKey' in memberList.data[0]));
    await status(memberImage, member, 200);
    await status(published.imageUrl, member, 403);
    await status(editPath, admin, 409, { method: 'PATCH', body: form({ updatedAt: draft.updatedAt, description: 'stale edit' }) });
    const originalKey = (await db.memberResource.findUnique({ where: { id: draft.id } })).imageStorageKey;
    const replace = await request(editPath, admin, { method: 'PATCH', body: form({ updatedAt: published.updatedAt, published: true, description: '替换后的详细介绍' }) });
    assert.equal(replace.status, 200, await replace.clone().text());
    const replaced = await replace.json();
    assert.equal(fs.existsSync(path.join(storage, 'uploads/resources', originalKey)), false);
    await status(editPath, admin, 409, { method: 'DELETE', body: JSON.stringify({ updatedAt: published.updatedAt }), headers: { 'Content-Type': 'application/json' } });
    const down = await request(editPath, admin, { method: 'PATCH', body: form({ published: false, imageBytes: null, updatedAt: replaced.updatedAt }) });
    assert.equal(down.status, 200);
    const unpublished = await down.json();
    assert.equal((await (await request(list, member)).json()).total, 0);
    await status(memberImage, member, 404);
    await status(editPath, admin, 200, { method: 'DELETE', body: JSON.stringify({ updatedAt: unpublished.updatedAt }), headers: { 'Content-Type': 'application/json' } });
    assert.equal(fs.readdirSync(path.join(storage, 'uploads/resources')).length, 0);
    assert.equal(await db.memberResource.count(), 0);
    await status(memberImage, member, 404);
    for (let i = 0; i < 13; i++) await db.memberResource.create({ data: { description: String(i), externalUrl: 'https://example.org/', imageStorageKey: 'missing.jpg', published: true } });
    const second = await (await request(`${list}?page=2`, member)).json();
    assert.equal(second.data.length, 1); assert.equal(second.total, 13); assert.equal(second.totalPages, 2);
    const overflow = await (await request(`${list}?page=99999`, member)).json();
    assert.equal(overflow.page, 2);
    membershipMock.members.delete('ci-member');
    await status(list, member, 403);
    await status(memberImage, member, 403);
    await status(list, admin, 403, { headers: { 'X-Innovation-Member': 'true' } });
    await status(management, admin, 200);
    membershipMock.members.add('ci-member');
    membershipMock.setAvailable(false);
    await status(list, member, 503);
    membershipMock.setAvailable(true);
    await status(list, member, 200);
    const pageIds = (await (await request(list, member)).json()).data.map(item => item.id);
    assert.ok(!pageIds.includes(second.data[0].id));
    for (const pathname of ['/member/dashboard/resources', '/member/dashboard/admin/resources']) {
      const page = await fetch(`${base}${pathname}`, { redirect: 'manual' });
      assert.equal(page.status, 307); assert.match(page.headers.get('location'), /member\/(sign-in|login)/);
      assert.equal(new URL(page.headers.get('location'), base).searchParams.get('returnTo'), pathname);
    }
    console.log('Member resources smoke test passed: authentication, organization access and revocation, admin-only writes/previews, origin and content validation, private images, draft isolation, publish/unpublish, edits, conflicts, deletion and pagination.');
  } catch (error) {
    console.error(output.slice(-5000)); throw error;
  } finally {
    if (app && app.exitCode === null) { app.kill('SIGTERM'); await new Promise(resolve => { app.once('exit', resolve); setTimeout(resolve, 1500); }); }
    if (membershipMock) await membershipMock.close();
    await db.$disconnect();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
