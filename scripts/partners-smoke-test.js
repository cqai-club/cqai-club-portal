/* eslint-disable @typescript-eslint/no-require-imports -- isolated Node integration test */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const management = '/member/api/admin/partners';
// These are the public names present before partner management was introduced.
// Keep this fixture independent of the new migration and runtime renderer.
const originalGroups = [
  ['高校/科研院所', 'Universities and Research Institutes', [
    ['重庆大学', 'Chongqing University'], ['西南大学', 'Southwest University'],
    ['北京大学重庆大数据研究院', 'Chongqing Big Data Research Institute, Peking University'],
    ['重庆医科大学', 'Chongqing Medical University'],
    ['重庆邮电大学', 'Chongqing University of Posts and Telecommunications'],
    ['重庆工商大学', 'Chongqing Technology and Business University'],
    ['重庆建筑工程职业学院', 'Chongqing Jianzhu College'],
  ]],
  ['企业', 'Companies', [
    ['七腾机器人', 'SEVNCE Robotics'], ['重庆九城数字科技', 'Chongqing Jiucheng Digital Technology'],
    ['智联理园(重庆)科技', 'Zhilian Liyuan (Chongqing) Technology'],
    ['海工核投科技', 'Haigong Hetou Technology'], ['重庆嘉誉澜庭茶楼', 'Chongqing Jiayu Lanting Tea House'],
  ]],
  ['行业协会', 'Industry Associations', [
    ['重庆MBA企业家联合会·AI专委会', 'AI Committee, Chongqing MBA Entrepreneurs Federation'],
    ['重庆市大数据与人工智能产业协会', 'Chongqing Big Data and Artificial Intelligence Industry Association'],
  ]],
  ['云平台', 'Cloud Platforms', [
    ['阿里云', 'Alibaba Cloud'], ['腾讯云', 'Tencent Cloud'], ['华为云', 'Huawei Cloud'],
    ['豆包AI', 'Doubao AI'], ['深度求索', 'DeepSeek'], ['混元', 'Hunyuan'],
  ]],
];

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer(); server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port; server.close(() => resolve(port));
    });
  });
}

