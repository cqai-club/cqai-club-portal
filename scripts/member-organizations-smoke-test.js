/* eslint-disable @typescript-eslint/no-require-imports -- Node integration test */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');

async function main() {
  const root = path.resolve(__dirname, '..');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cqai-member-organizations-'));
  const databaseUrl = `file:${path.join(directory, 'members.db')}`;
  fs.writeFileSync(path.join(directory, 'members.db'), '');
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const organizations = new Map([['rar9vrcnuavh', { id: 'rar9vrcnuavh', name: '创新会员' }], ['replacement', { id: 'replacement', name: '新创新会员组织' }], ['partners', { id: 'partners', name: '合作会员' }]]);
  const users = ['ci-member', 'ci-editor', 'ci-super-admin', ...Array.from({ length: 25 }, (_, index) => `user-${index}`)].map(id => ({ id, name: `姓名 ${id}`, username: id, primaryEmail: `${id}@example.org`, primaryPhone: '13800000000', customData: { secret: 'must-not-leak' } }));
  const memberships = new Map([['rar9vrcnuavh', new Set(['user-0'])], ['replacement', new Set()], ['partners', new Set(['user-1'])]]);
  let mode = 'normal'; let unreadableUser = ''; let tokenRequests = 0; const writes = []; const removals = [];
  let app; let output = '';
  const mock = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const send = (status, body, headers = {}) => { response.writeHead(status, { 'Content-Type': 'application/json', ...headers }); response.end(JSON.stringify(body)); };
    if (url.pathname === '/oidc/token') {
      tokenRequests++;
      assert.equal(request.headers.authorization, `Basic ${Buffer.from('mock-client:mock-secret').toString('base64')}`);
      let body = ''; for await (const chunk of request) body += chunk;
      assert.equal(new URLSearchParams(body).get('resource'), 'https://default.logto.app/api');
      return send(200, { access_token: 'mock-management-token', expires_in: 3600 });
    }
    if (request.headers.authorization !== 'Bearer mock-management-token') return send(401, {});
    const userMatch = /^\/api\/users\/([^/]+)(\/organizations)?$/.exec(url.pathname);
    if (userMatch) {
      const user = users.find(item => item.id === userMatch[1]);
      if (!user) return send(404, {});
      if (userMatch[2]) {
        if (unreadableUser === user.id) return send(503, { secret: 'must-not-leak' });
        return send(200, [...memberships].filter(([, ids]) => ids.has(user.id)).map(([id]) => organizations.get(id)));
      }
      return send(200, user);
    }
    const removeMatch = /^\/api\/organizations\/([^/]+)\/users\/([^/]+)$/.exec(url.pathname);
    if (removeMatch) {
      assert.equal(request.method, 'DELETE');
      removals.push({ organizationId: removeMatch[1], userId: removeMatch[2] });
      if (mode === 'reject') return send(403, {});
      if (!memberships.get(removeMatch[1])?.delete(removeMatch[2])) return send(404, {});
      if (mode === 'unknown') unreadableUser = removeMatch[2];
      if (mode === 'response-error') return send(500, {});
      response.writeHead(204); return response.end();
    }
    const orgMatch = /^\/api\/organizations\/([^/]+)(\/users)?$/.exec(url.pathname);
    if (orgMatch && !organizations.has(orgMatch[1])) return send(404, {});
    if (orgMatch && !orgMatch[2]) return send(200, organizations.get(orgMatch[1]));
    if (orgMatch && request.method === 'POST') {
      let raw = ''; for await (const chunk of request) raw += chunk;
      const data = JSON.parse(raw); assert.deepEqual(Object.keys(data), ['userIds']);
      writes.push({ organizationId: orgMatch[1], userIds: data.userIds });
      if (mode === 'reject') return send(403, { secret: 'must-not-leak' });
      for (const id of data.userIds) memberships.get(orgMatch[1]).add(id);
      if (mode === 'unknown') unreadableUser = data.userIds[0];
      return send(mode === 'response-error' ? 500 : 201, {});
    }
    if (url.pathname === '/api/users' || orgMatch?.[2]) {
      assert.equal(request.method, 'GET', 'Organization membership must never use PUT replacement');
      const query = orgMatch ? url.searchParams.get('q') || '' : (url.searchParams.get('search') || '').replace(/^%|%$/g, '');
      const filtered = users.filter(user => (!orgMatch || memberships.get(orgMatch[1]).has(user.id)) && JSON.stringify(user).includes(query));
      const page = Number(url.searchParams.get('page')); const size = Number(url.searchParams.get('page_size'));
      assert.equal(size, 20);
      return send(200, filtered.slice((page - 1) * size, page * size), { 'Total-Number': String(filtered.length) });
    }
    return send(404, {});
  });
  try {
    const migration = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { cwd: root, encoding: 'utf8', env: { ...process.env, DATABASE_URL: databaseUrl } });
    assert.equal(migration.status, 0, migration.stderr || migration.stdout);
    await new Promise(resolve => mock.listen(0, '127.0.0.1', resolve));
    const mockBase = `http://127.0.0.1:${mock.address().port}`;
    const port = await new Promise(resolve => { const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); }); });
    const base = `http://127.0.0.1:${port}`;
    const admin = randomBytes(32).toString('hex'); const member = randomBytes(32).toString('hex');
    app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port)], { cwd: root,
      env: { ...process.env, DATABASE_URL: databaseUrl, NODE_ENV: 'production', CI: 'true', CQAI_CI_AUTH_BYPASS: 'enabled-for-smoke-tests',
        CQAI_CI_ADMIN_TOKEN: admin, CQAI_CI_AUTHENTICATED_TOKEN: member,
        LOGTO_ENDPOINT: mockBase, LOGTO_APP_ID: 'mock-app', LOGTO_APP_SECRET: 'mock-app', LOGTO_M2M_CLIENT_ID: 'mock-client', LOGTO_M2M_CLIENT_SECRET: 'mock-secret',
        LOGTO_COOKIE_SECRET: 'mock-cookie-secret-0123456789abcdef', BASE_URL_PROD: base, BASE_URL_DEV: base }, stdio: ['ignore', 'pipe', 'pipe'] });
    app.stdout.on('data', value => { output += value; }); app.stderr.on('data', value => { output += value; });
    for (let i = 0; i < 100; i++) {
      assert.equal(app.exitCode, null, output);
      try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* Starting */ }
      if (i === 99) throw new Error('Server startup timeout');
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    const prefix = '/member/api/admin/member-settings';
    const request = (pathname, token = admin, method = 'GET', data, headers = {}) => fetch(`${base}${pathname}`, { method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), Origin: base, ...(data === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, body: data === undefined ? undefined : JSON.stringify(data) });
    async function check(pathname, status = 200, token = admin, method = 'GET', data, headers) {
      const response = await request(pathname, token, method, data, headers); const result = await response.json();
      assert.equal(response.status, status, `${pathname}: ${JSON.stringify(result)}`);
      assert.ok(!JSON.stringify(result).includes('must-not-leak'));
      return result;
    }
    const bindings = `${prefix}/organizations`;
    const members = `${prefix}/members?bindingId=innovation`;
    const protectedRequests = [
      ['/member/api/resources'], ['/member/api/resources/missing/image'],
      ['/member/api/project-submissions'], ['/member/api/project-submissions/missing'],
      ['/member/api/project-submissions/missing/cover'],
      ['/member/api/project-submissions', 'POST'], ['/member/api/project-submissions/missing', 'PATCH'],
      ['/api/collection-submissions', 'POST'],
    ];
    async function deniedContent(status, token = member) {
      const membership = await check('/member/api/membership', status === 503 ? 503 : 200, token);
      if (status !== 503) assert.deepEqual(membership, { innovationMember: false });
      for (const [pathname, method = 'GET'] of protectedRequests) {
        await check(pathname, status, token, method, method === 'GET' ? undefined : { userSub: 'user-0', organizationId: 'rar9vrcnuavh' });
      }
    }
    async function allowedContent() {
      assert.deepEqual(await check('/member/api/membership', 200, member), { innovationMember: true });
      await check('/member/api/resources', 200, member);
      await check('/member/api/project-submissions', 200, member);
    }
    await deniedContent(401, null);
    await deniedContent(503); // Seeded but unverified configuration must fail closed.
    await check(bindings, 401, null); await check(bindings, 403, member);
    await check(`${prefix}/members`, 403, member, 'POST', {});
    await check(`${prefix}/verify`, 403, admin, 'POST', { organizationId: 'rar9vrcnuavh' }, { Origin: 'https://evil.example' });
    const seed = (await check(bindings)).data[0];
    assert.equal(seed.organizationId, 'rar9vrcnuavh'); assert.equal(seed.validatedAt, null);
    await check(members, 409); await check(`${prefix}/verify`, 404, admin, 'POST', { organizationId: 'missing' });
    await check(`${prefix}/verify`, 200, admin, 'POST', { organizationId: seed.organizationId });
    assert.equal((await check(bindings)).data[0].validatedAt, null, 'Verification alone must not save the binding');
    await check(bindings, 200, admin, 'PATCH', { id: seed.id, name: seed.name, organizationId: seed.organizationId, revision: 0 });
    await check(bindings, 409, admin, 'PATCH', { id: seed.id, name: seed.name, organizationId: seed.organizationId, revision: 0 });
    await check(bindings, 409, admin, 'POST', { name: '重复', organizationId: seed.organizationId });
    const partner = (await check(bindings, 201, admin, 'POST', { name: '合作会员', organizationId: 'partners' })).binding;
    let binding = (await check(bindings)).data.find(row => row.id === 'innovation');
    await deniedContent(403);
    await deniedContent(403, admin); // A global admin role does not grant member content.
    memberships.get('partners').add('ci-member');
    await deniedContent(403); // Another organization does not grant innovation membership.
    await check('/member/api/resources?organizationId=partners&userSub=user-0', 403, member, 'GET', undefined, { 'X-Innovation-Member': 'true' });
    await check('/member/api/admin/resources', 200, admin);
    const initial = await check(members); assert.equal(initial.total, 1); assert.equal(initial.data[0].id, 'user-0'); assert.equal(initial.data[0].joinedAt, null);
    const picker = await check(`${prefix}/users?bindingId=innovation`);
    assert.equal(picker.data.length, 20); assert.equal(picker.total, 28); assert.equal(picker.hasNext, true);
    assert.equal(picker.data.find(row => row.id === 'user-0').inOrganization, true);
    const second = await check(`${prefix}/users?bindingId=innovation&page=2`); assert.equal(second.data.length, 8); assert.equal(second.hasNext, false);
    const filtered = await check(`${prefix}/users?bindingId=innovation&q=user-24`); assert.equal(filtered.data.length, 1); assert.equal(filtered.data[0].id, 'user-24');
    await check(`${prefix}/users/user-1?bindingId=innovation`, 404);
    assert.equal((await check(`${prefix}/users/user-0?bindingId=innovation`)).user.primaryEmail, 'user-0@example.org');
    const add = (ids, revision = binding.revision) => ({ bindingId: 'innovation', revision, userIds: ids });
    await check(`${prefix}/members`, 400, admin, 'POST', add(['user-1', 'user-1']));
    await check(`${prefix}/members`, 400, admin, 'POST', add(users.slice(0, 21).map(row => row.id)));
    await check(`${prefix}/members`, 400, admin, 'POST', { ...add(['user-1']), organizationId: 'partners' });
    await check(`${prefix}/members`, 409, admin, 'POST', add(['user-1'], 0));
    const joined = await check(`${prefix}/members`, 200, admin, 'POST', add(['user-1', 'user-24']));
    assert.ok(joined.results.every(row => row.state === 'joined'));
    assert.equal(memberships.get('rar9vrcnuavh').size, 3); assert.ok(memberships.get('partners').has('user-1'));
    assert.ok((await check(members)).data.find(row => row.id === 'user-1').joinedAt);
    const writesBeforeRepeat = writes.length;
    await check(`${prefix}/members`, 200, admin, 'POST', add(['user-1'])); assert.equal(writes.length, writesBeforeRepeat);
    const detail = await check(`${prefix}/users/user-1?bindingId=innovation`); assert.equal(detail.bindings.length, 2); assert.ok(detail.bindings.some(row => row.id === partner.id));
    const remove = (userId, revision = binding.revision) => ({ bindingId: binding.id, revision, userId });
    const oldJoinedAt = (await check(members)).data.find(row => row.id === 'user-1').joinedAt;
    await check(`${prefix}/members`, 401, null, 'DELETE', remove('user-1'));
    await check(`${prefix}/members`, 403, member, 'DELETE', remove('user-1'));
    await check(`${prefix}/members`, 403, admin, 'DELETE', remove('user-1'), { Origin: 'https://evil.example' });
    await check(`${prefix}/members`, 409, admin, 'DELETE', remove('user-1', 0));
    await check(`${prefix}/members`, 400, admin, 'DELETE', { ...remove('user-1'), organizationId: 'partners' });
    await check(`${prefix}/members`, 404, admin, 'DELETE', remove('nonexistent'));
    assert.equal(removals.length, 0);
    mode = 'reject';
    const removeFailed = await check(`${prefix}/members`, 503, admin, 'DELETE', remove('user-1')); assert.equal(removeFailed.code, 'REMOVAL_FAILED');
    assert.ok(memberships.get('rar9vrcnuavh').has('user-1'));
    mode = 'unknown';
    const removeUnknown = await check(`${prefix}/members`, 503, admin, 'DELETE', remove('user-1')); assert.equal(removeUnknown.code, 'REMOVAL_UNKNOWN');
    mode = 'normal'; unreadableUser = ''; const removalsBeforeRepeat = removals.length;
    await check(`${prefix}/members`, 200, admin, 'DELETE', remove('user-1')); assert.equal(removals.length, removalsBeforeRepeat);
    assert.ok(memberships.get('partners').has('user-1'), 'Removal must preserve other organization memberships');
    assert.ok(users.some(user => user.id === 'user-1'), 'Removal must preserve the Logto account');
    assert.ok(!(await check(members)).data.some(row => row.id === 'user-1'));
    assert.equal((await check(`${prefix}/users?bindingId=innovation&q=user-1`)).data.find(row => row.id === 'user-1').inOrganization, false);
    await check(`${prefix}/members`, 200, admin, 'POST', add(['user-1']));
    assert.ok((await check(members)).data.find(row => row.id === 'user-1').joinedAt > oldJoinedAt, 'Rejoining must refresh the confirmed join time');
    mode = 'response-error';
    await check(`${prefix}/members`, 200, admin, 'DELETE', remove('user-24')); mode = 'normal';
    assert.ok(memberships.get('rar9vrcnuavh').has('user-0'), 'Removing one member must preserve other members');
    const writesBeforeSubmission = writes.length;
    const form = { name: '申请人', phone: '19900000001', wechat: 'smoke', email: '', organization: '测试单位', title: '开发者', orgType: '民营企业',
      orgTypeOther: '', provideRes: ['AI技术/算法能力'], provideResOther: '', needRes: ['技术合伙人/开发团队'], needResOther: '', purpose: '拓展人脉/寻找合作机会', purposeOther: '',
      events: ['AI技术沙龙/讲座'], eventsOther: '', timePref: '周六下午', city: '重庆主城', cityOther: '', roleIntent: '暂时不考虑', bio: '', privacy: '暂不公开' };
    const submitted = await check('/member/api/application', 201, member, 'POST', { ...form, reviewStatus: 'approved', userSub: 'user-5' });
    const applicationId = submitted.application.id;
    assert.equal(submitted.application.reviewStatus, 'pending'); assert.equal(writes.length, writesBeforeSubmission);
    const stored = await db.memberApplication.findUnique({ where: { id: applicationId } }); assert.equal(stored.userSub, 'ci-member');
    const reviewPath = id => `${prefix}/applications/${id}/review`;
    const review = (action, extra = {}) => ({ action, bindingRevision: binding.revision, bindingOrganizationId: binding.organizationId, ...extra });
    await check(reviewPath(applicationId), 403, member, 'POST', review('approve'));
    await check(reviewPath(applicationId), 400, admin, 'POST', { action: 'approve' });
    mode = 'reject';
    const failed = await check(reviewPath(applicationId), 200, admin, 'POST', review('approve', { reviewNote: '欢迎加入' }));
    assert.equal(failed.result.state, 'failed');
    const failedStored = await db.memberApplication.findUnique({ where: { id: applicationId } });
    assert.equal(failedStored.reviewStatus, 'approved'); assert.equal(failedStored.membershipState, 'failed'); assert.equal(failedStored.reviewedBySub, 'ci-super-admin');
    await deniedContent(403); // Approval alone does not grant content before actual joining.
    assert.ok(!memberships.get('rar9vrcnuavh').has('ci-super-admin'), 'Approval must target the applicant, not the reviewer');
    assert.equal((await check('/member/api/application', 200, member)).application.membershipActive, false);
    await check(reviewPath(applicationId), 409, admin, 'POST', review('approve'));
    mode = 'normal';
    const retry = await check(reviewPath(applicationId), 200, admin, 'POST', review('retry')); assert.equal(retry.result.state, 'joined');
    const own = (await check('/member/api/application', 200, member)).application;
    assert.equal(own.reviewNote, '欢迎加入'); assert.equal(own.membershipActive, true); assert.equal(own.membershipState, 'joined');
    await allowedContent();
    for (const key of ['membershipAttemptId', 'membershipOrganizationId', 'reviewedBySub', 'userSub', 'ipAddress']) assert.ok(!(key in own));
    await check(`${prefix}/members`, 200, admin, 'DELETE', remove('ci-member'));
    assert.equal((await check('/member/api/application', 200, member)).application.membershipActive, false);
    await deniedContent(403); // Previously approved/joined records cannot retain revoked access.
    assert.ok(memberships.get('partners').has('ci-member'));
    mode = 'unknown';
    const unknown = await check(reviewPath(applicationId), 200, admin, 'POST', review('retry')); assert.equal(unknown.result.state, 'unknown');
    assert.equal((await check('/member/api/application', 200, member)).application.membershipActive, null);
    await deniedContent(503); // Upstream uncertainty must not expose content or trust local state.
    unreadableUser = ''; mode = 'normal'; const countBeforeConfirm = writes.length;
    assert.equal((await check(reviewPath(applicationId), 200, admin, 'POST', review('retry'))).result.state, 'joined'); assert.equal(writes.length, countBeforeConfirm);
    await allowedContent();
    let index = 0;
    async function createApplication(userSub, extra = {}) {
      return db.memberApplication.create({ data: { name: '测试申请', phone: `18800000${String(index++).padStart(3, '0')}`, wechat: 'smoke', organization: '测试单位', title: '开发者', orgType: '民营企业',
        provideResources: '[]', needResources: '[]', joinPurpose: '合作', expectEvents: '[]', timePreference: '周六下午', city: '重庆', roleIntent: '暂不考虑', privacyPreference: '暂不公开', userIssuer: 'ci', userSub, ...extra } });
    }
    const legacy = await createApplication(null, { userIssuer: null }); await check(reviewPath(legacy.id), 409, admin, 'POST', review('approve'));
    await check(reviewPath(legacy.id), 200, admin, 'POST', { action: 'reject', reviewNote: '请登录后重新申请' });
    assert.equal((await db.memberApplication.findUnique({ where: { id: legacy.id } })).reviewStatus, 'rejected');
    const foreign = await createApplication('user-7', { userIssuer: 'https://foreign.invalid/oidc' }); await check(reviewPath(foreign.id), 409, admin, 'POST', review('approve'));
    const concurrent = await createApplication('user-8');
    const approvals = await Promise.all([request(reviewPath(concurrent.id), admin, 'POST', review('approve')), request(reviewPath(concurrent.id), admin, 'POST', review('approve'))]);
    assert.deepEqual(approvals.map(response => response.status).sort(), [200, 409]);
    assert.equal(writes.filter(row => row.userIds.includes('user-8')).length, 1);
    const staleProcessing = await createApplication('user-9', { reviewStatus: 'approved', membershipState: 'processing', membershipStartedAt: new Date(), membershipOrganizationId: binding.organizationId, membershipAttemptId: 'old-attempt' });
    await check(reviewPath(staleProcessing.id), 409, admin, 'POST', review('retry'));
    await db.memberApplication.update({ where: { id: staleProcessing.id }, data: { membershipStartedAt: new Date(Date.now() - 130000) } });
    mode = 'response-error'; assert.equal((await check(reviewPath(staleProcessing.id), 200, admin, 'POST', review('retry'))).result.state, 'joined'); mode = 'normal';
    await check(bindings, 409, admin, 'PATCH', { id: binding.id, name: binding.name, organizationId: 'replacement', revision: binding.revision });
    await check(bindings, 200, admin, 'PATCH', { id: binding.id, name: binding.name, organizationId: 'replacement', revision: binding.revision, confirmChange: true });
    await check(reviewPath(applicationId), 409, admin, 'POST', review('retry'));
    binding = (await check(bindings)).data.find(row => row.id === 'innovation');
    await deniedContent(403); // Access immediately follows the current saved organization.
    await check(reviewPath(applicationId), 409, admin, 'POST', review('retry'));
    assert.equal((await check('/member/api/application', 200, member)).application.membershipActive, false);
    assert.equal((await check(reviewPath(applicationId), 200, admin, 'POST', review('retry', { confirmOrganizationChange: true }))).result.state, 'joined');
    assert.ok(memberships.get('rar9vrcnuavh').has('ci-member')); assert.ok(memberships.get('replacement').has('ci-member'));
    await allowedContent();
    assert.equal(tokenRequests, 1, 'Concurrent requests should share a cached M2M token');
    const page = await fetch(`${base}/member/dashboard/admin/member-settings`, { redirect: 'manual' });
    assert.equal(page.status, 307); assert.match(page.headers.get('location'), /member\/(sign-in|login)/);
    console.log('Member organization tests passed: admin authorization, verified versioned bindings, existing-user pagination/filtering, additive membership, scoped removal and retry, applicant identity, approval/rejection, concurrent review, failure/unknown recovery, expired attempts, organization-change confirmation and resource/project access following actual membership.');
  } catch (error) {
    console.error(output.slice(-4000)); throw error;
  } finally {
    if (app && app.exitCode === null) { app.kill('SIGTERM'); await new Promise(resolve => { app.once('exit', resolve); setTimeout(resolve, 1500); }); }
    await new Promise(resolve => mock.close(resolve)); await db.$disconnect(); fs.rmSync(directory, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
