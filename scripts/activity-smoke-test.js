/* eslint-disable @typescript-eslint/no-require-imports -- this Node smoke test is CommonJS */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { generateKeyPair, exportJWK, SignJWT } = require('jose');
const sharp = require('sharp');
const { PrismaClient } = require('@prisma/client');

const projectRoot = path.resolve(__dirname, '..');

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

async function waitForServer(baseUrl, child) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Activity app exited: ${child.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/api/v1/activities`);
      if (response.ok) return;
    } catch { /* Server still starting. */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('Activity app did not become ready');
}

async function main() {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'cqai-activities-'));
  const databasePath = path.join(tempDirectory, 'activities.db');
  fs.writeFileSync(databasePath, '');
  const databaseUrl = `file:${databasePath}`;
  const prismaCli = path.join(projectRoot, 'node_modules/prisma/build/index.js');
  const migrate = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy', '--schema', path.join(projectRoot, 'prisma/schema.prisma')], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
  assert.equal(migrate.status, 0, migrate.stderr || migrate.stdout);

  const { privateKey, publicKey } = await generateKeyPair('ES384');
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'activity-smoke';
  jwk.alg = 'ES384';
  const jwksServer = http.createServer((request, response) => {
    if (request.url !== '/oidc/jwks') { response.writeHead(404).end(); return; }
    response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ keys: [jwk] }));
  });
  const jwksPort = await listen(jwksServer);
  const issuer = `http://127.0.0.1:${jwksPort}/oidc`;
  const appPort = await availablePort();
  const baseUrl = `http://127.0.0.1:${appPort}`;
  const app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(appPort)], {
    cwd: projectRoot,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      LOGTO_ENDPOINT: `http://127.0.0.1:${jwksPort}`,
      LOGTO_APP_ID: 'activity-smoke-web',
      LOGTO_APP_SECRET: 'activity-smoke-secret',
      LOGTO_COOKIE_SECRET: 'activity-smoke-cookie-secret-0123456789',
      BASE_URL_PROD: baseUrl,
      NODE_ENV: 'production',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let appOutput = '';
  app.stdout.on('data', chunk => { appOutput += String(chunk); });
  app.stderr.on('data', chunk => { appOutput += String(chunk); });

  const audience = 'https://cqaiclub.asia/';
  const sign = (sub, scope, tokenAudience = audience) => new SignJWT({ client_id: 'activity-smoke-desktop', scope, name: sub })
    .setProtectedHeader({ alg: 'ES384', kid: 'activity-smoke' })
    .setIssuer(issuer)
    .setAudience(tokenAudience)
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
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });
    const body = response.status === 204 ? null : await response.json();
    return { status: response.status, body };
  }

  try {
    await waitForServer(baseUrl, app);
    const managerA = await sign('manager-a', 'openid activity:publish');
    const managerB = await sign('manager-b', 'openid activity:publish');
    const memberA = await sign('member-a', 'openid');
    const memberB = await sign('member-b', 'openid');
    const wrongAudience = await sign('member-c', 'openid', 'https://account.cqaiclub.asia');

    assert.equal((await request('/api/v1/activities')).body.items.length, 0);
    assert.equal((await request('/api/v1/me/activity-registrations')).status, 401);
    assert.equal((await request('/api/v1/me/activity-registrations', { token: wrongAudience })).status, 401);

    const now = Date.now();
    const startsAt = new Date(now + 3 * 86_400_000).toISOString();
    const input = {
      title: '活动接口联调', summary: '报名和权限回归验证', content: '## 活动议程\n\n- 主题分享\n- 现场交流',
      mode: 'offline', location: '重庆', startsAt,
      endsAt: new Date(now + 3 * 86_400_000 + 2 * 3_600_000).toISOString(),
      registrationOpensAt: new Date(now - 3_600_000).toISOString(),
      registrationClosesAt: new Date(now + 2 * 86_400_000).toISOString(),
      capacity: 1,
    };
    assert.equal((await request('/api/v1/activities', { method: 'POST', token: memberA, body: input })).status, 403);
    const created = await request('/api/v1/activities', { method: 'POST', token: managerA, body: input });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.id;
    assert.equal(created.body.status, 'draft');
    assert.equal((await request(`/api/v1/activities/${id}`)).status, 404);

    const coverBytes = await sharp({ create: { width: 64, height: 40, channels: 3, background: '#6d28d9' } }).png().toBuffer();
    const coverBody = () => {
      const form = new FormData();
      form.append('cover', new Blob([coverBytes], { type: 'image/png' }), 'activity.png');
      return form;
    };
    const memberCover = await fetch(`${baseUrl}/api/v1/activities/${id}/cover`, {
      method: 'PUT', headers: { Authorization: `Bearer ${memberA}` }, body: coverBody(),
    });
    assert.equal(memberCover.status, 403);
    const coverUpload = await fetch(`${baseUrl}/api/v1/activities/${id}/cover`, {
      method: 'PUT', headers: { Authorization: `Bearer ${managerA}` }, body: coverBody(),
    });
    assert.equal(coverUpload.status, 200, await coverUpload.text());
    const withCover = (await request(`/api/v1/manage/activities/${id}`, { token: managerA })).body;
    assert.match(withCover.coverUrl, /^\/api\/v1\/activities\/[^/]+\/cover\?v=/);
    assert.equal((await fetch(`${baseUrl}${withCover.coverUrl}`)).status, 404);
    const draftCover = await fetch(`${baseUrl}${withCover.coverUrl}`, { headers: { Authorization: `Bearer ${managerA}` } });
    assert.equal(draftCover.status, 200);
    assert.equal(draftCover.headers.get('content-type'), 'image/jpeg');

    const published = await request(`/api/v1/activities/${id}/publish`, { method: 'POST', token: managerB });
    assert.equal(published.status, 200, JSON.stringify(published.body));
    assert.equal(published.body.status, 'published');
    assert.equal((await fetch(`${baseUrl}${withCover.coverUrl}`)).status, 200);
    assert.equal((await request('/api/v1/activities')).body.items.length, 1);
    const listingPage = await fetch(`${baseUrl}/activities`);
    assert.equal(listingPage.status, 200);
    const listingHtml = await listingPage.text();
    assert.ok(listingHtml.includes('活动接口联调'));
    assert.ok(listingHtml.includes(withCover.coverUrl));
    const detailPage = await fetch(`${baseUrl}/activities/${id}`);
    assert.equal(detailPage.status, 200);
    const detailHtml = await detailPage.text();
    assert.ok(detailHtml.includes('报名和权限回归验证'));
    assert.match(detailHtml, /<h2>活动议程<\/h2>/);
    assert.match(detailHtml, /<li>主题分享<\/li>/);
    assert.ok(detailHtml.includes(withCover.coverUrl));

    const simultaneous = await Promise.all([
      request(`/api/v1/activities/${id}/registration`, { method: 'POST', token: memberA }),
      request(`/api/v1/activities/${id}/registration`, { method: 'POST', token: memberB }),
    ]);
    assert.deepEqual(simultaneous.map(result => result.status).sort(), [200, 409], JSON.stringify(simultaneous));
    const winner = simultaneous[0].status === 200 ? memberA : memberB;
    const loser = simultaneous[0].status === 200 ? memberB : memberA;
    assert.equal((await request(`/api/v1/activities/${id}/registration`, { method: 'POST', token: winner })).body.alreadyRegistered, true);
    assert.equal((await request(`/api/v1/activities/${id}/registration`, { method: 'DELETE', token: winner })).status, 200);
    assert.equal((await request(`/api/v1/activities/${id}/registration`, { method: 'POST', token: loser })).status, 200);
    assert.equal((await request(`/api/v1/activities/${id}/registrations`, { token: memberA })).status, 403);
    assert.equal((await request(`/api/v1/activities/${id}/registrations`, { token: managerA })).body.items.length, 1);

    const edited = await request(`/api/v1/activities/${id}`, { method: 'PATCH', token: managerB, body: { ...input, title: '已更新的活动' } });
    assert.equal(edited.status, 200, JSON.stringify(edited.body));
    assert.equal(edited.body.title, '已更新的活动');
    assert.ok(edited.body.detailsChangedAt);
    assert.equal((await request(`/api/v1/activities/${id}`, { method: 'DELETE', token: memberA })).status, 403);
    assert.equal((await request(`/api/v1/activities/${id}`, { method: 'DELETE', token: managerB })).status, 204);
    assert.equal((await request(`/api/v1/activities/${id}`)).status, 404);
    const mine = await request('/api/v1/me/activity-registrations', { token: loser });
    assert.equal(mine.body.items[0].activity.deletedAt !== null, true);
    const repeatActivity = await request('/api/v1/activities', { method: 'POST', token: managerA, body: { ...input, capacity: 2 } });
    assert.equal(repeatActivity.status, 201);
    assert.equal((await request(`/api/v1/activities/${repeatActivity.body.id}/publish`, { method: 'POST', token: managerA })).status, 200);
    const repeated = await Promise.all([
      request(`/api/v1/activities/${repeatActivity.body.id}/registration`, { method: 'POST', token: memberA }),
      request(`/api/v1/activities/${repeatActivity.body.id}/registration`, { method: 'POST', token: memberA }),
    ]);
    assert.deepEqual(repeated.map(result => result.status), [200, 200], JSON.stringify(repeated));
    assert.equal((await request(`/api/v1/activities/${repeatActivity.body.id}`)).body.registeredCount, 1);
    const draftA = await request('/api/v1/activities', { method: 'POST', token: managerA, body: { ...input, title: '分页验证甲' } });
    const draftB = await request('/api/v1/activities', { method: 'POST', token: managerA, body: { ...input, title: '分页验证乙' } });
    assert.equal(draftA.status, 201);
    assert.equal(draftB.status, 201);
    const firstPage = await request('/api/v1/manage/activities?page=1&limit=2', { token: managerA });
    const secondPage = await request('/api/v1/manage/activities?page=2&limit=2', { token: managerA });
    assert.equal(firstPage.status, 200);
    assert.equal(firstPage.body.total, 3);
    assert.equal(firstPage.body.totalPages, 2);
    assert.equal(firstPage.body.items.length, 2);
    assert.equal(secondPage.body.items.length, 1);
    assert.equal(new Set([...firstPage.body.items, ...secondPage.body.items].map(item => item.id)).size, 3);
    const filteredPage = await request('/api/v1/manage/activities?status=draft&search=分页验证乙', { token: managerA });
    assert.equal(filteredPage.body.total, 1);
    assert.equal(filteredPage.body.items[0].id, draftB.body.id);
    assert.equal((await request('/api/v1/manage/activities?status=active', { token: managerA })).body.total, 1);
    assert.equal((await request('/api/v1/manage/activities?page=0', { token: managerA })).status, 400);

    const recapActivity = await request('/api/v1/activities', { method: 'POST', token: managerA, body: { ...input, title: '回顾流程验证' } });
    assert.equal(recapActivity.status, 201);
    const recapId = recapActivity.body.id;
    const recapCoverUpload = await fetch(`${baseUrl}/api/v1/activities/${recapId}/cover`, {
      method: 'PUT', headers: { Authorization: `Bearer ${managerA}` }, body: coverBody(),
    });
    assert.equal(recapCoverUpload.status, 200, await recapCoverUpload.text());
    const recapCoverUrl = (await request(`/api/v1/manage/activities/${recapId}`, { token: managerA })).body.coverUrl;
    assert.equal((await request(`/api/v1/activities/${recapId}/publish`, { method: 'POST', token: managerA })).status, 200);
    const recapForm = (content, keepImageIds = [], withImage = false) => {
      const form = new FormData();
      form.set('title', '');
      form.set('summary', '');
      form.set('content', content);
      form.set('keepImageIds', JSON.stringify(keepImageIds));
      if (withImage) form.append('images', new Blob([coverBytes], { type: 'image/png' }), 'recap.png');
      return form;
    };
    const recapContent = '## 现场亮点\n\n- 智能体应用讨论\n- 产品实践与合作计划';
    const prematureRecap = await fetch(`${baseUrl}/api/v1/activities/${recapId}/recap`, {
      method: 'PUT', headers: { Authorization: `Bearer ${managerA}` }, body: recapForm(recapContent),
    });
    assert.equal(prematureRecap.status, 409);

    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    try {
      await db.clubActivity.update({
        where: { id: recapId },
        data: {
          startsAt: new Date(now - 3 * 86_400_000),
          endsAt: new Date(now - 3 * 86_400_000 + 2 * 3_600_000),
          registrationOpensAt: new Date(now - 6 * 86_400_000),
          registrationClosesAt: new Date(now - 4 * 86_400_000),
        },
      });
    } finally {
      await db.$disconnect();
    }

    assert.equal((await request(`/api/v1/activities/${recapId}/recap`)).status, 404);
    const memberRecap = await fetch(`${baseUrl}/api/v1/activities/${recapId}/recap`, {
      method: 'PUT', headers: { Authorization: `Bearer ${memberA}` }, body: recapForm(recapContent),
    });
    assert.equal(memberRecap.status, 403);
    const invalidRecap = await fetch(`${baseUrl}/api/v1/activities/${recapId}/recap`, {
      method: 'PUT', headers: { Authorization: `Bearer ${managerA}` }, body: recapForm('超'.repeat(20_001)),
    });
    assert.equal(invalidRecap.status, 400);
    const imageOnlyRecap = await fetch(`${baseUrl}/api/v1/activities/${recapId}/recap`, {
      method: 'PUT', headers: { Authorization: `Bearer ${managerA}` }, body: recapForm(''),
    });
    assert.equal(imageOnlyRecap.status, 200, await imageOnlyRecap.clone().text());
    const cardRecap = await imageOnlyRecap.json();
    assert.equal(cardRecap.title, '回顾流程验证');
    assert.equal(cardRecap.summary, input.summary);
    assert.equal(cardRecap.content, '');
    assert.equal(cardRecap.images.length, 0);
    assert.ok(cardRecap.publishedAt);
    assert.equal((await request(`/api/v1/activities/${recapId}/recap`)).status, 404);
    const cardPage = await fetch(`${baseUrl}/events/`);
    assert.equal(cardPage.status, 200);
    const cardHtml = await cardPage.text();
    assert.ok(cardHtml.includes(recapCoverUrl));
    assert.ok(cardHtml.includes('回顾流程验证'));
    assert.ok(!cardHtml.includes(`/events/recaps/${recapId}/`));
    assert.ok(!cardHtml.includes('阅读图文回顾'));
    assert.equal((await fetch(`${baseUrl}/events/recaps/${recapId}/`)).status, 404);

    const recapUpload = await fetch(`${baseUrl}/api/v1/activities/${recapId}/recap`, {
      method: 'PUT', headers: { Authorization: `Bearer ${managerA}` }, body: recapForm(recapContent, [], true),
    });
    assert.equal(recapUpload.status, 200, await recapUpload.clone().text());
    const recap = await recapUpload.json();
    assert.equal(recap.title, '回顾流程验证');
    assert.equal(recap.summary, input.summary);
    assert.ok(recap.publishedAt);
    assert.equal(recap.images.length, 1);
    assert.equal((await request(`/api/v1/activities/${recapId}/recap`)).status, 200);
    const recapImage = await fetch(`${baseUrl}${recap.images[0].url}`);
    assert.equal(recapImage.status, 200);
    assert.equal(recapImage.headers.get('content-type'), 'image/jpeg');
    const historyPage = await fetch(`${baseUrl}/events/`);
    assert.equal(historyPage.status, 200);
    const historyHtml = await historyPage.text();
    assert.ok(historyHtml.includes('回顾流程验证'));
    assert.ok(historyHtml.includes(`/events/recaps/${recapId}/`));
    assert.ok(historyHtml.includes('阅读图文回顾'));
    const recapPage = await fetch(`${baseUrl}/events/recaps/${recapId}/`);
    assert.equal(recapPage.status, 200);
    const recapHtml = await recapPage.text();
    assert.match(recapHtml, /<h2>现场亮点<\/h2>/);
    assert.match(recapHtml, /<li>智能体应用讨论<\/li>/);

    const recapEdited = await fetch(`${baseUrl}/api/v1/activities/${recapId}/recap`, {
      method: 'PUT', headers: { Authorization: `Bearer ${managerB}` }, body: recapForm('', []),
    });
    assert.equal(recapEdited.status, 200, await recapEdited.clone().text());
    const clearedRecap = await recapEdited.json();
    assert.equal(clearedRecap.content, '');
    assert.equal(clearedRecap.images.length, 0);
    assert.equal((await request(`/api/v1/activities/${recapId}/recap`)).status, 404);
    assert.equal((await fetch(`${baseUrl}/events/recaps/${recapId}/`)).status, 404);
    assert.equal((await fetch(`${baseUrl}${recap.images[0].url}`)).status, 404);
    assert.equal((await request(`/api/v1/activities/${recapId}`, { method: 'DELETE', token: managerA })).status, 204);
    assert.equal((await request(`/api/v1/activities/${recapId}/recap`)).status, 404);

    console.log('Club activities: bearer audience, manager pagination, cover upload, signup capacity, recap publishing and soft deletion passed.');
  } finally {
    app.kill('SIGTERM');
    await new Promise(resolve => app.once('exit', resolve));
    await new Promise(resolve => jwksServer.close(resolve));
    fs.rmSync(tempDirectory, { recursive: true, force: true });
    if (appOutput.includes('Error')) console.error(appOutput.slice(-2000));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