const escapeHtml = value => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cqai-partners-'));
  const databasePath = path.join(directory, 'partners.db');
  fs.writeFileSync(databasePath, '');
  const databaseUrl = `file:${databasePath}`;
  const tokens = Object.fromEntries(['admin', 'editor', 'member'].map(role => [role, randomBytes(32).toString('hex')]));
  const port = await availablePort();
  const base = `http://127.0.0.1:${port}`;
  let app; let output = '';

  function migrate() {
    const result = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
      cwd: root, encoding: 'utf8', env: { ...process.env, DATABASE_URL: databaseUrl },
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }
  async function start(ciBypass = true) {
    output = '';
    app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port)], {
      cwd: root,
      env: {
        ...process.env, DATABASE_URL: databaseUrl, CQAI_STORAGE_ROOT: path.join(directory, 'storage'),
        NODE_ENV: 'production', CI: ciBypass ? 'true' : 'false',
        CQAI_CI_AUTH_BYPASS: 'enabled-for-smoke-tests', CQAI_CI_ADMIN_TOKEN: tokens.admin,
        CQAI_CI_EDITOR_TOKEN: tokens.editor, CQAI_CI_AUTHENTICATED_TOKEN: tokens.member,
        LOGTO_ENDPOINT: 'http://127.0.0.1:1', LOGTO_APP_ID: 'partners-smoke',
        LOGTO_APP_SECRET: 'partners-smoke', LOGTO_COOKIE_SECRET: 'partners-smoke-cookie-secret-0123456789',
        BASE_URL_PROD: base, BASE_URL_DEV: base,
      }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    app.stdout.on('data', bytes => { output += String(bytes); });
    app.stderr.on('data', bytes => { output += String(bytes); });
    for (let attempt = 0; attempt < 100; attempt += 1) {
      assert.equal(app.exitCode, null, output);
      try { if ((await fetch(`${base}/api/health`)).ok) return; } catch { /* Starting */ }
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    throw new Error(`Partner test server startup timeout: ${output}`);
  }
  async function stop() {
    const child = app;
    app = undefined;
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    await new Promise(resolve => {
      const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
      child.kill('SIGTERM');
    });
  }
  async function request(pathname, role = 'admin', method = 'GET', body, headers = {}) {
    const response = await fetch(`${base}${pathname}`, {
      method, redirect: 'manual', signal: AbortSignal.timeout(15000),
      headers: { ...(role ? { Authorization: `Bearer ${tokens[role]}` } : {}),
        Origin: base, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return response;
  }
  async function check(pathname, expected, role = 'admin', method = 'GET', body, headers) {
    const response = await request(pathname, role, method, body, headers);
    const allowed = Array.isArray(expected) ? expected : [expected];
    assert.ok(allowed.includes(response.status), `${method} ${pathname}: expected ${allowed}, got ${response.status}: ${await response.clone().text()}`);
    return response;
  }
  async function list() {
    const response = await check(management, 200);
    assert.match(response.headers.get('cache-control'), /no-store/);
    return (await response.json()).groups;
  }
  const findGroup = async id => (await list()).find(group => group.id === id);
  const findPartner = async id => (await list()).flatMap(group => group.partners).find(partner => partner.id === id);
  async function home() {
    const response = await check('/', 200, null);
    const html = await response.text();
    const section = html.match(/<section\b[^>]*\bid=["']partners["'][^>]*>([\s\S]*?)<\/section>/i)?.[1];
    assert.ok(section, 'homepage keeps the partners section');
    assert.doesNotMatch(section, /\b(?:revision|createdAt|updatedAt|actorIssuer|actorSub)\b/,
      'public partner HTML must not disclose management metadata');
    return section;
  }
  function bilingual(html, zh, en) {
    assert.ok(html.includes(`data-home-zh="${escapeHtml(zh)}"`), `homepage Chinese name: ${zh}`);
    assert.ok(html.includes(`data-home-en="${escapeHtml(en)}"`), `homepage English name: ${en}`);
  }

  try {
    migrate();
    await start();
    let groups = await list();
    assert.equal(groups.length, 4, 'migration preserves four existing groups');
    assert.equal(groups.flatMap(group => group.partners).length, 20, 'migration imports each partner once');
    assert.equal(new Set(groups.flatMap(group => group.partners).map(partner => partner.id)).size, 20);
    for (const [zh, en, names] of originalGroups) {
      const group = groups.find(item => item.nameZh === zh);
      assert.ok(group, `existing group preserved: ${zh}`);
      assert.equal(group.nameEn, en); assert.equal(group.enabled, true);
      assert.deepEqual(group.partners.map(partner => [partner.nameZh, partner.nameEn]), names);
      assert.ok(group.partners.every(partner => partner.enabled));
    }
    let html = await home();
    for (const [zh, en, names] of originalGroups) {
      bilingual(html, zh, en);
      for (const [partnerZh, partnerEn] of names) bilingual(html, partnerZh, partnerEn);
    }
    assert.match(html, /class="v-marquee"/); assert.match(html, /class="v-track"/);
    assert.match(html, /aria-hidden="true"/, 'duplicate marquee track remains decorative');

    const first = groups[0]; const firstPartner = first.partners[0];
    const protectedOperations = [
      [management, 'GET'], [management, 'POST'], [`${management}/${firstPartner.id}`, 'PATCH'],
      [`${management}/${firstPartner.id}`, 'DELETE'], [`${management}/groups`, 'POST'],
      [`${management}/groups/${first.id}`, 'PATCH'], [`${management}/groups/${first.id}`, 'DELETE'],
    ];
    for (const [pathname, method] of protectedOperations) {
      for (const [role, status] of [[null, 401], ['member', 403], ['editor', 403]]) {
        await check(pathname, status, role, method, method === 'GET' ? undefined : {});
      }
    }
    await check(`${management}/groups`, 403, 'admin', 'POST', {}, { Origin: 'https://untrusted.example' });
    await check(`${management}/groups`, 403, 'admin', 'POST', {}, { Origin: '' });
    await check(`${management}/groups`, 415, 'admin', 'POST', {}, { 'Content-Type': 'text/plain' });
    await check(`${management}/groups`, 413, 'admin', 'POST', { nameZh: '甲'.repeat(20000) });
    await check(`${management}/${firstPartner.id}`, 400, 'admin', 'PATCH', { nameZh: '缺少版本号' });
    await check(`${management}/${firstPartner.id}`, 400, 'admin', 'DELETE', {});
    await check(`${management}/groups/${first.id}`, 400, 'admin', 'PATCH', { nameZh: '缺少分组版本号' });
    await check(`${management}/groups/${first.id}`, 400, 'admin', 'DELETE', {});
    for (const body of [
      { nameZh: ' ', nameEn: 'Empty name', sortOrder: 1, enabled: true },
      { nameZh: '甲'.repeat(101), nameEn: 'Long name', sortOrder: 1, enabled: true },
      { nameZh: '错误顺序', nameEn: 'Invalid order', sortOrder: -1, enabled: true },
      { nameZh: '错误顺序', nameEn: 'Invalid order', sortOrder: 10001, enabled: true },
      { nameZh: '错误顺序', nameEn: 'Invalid order', sortOrder: 1.5, enabled: true },
      { nameZh: '未知字段', nameEn: 'Unknown field', sortOrder: 1, enabled: true, admin: true },
    ]) await check(`${management}/groups`, 400, 'admin', 'POST', body);
    for (const url of ['javascript:alert(1)', 'data:text/html,test', 'file:///tmp/file', '/relative', 'https://name:password@example.org/']) {
      await check(management, 400, 'admin', 'POST', {
        groupId: first.id, nameZh: '无效链接', nameEn: 'Invalid link', url, sortOrder: 1, enabled: true,
      });
    }
    await check(management, 404, 'admin', 'POST', {
      groupId: 'missing-partner-group', nameZh: '不存在的分组', nameEn: 'Missing group', url: null, sortOrder: 1, enabled: true,
    });
    assert.equal((await list()).length, 4, 'rejected requests leave existing groups untouched');

    const groupBody = { nameZh: '合作伙伴验证分组', nameEn: 'Partner validation group', sortOrder: 9999, enabled: true };
    const createdGroup = (await (await check(`${management}/groups`, 201, 'admin', 'POST', groupBody)).json()).group;
    assert.ok(createdGroup?.id);
    const secondGroup = (await (await check(`${management}/groups`, 201, 'admin', 'POST', {
      ...groupBody, nameZh: '合作伙伴验证迁移组', nameEn: 'Partner validation move group', sortOrder: 10000,
    })).json()).group;
    const firstBody = { groupId: createdGroup.id, nameZh: '新增合作伙伴验证甲', nameEn: 'Partner validation Alpha',
      url: 'https://example.org/partners?a=1&b=2', sortOrder: 20, enabled: true };
    const created = (await (await check(management, 201, 'admin', 'POST', firstBody)).json()).partner;
    const beta = (await (await check(management, 201, 'admin', 'POST', {
      ...firstBody, nameZh: '新增合作伙伴验证乙', nameEn: 'Partner validation Beta', url: null, sortOrder: 10,
    })).json()).partner;
    assert.ok(created?.id && beta?.id);
    await check(`${management}/groups/${createdGroup.id}`, 409, 'admin', 'DELETE', {
      revision: (await findGroup(createdGroup.id)).revision,
    });
    html = await home();
    bilingual(html, firstBody.nameZh, firstBody.nameEn);
    assert.ok(html.includes('href="https://example.org/partners?a=1&amp;b=2"'), 'homepage preserves escaped partner website links');
    const linkedTracks = Array.from(html.matchAll(/<div\b([^>]*\bclass="v-group"[^>]*)>([\s\S]*?)<\/div>/g))
      .filter(([, , content]) => content.includes('href="https://example.org/partners?a=1&amp;b=2"'));
    assert.equal(linkedTracks.length, 2, 'linked partner appears in both marquee copies');
    assert.equal(linkedTracks.filter(([, attributes]) => /\baria-hidden="true"/.test(attributes)).length, 1,
      'only the duplicate marquee copy is hidden from assistive technology');
    for (const [, attributes, content] of linkedTracks) {
      const duplicate = /\baria-hidden="true"/.test(attributes);
      for (const [link] of content.matchAll(/<a\b[^>]*>/g)) {
        if (duplicate) assert.match(link, /\btabindex="-1"/, 'decorative marquee links stay outside the keyboard tab order');
        else assert.doesNotMatch(link, /\btabindex="-\d+"/, 'original partner links remain keyboard focusable');
      }
    }
    assert.doesNotMatch(html, /\binert(?:\s|=|>)/, 'marquee copies must remain clickable with a pointer');
    assert.ok(html.indexOf('新增合作伙伴验证乙') < html.indexOf('新增合作伙伴验证甲'), 'partner ordering follows saved order');

    const injection = '<script id="partner-injection">alert(1)</script>';
    const changed = (await (await check(`${management}/${created.id}`, 200, 'admin', 'PATCH', {
      revision: created.revision, nameZh: '保存后的合作伙伴 & "验证"', nameEn: injection, url: null, sortOrder: 5,
    })).json()).partner;
    await check(`${management}/${created.id}`, 409, 'admin', 'PATCH', { revision: created.revision, nameZh: '旧版本覆盖' });
    await check(`${management}/${created.id}`, 409, 'admin', 'DELETE', { revision: created.revision });
    html = await home();
    bilingual(html, changed.nameZh, injection);
    assert.doesNotMatch(html, /<script\b[^>]*id=["']partner-injection/i, 'partner names cannot inject executable markup');
    assert.ok(!html.includes(firstBody.nameZh), 'saved edit replaces old partner name without rebuilding');
    assert.ok(html.indexOf(escapeHtml(changed.nameZh)) < html.indexOf('新增合作伙伴验证乙'), 'updated sort order takes effect');

    let current = (await (await check(`${management}/${created.id}`, 200, 'admin', 'PATCH', {
      revision: changed.revision, enabled: false,
    })).json()).partner;
    assert.ok(!(await home()).includes(escapeHtml(current.nameZh)), 'disabled partners are absent from public HTML and seeds');
    current = (await (await check(`${management}/${created.id}`, 200, 'admin', 'PATCH', {
      revision: current.revision, enabled: true,
    })).json()).partner;

    let group = await findGroup(createdGroup.id);
    const oldGroupRevision = group.revision;
    group = (await (await check(`${management}/groups/${group.id}`, 200, 'admin', 'PATCH', {
      revision: group.revision, nameZh: '保存后的合作伙伴分组', nameEn: 'Updated partner group', enabled: false,
    })).json()).group;
    await check(`${management}/groups/${group.id}`, 409, 'admin', 'PATCH', { revision: oldGroupRevision, nameZh: '旧组名覆盖' });
    await check(`${management}/groups/${group.id}`, 409, 'admin', 'DELETE', { revision: oldGroupRevision });
    html = await home();
    assert.ok(!html.includes(escapeHtml(current.nameZh)) && !html.includes('新增合作伙伴验证乙'), 'disabled group hides every child partner');
    group = (await (await check(`${management}/groups/${group.id}`, 200, 'admin', 'PATCH', {
      revision: group.revision, enabled: true,
    })).json()).group;
    bilingual(await home(), group.nameZh, group.nameEn);

    const moved = (await (await check(`${management}/${beta.id}`, 200, 'admin', 'PATCH', {
      revision: (await findPartner(beta.id)).revision, groupId: secondGroup.id,
    })).json()).partner;
    assert.equal(moved.groupId, secondGroup.id);
    assert.equal((await findGroup(group.id)).partners.length, 1);
    assert.equal((await findGroup(secondGroup.id)).partners.length, 1);
    await check(`${management}/groups/${secondGroup.id}`, 200, 'admin', 'PATCH', {
      revision: (await findGroup(secondGroup.id)).revision, sortOrder: 9998,
    });
    html = await home();
    assert.ok(html.indexOf('合作伙伴验证迁移组') < html.indexOf('保存后的合作伙伴分组'), 'group ordering follows saved order');

    await stop();
    migrate();
    await start();
    assert.equal((await list()).flatMap(item => item.partners).length, 22, 'restarting and rerunning migrations preserve saved partners without reseeding duplicates');
    assert.equal((await findPartner(created.id)).nameZh, current.nameZh, 'saved partner edits survive process restart');
    bilingual(await home(), current.nameZh, injection);

    for (const partnerId of [created.id, beta.id]) {
      await check(`${management}/${partnerId}`, 200, 'admin', 'DELETE', { revision: (await findPartner(partnerId)).revision });
      await check(`${management}/${partnerId}`, 404, 'admin', 'DELETE', { revision: 0 });
    }
    for (const groupId of [createdGroup.id, secondGroup.id]) {
      await check(`${management}/groups/${groupId}`, 200, 'admin', 'DELETE', { revision: (await findGroup(groupId)).revision });
    }
    groups = await list();
    assert.equal(groups.length, 4); assert.equal(groups.flatMap(item => item.partners).length, 20);
    html = await home();
    assert.ok(!html.includes(escapeHtml(current.nameZh)) && !html.includes('新增合作伙伴验证乙'), 'deleted records disappear publicly');

    const page = await request('/member/dashboard/admin/partners', null);
    assert.equal(page.status, 307, 'anonymous users cannot enter the partner management page');
    assert.match(page.headers.get('location'), /member\/(?:sign-in|login)/);

    // An intentionally empty catalogue must remain empty. Reusing the legacy
    // template here would silently republish partners an administrator removed.
    for (const existingGroup of groups) {
      for (const partner of existingGroup.partners) {
        await check(`${management}/${partner.id}`, 200, 'admin', 'DELETE', { revision: partner.revision });
      }
      await check(`${management}/groups/${existingGroup.id}`, 200, 'admin', 'DELETE', {
        revision: (await findGroup(existingGroup.id)).revision,
      });
    }
    assert.equal((await list()).length, 0);
    html = await home();
    for (const [, , names] of originalGroups) {
      for (const [zh] of names) assert.ok(!html.includes(zh), `empty catalogue must not restore deleted partner: ${zh}`);
    }
    await stop();
    await start(false);
    await check(management, 401, 'admin');
    console.log('Partners smoke test passed: four-group migration, admin-only CRUD, origin and input validation, revisions, group moves, persistence, SSR refresh, ordering, visibility, bilingual content and escaped output.');
  } catch (error) {
    console.error(output.slice(-5000)); throw error;
  } finally {
    await stop();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
