/* eslint-disable @typescript-eslint/no-require-imports -- this Node smoke test is CommonJS */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawn, spawnSync } = require('node:child_process');
const { generateKeyPair, exportJWK, SignJWT } = require('jose');
const { PrismaClient } = require('@prisma/client');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

const projectRoot = path.resolve(__dirname, '..');
const expectedTools = [
  'club_list_activities', 'club_get_activity', 'club_list_managed_activities',
  'club_get_managed_activity', 'club_prepare_activity', 'club_create_activity',
  'club_update_activity', 'club_publish_activity', 'club_register_activity',
  'club_cancel_registration', 'club_my_registrations', 'club_activity_registrations',
  'club_submit_plugin', 'club_my_plugin_submissions', 'club_get_plugin_submission',
  'club_review_plugin_submission', 'club_publish_market_plugin',
  'club_update_market_plugin', 'club_list_plugin_submissions',
  'club_validate_plugin_package',
];

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

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

async function waitForServer(baseUrl, child) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`MCP portal exited: ${child.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/api/v1/activities`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch { /* Server still starting. */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('MCP portal did not become ready');
}

async function stopApp(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise(resolve => child.once('exit', resolve));
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
  child.kill('SIGTERM');
  await exited;
  clearTimeout(timer);
}

function toolPayload(result) {
  assert.ok(result.structuredContent && typeof result.structuredContent === 'object', JSON.stringify(result));
  assert.equal(result.content[0]?.type, 'text', JSON.stringify(result));
  assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
  return result.structuredContent;
}

async function call(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 15_000 });
  const payload = toolPayload(result);
  assert.notEqual(result.isError, true, `${name}: ${JSON.stringify(payload)}`);
  return payload;
}

async function toolError(client, name, args, expectedCode) {
  let result;
  try {
    result = await client.callTool({ name, arguments: args }, undefined, { timeout: 15_000 });
  } catch (error) {
    if (expectedCode !== 'MCP_PERMISSION_REQUIRED') throw error;
    assert.ok(error.code === 403 || /\b403\b/.test(String(error)), String(error));
    return { code: expectedCode };
  }
  assert.equal(result.isError, true, `${name}: ${JSON.stringify(result)}`);
  const payload = toolPayload(result);
  assert.equal(typeof payload.code, 'string');
  assert.equal(typeof payload.error, 'string');
  if (expectedCode) assert.equal(payload.code, expectedCode, JSON.stringify(payload));
  return payload;
}

function assertActivityLink(activity, id, baseUrl) {
  assert.equal(activity.id, id);
  const publicUrl = `${baseUrl}/activities/${encodeURIComponent(id)}`;
  const manageUrl = `${baseUrl}/member/dashboard/admin/activities`;
  assert.equal(activity.manageUrl, manageUrl);
  const visible = activity.status === 'published' || activity.status === 'cancelled';
  assert.equal(activity.url, visible ? publicUrl : manageUrl);
  assert.equal(activity.publicUrl, visible ? publicUrl : null);
  assert.equal(typeof activity.status, 'string');
}

function assertOperation(payload, requestKey, replayed) {
  assert.equal(typeof payload.operation?.id, 'string', JSON.stringify(payload));
  assert.equal(payload.operation.requestKey, requestKey);
  assert.equal(payload.operation.replayed, replayed);
  assert.equal(typeof payload.operation.completedAt, 'string');
  assert.ok(Number.isFinite(Date.parse(payload.operation.completedAt)));
}

function assertReplay(original, replay) {
  assertOperation(original, original.operation.requestKey, false);
  assertOperation(replay, original.operation.requestKey, true);
  assert.equal(replay.id, original.id);
  assert.equal(replay.status, original.status);
  assert.equal(replay.operation.id, original.operation.id);
  assert.equal(replay.operation.completedAt, original.operation.completedAt);
}

async function main() {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'cqai-mcp-'));
  const databasePath = path.join(tempDirectory, 'mcp.db');
  fs.writeFileSync(databasePath, '');
  const databaseUrl = `file:${databasePath}`;
  let app;
  let jwksServer;
  let db;
  let appOutput = '';
  const clients = [];
  try {
    const migrate = spawnSync(process.execPath, [
      'node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma',
    ], {
      cwd: projectRoot,
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });
    assert.equal(migrate.status, 0, migrate.stderr || migrate.stdout);
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

    const { privateKey, publicKey } = await generateKeyPair('ES384');
    const jwk = await exportJWK(publicKey);
    jwk.kid = 'mcp-smoke';
    jwk.alg = 'ES384';
    jwksServer = http.createServer((request, response) => {
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      if (pathname === '/oidc/jwks') {
        response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ keys: [jwk] }));
      } else if (pathname === '/registry/@cqai/mcp-smoke-fixture/latest') {
        response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({
          name: '@cqai/mcp-smoke-fixture', version: '1.0.0',
          dist: {
            tarball: `http://127.0.0.1:${jwksServer.address().port}/registry/fixture.tgz`,
            integrity: 'sha512-smokefixture',
          },
        }));
      } else if (pathname === '/registry/fixture.tgz') {
        response.writeHead(200, { 'Content-Type': 'application/octet-stream' }).end('isolated smoke fixture');
      } else {
        response.writeHead(404, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Package not found' }));
      }
    });
    const jwksPort = await listen(jwksServer);
    const issuer = `http://127.0.0.1:${jwksPort}/oidc`;
    const appPort = await availablePort();
    const baseUrl = `http://127.0.0.1:${appPort}`;
    const resource = `${baseUrl}/mcp`;
    app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(appPort)], {
      cwd: projectRoot,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        LOGTO_ENDPOINT: `http://127.0.0.1:${jwksPort}`,
        LOGTO_APP_ID: 'mcp-smoke-web',
        LOGTO_APP_SECRET: 'mcp-smoke-secret',
        LOGTO_COOKIE_SECRET: 'mcp-smoke-cookie-secret-0123456789',
        BASE_URL_PROD: baseUrl,
        BASE_URL_DEV: baseUrl,
        CQAI_MCP_RESOURCE: resource,
        CQAI_MCP_ADMIN_TOOLS_ENABLED: 'true',
        CQAI_MCP_NPM_REGISTRY_URL: `http://127.0.0.1:${jwksPort}/registry/`,
        CQAI_CI_AUTH_BYPASS: 'disabled',
        NODE_ENV: 'production',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    app.stdout.on('data', chunk => { appOutput += String(chunk); });
    app.stderr.on('data', chunk => { appOutput += String(chunk); });
    app.once('error', error => { appOutput += String(error); });
    await waitForServer(baseUrl, app);

    const sign = (sub, scope, options = {}) => new SignJWT({ client_id: 'mcp-smoke-desktop', scope, name: sub })
      .setProtectedHeader({ alg: 'ES384', kid: 'mcp-smoke' })
      .setIssuer(options.issuer || issuer)
      .setAudience(options.audience || resource)
      .setSubject(sub)
      .setIssuedAt()
      .setExpirationTime(options.expiration || '10m')
      .sign(privateKey);
    const memberToken = await sign('member-a', 'openid');
    const otherToken = await sign('member-b', 'openid');
    const publisherToken = await sign('publisher', 'openid activity:publish');
    const adminToken = await sign('admin', 'openid activity:publish plugin:admin');

    async function request(pathname, options = {}) {
      const response = await fetch(`${baseUrl}${pathname}`, {
        method: options.method || 'GET',
        headers: {
          ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...(options.headers || {}),
        },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
        signal: AbortSignal.timeout(15_000),
      });
      const text = await response.text();
      return { status: response.status, headers: response.headers, body: text ? JSON.parse(text) : null };
    }

    const initialize = {
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'mcp-smoke', version: '1' } },
    };
    const mcpHeaders = { Accept: 'application/json, text/event-stream' };
    const anonymous = await request('/mcp', { method: 'POST', body: initialize, headers: mcpHeaders });
    assert.equal(anonymous.status, 401, JSON.stringify(anonymous.body));
    assert.match(anonymous.headers.get('x-request-id'), /^[0-9a-f-]{36}$/);
    const challenge = anonymous.headers.get('www-authenticate');
    assert.match(challenge, /^Bearer /);
    const metadataMatch = /resource_metadata="([^"]+)"/.exec(challenge);
    assert.ok(metadataMatch, challenge);
    const metadataUrl = new URL(metadataMatch[1]);
    assert.equal(metadataUrl.origin, baseUrl);
    const metadata = await request(metadataUrl.pathname);
    assert.equal(metadata.status, 200, JSON.stringify(metadata.body));
    assert.equal(metadata.body.resource, resource);
    assert.ok(metadata.body.authorization_servers.includes(issuer));
    assert.ok(metadata.body.bearer_methods_supported.includes('header'));

    const invalidTokens = [
      await sign('wrong-audience', 'openid', { audience: 'https://account.cqaiclub.asia' }),
      await sign('rest-audience', 'openid', { audience: 'https://cqaiclub.asia/' }),
      await sign('expired', 'openid', { expiration: Math.floor(Date.now() / 1000) - 120 }),
      await sign('wrong-issuer', 'openid', { issuer: 'https://untrusted.invalid/oidc' }),
      'malformed-token',
    ];
    for (const token of invalidTokens) {
      const response = await request('/mcp', { method: 'POST', token, body: initialize, headers: mcpHeaders });
      assert.equal(response.status, 401, JSON.stringify(response.body));
      assert.match(response.headers.get('www-authenticate'), /resource_metadata=/);
    }
    const badOrigin = await request('/mcp', {
      method: 'POST', token: memberToken, body: initialize,
      headers: { ...mcpHeaders, Origin: 'https://untrusted.invalid' },
    });
    assert.equal(badOrigin.status, 403, JSON.stringify(badOrigin.body));

    async function connect(token) {
      const client = new Client({ name: 'cqai-mcp-smoke', version: '1.0.0' });
      const transport = new StreamableHTTPClientTransport(new URL(resource), {
        requestInit: { headers: { Authorization: `Bearer ${token}` } },
      });
      clients.push({ client, transport });
      await client.connect(transport, { timeout: 15_000 });
      return client;
    }
    const member = await connect(memberToken);
    const other = await connect(otherToken);
    const publisher = await connect(publisherToken);
    const admin = await connect(adminToken);
    const tools = await member.listTools();
    assert.deepEqual(tools.tools.map(tool => tool.name).sort(), [...expectedTools].sort());
    for (const tool of tools.tools) {
      assert.equal(tool.inputSchema.type, 'object', tool.name);
    }
    const unknown = await member.callTool({ name: 'club_unknown_tool', arguments: {} }).then(
      result => ({ result }), error => ({ error }),
    );
    if (unknown.error) {
      assert.equal(unknown.error.code, -32602, String(unknown.error));
    } else {
      assert.equal(unknown.result.isError, true);
      assert.equal(typeof toolPayload(unknown.result).code, 'string');
    }
    assert.equal((await call(member, 'club_list_activities', { limit: 10 })).items.length, 0);
    await toolError(member, 'club_list_managed_activities', { page: 1, limit: 20 }, 'MCP_PERMISSION_REQUIRED');

    const article = '# 重庆 AI 实践交流\n\n分享智能体产品实践与俱乐部合作经验。\n\n## 议程\n\n- 主题分享\n- 现场交流';
    const source = { key: 'smoke-article-1', url: 'https://example.invalid/articles/1', title: '重庆 AI 实践交流' };
    const prepared = await call(publisher, 'club_prepare_activity', { article, source });
    assert.ok(Array.isArray(prepared.missingFields) && prepared.missingFields.length > 0, JSON.stringify(prepared));
    assert.ok(prepared.missingFields.includes('startsAt'), JSON.stringify(prepared));
    assert.equal(await db.clubActivity.count(), 0, 'Preparing an article must not create an activity');

    const now = Date.now();
    const input = {
      title: '重庆 AI 实践交流', summary: '通过远程 MCP 创建并核对官网展示', content: article,
      mode: 'offline', location: '重庆测试会场',
      startsAt: new Date(now + 3 * 86_400_000).toISOString(),
      endsAt: new Date(now + 3 * 86_400_000 + 2 * 3_600_000).toISOString(),
      registrationOpensAt: new Date(now - 3_600_000).toISOString(),
      registrationClosesAt: new Date(now + 2 * 86_400_000).toISOString(),
      capacity: 3,
    };
    await toolError(member, 'club_create_activity', { input, source, requestKey: 'member-denied' }, 'MCP_PERMISSION_REQUIRED');
    const createDenied = await request('/mcp', {
      method: 'POST', token: memberToken, headers: mcpHeaders,
      body: { jsonrpc: '2.0', id: 2, method: 'tools/call', params: {
        name: 'club_create_activity', arguments: { input, source, requestKey: 'raw-member-denied' },
      } },
    });
    assert.equal(createDenied.status, 403, JSON.stringify(createDenied.body));
    assert.match(createDenied.headers.get('www-authenticate'), /error="insufficient_scope"/);
    assert.match(createDenied.headers.get('www-authenticate'), /scope="activity:publish"/);
    await toolError(publisher, 'club_create_activity', { input, source });
    const createArgs = { input, source, requestKey: 'create-activity-1' };
    const concurrentCreates = await Promise.all([
      call(publisher, 'club_create_activity', createArgs),
      call(publisher, 'club_create_activity', createArgs),
    ]);
    assert.deepEqual(concurrentCreates.map(item => item.operation.replayed).sort(), [false, true]);
    const created = concurrentCreates.find(item => !item.operation.replayed);
    assertOperation(created, createArgs.requestKey, false);
    assertReplay(created, concurrentCreates.find(item => item.operation.replayed));
    assertActivityLink(created, created.id, baseUrl);
    assert.equal(created.status, 'draft');
    assert.equal(created.content, article);
    assertReplay(created, await call(publisher, 'club_create_activity', createArgs));
    await toolError(publisher, 'club_create_activity', {
      ...createArgs, input: { ...input, title: '同请求键不能换内容' },
    }, 'IDEMPOTENCY_CONFLICT');
    const reusedSources = await Promise.all([
      call(publisher, 'club_create_activity', { ...createArgs, requestKey: 'create-source-other-key-a' }),
      call(publisher, 'club_create_activity', {
        ...createArgs, requestKey: 'create-source-other-key-b', input: { ...input, title: '同文章来源不同草稿内容' },
      }),
    ]);
    for (const [index, duplicatePayload] of reusedSources.entries()) {
      assert.equal(duplicatePayload.id, created.id);
      assert.equal(duplicatePayload.sourceReused, true, 'A source reuse must be disclosed to the caller');
      assert.equal(duplicatePayload.title, input.title, 'A source retry with new content must preserve the original activity');
      assertOperation(duplicatePayload, `create-source-other-key-${index === 0 ? 'a' : 'b'}`, false);
    }
    assert.equal(await db.clubActivity.count(), 1, 'Source and request retries must not create duplicate activities');
    const managed = await call(publisher, 'club_get_managed_activity', { id: created.id });
    assert.equal(managed.id, created.id);
    const managedList = await call(publisher, 'club_list_managed_activities', {
      page: 1, limit: 20, status: 'draft', search: input.title,
    });
    assert.equal(managedList.items.length, 1);
    assert.equal(managedList.items[0].id, created.id);
    await toolError(member, 'club_get_managed_activity', { id: created.id }, 'MCP_PERMISSION_REQUIRED');

    const updatedInput = { ...input, summary: '通过 MCP 更新后的活动摘要' };
    await toolError(publisher, 'club_update_activity', { id: created.id, input: updatedInput });
    const updateArgs = { id: created.id, input: updatedInput, requestKey: 'update-activity-1' };
    const updated = await call(publisher, 'club_update_activity', updateArgs);
    assertOperation(updated, updateArgs.requestKey, false);
    assert.equal(updated.summary, updatedInput.summary);
    const updateReplay = await call(publisher, 'club_update_activity', updateArgs);
    assertReplay(updated, updateReplay);
    assert.equal(updateReplay.updatedAt, updated.updatedAt);
    await toolError(member, 'club_update_activity', { ...updateArgs, requestKey: 'update-denied' }, 'MCP_PERMISSION_REQUIRED');
    const publishArgs = { id: created.id, requestKey: 'publish-activity-1' };
    await toolError(publisher, 'club_publish_activity', { id: created.id });
    await toolError(member, 'club_publish_activity', { ...publishArgs, requestKey: 'publish-denied' }, 'MCP_PERMISSION_REQUIRED');
    const published = await call(publisher, 'club_publish_activity', publishArgs);
    assertOperation(published, publishArgs.requestKey, false);
    assertActivityLink(published, created.id, baseUrl);
    assert.equal(published.status, 'published');
    assert.ok(published.publishedAt);
    const publishReplay = await call(publisher, 'club_publish_activity', publishArgs);
    assertReplay(published, publishReplay);
    assert.equal(publishReplay.publishedAt, published.publishedAt);
    assert.equal((await call(publisher, 'club_publish_activity', {
      ...publishArgs, requestKey: 'publish-activity-new-key',
    })).publishedAt, published.publishedAt);
    const publicActivity = await request(`/api/v1/activities/${created.id}`);
    assert.equal(publicActivity.status, 200);
    assert.equal(publicActivity.body.content, article);
    assert.equal(publicActivity.body.summary, updatedInput.summary);
    assert.equal(publicActivity.body.publishedAt, published.publishedAt);
    const publicPage = await fetch(published.publicUrl, { signal: AbortSignal.timeout(15_000) });
    assert.equal(publicPage.status, 200);
    const publicHtml = await publicPage.text();
    assert.ok(publicHtml.includes(input.title));
    assert.match(publicHtml, /<h2>议程<\/h2>/);
    assert.match(publicHtml, /<li>主题分享<\/li>/);
    for (const action of ['create', 'update', 'publish']) {
      assert.equal(await db.clubActivityAudit.count({ where: { activityId: created.id, action } }), 1, `${action} retries must not duplicate audit events`);
    }
    assert.equal((await call(member, 'club_get_activity', { id: created.id })).id, created.id);
    assert.equal((await call(member, 'club_list_activities', { limit: 10 })).items[0].id, created.id);

    const bridgeDirectory = path.join(projectRoot, 'packages/cqai-club-mcp-bridge');
    const { readConfig, TokenStore } = await import(pathToFileURL(path.join(bridgeDirectory, 'bridge.mjs')).href);
    const bridgeEnv = {
      CQAI_MCP_URL: resource,
      CQAI_MCP_ISSUER: issuer,
      CQAI_MCP_CLIENT_ID: 'smoke-native',
      CQAI_MCP_REDIRECT_URI: 'http://127.0.0.1:41887/callback',
      CQAI_MCP_STATE_DIR: path.join(tempDirectory, 'bridge'),
    };
    const bridgeConfig = readConfig(bridgeEnv);
    await new TokenStore(bridgeConfig).save({
      version: 1, binding: bridgeConfig.binding,
      tokens: { access_token: memberToken, token_type: 'Bearer', issuer, expires_in: 600 },
      expiresAt: Date.now() + 600_000,
    });
    const bridgeClient = new Client({ name: 'cqai-mcp-stdio-smoke', version: '1.0.0' });
    const bridgeTransport = new StdioClientTransport({
      command: process.execPath,
      args: [path.join(bridgeDirectory, 'cli.mjs'), 'serve'],
      env: { ...process.env, ...bridgeEnv },
      cwd: projectRoot,
      stderr: 'pipe',
    });
    let bridgeOutput = '';
    bridgeTransport.stderr.on('data', chunk => { bridgeOutput += String(chunk); });
    clients.push({ client: bridgeClient, transport: bridgeTransport });
    await bridgeClient.connect(bridgeTransport, { timeout: 15_000 });
    assert.equal(typeof bridgeTransport.pid, 'number', 'The stdio bridge must run as a real child process');
    const bridgeTools = await bridgeClient.listTools();
    assert.deepEqual(bridgeTools.tools.map(tool => tool.name).sort(), [...expectedTools].sort());
    const throughBridge = await call(bridgeClient, 'club_get_activity', { id: created.id });
    assertActivityLink(throughBridge, created.id, baseUrl);
    assert.equal(throughBridge.content, article);
    assert.equal(throughBridge.summary, updatedInput.summary);
    assert.equal(throughBridge.publishedAt, published.publishedAt);
    assert.ok(!bridgeOutput.includes(memberToken), 'Bridge diagnostics must not expose its saved access token');

    if (process.env.CQAI_MCP_V2_CLIENT_MODULE) {
      const clientModule = process.env.CQAI_MCP_V2_CLIENT_MODULE;
      assert.ok(path.isAbsolute(clientModule), 'The optional SDK v2 module must use an explicit absolute path');
      const { Client: V2Client, StreamableHTTPClientTransport: V2Transport } = require(clientModule);
      const v2Client = new V2Client({ name: 'cqai-mcp-v2-smoke', version: '1.0.0' }, {
        capabilities: {}, versionNegotiation: { mode: 'auto' },
      });
      const v2Transport = new V2Transport(new URL(resource), {
        requestInit: { headers: { Authorization: `Bearer ${memberToken}` } },
      });
      clients.push({ client: v2Client, transport: v2Transport });
      await v2Client.connect(v2Transport, { timeout: 15_000 });
      assert.equal(v2Client.getNegotiatedProtocolVersion(), '2025-11-25', 'SDK v2 auto negotiation must fall back to the supported legacy protocol');
      const v2Tools = await v2Client.listTools(undefined, { timeout: 15_000, cacheMode: 'refresh' });
      assert.deepEqual(v2Tools.tools.map(tool => tool.name).sort(), [...expectedTools].sort());
      const v2Result = await v2Client.callTool({ name: 'club_get_activity', arguments: { id: created.id } }, { timeout: 15_000 });
      assert.notEqual(v2Result.isError, true);
      const v2Activity = toolPayload(v2Result);
      assertActivityLink(v2Activity, created.id, baseUrl);
      assert.equal(v2Activity.content, article);
      assert.equal(v2Activity.summary, updatedInput.summary);
      console.log('Installed SDK v2 compatibility passed: protocol negotiation, tool discovery and activity readback.');
    }

    const registerArgs = { id: created.id, requestKey: 'register-member-1' };
    await toolError(member, 'club_register_activity', { id: created.id });
    const registered = await call(member, 'club_register_activity', registerArgs);
    assertOperation(registered, registerArgs.requestKey, false);
    assert.equal(registered.activityId, created.id);
    assert.equal(registered.registered, true);
    assert.equal(registered.status, 'confirmed');
    assert.equal(typeof registered.id, 'string');
    assert.equal(registered.url, `${baseUrl}/activities/${created.id}`);
    assertReplay(registered, await call(member, 'club_register_activity', registerArgs));
    await call(member, 'club_register_activity', { ...registerArgs, requestKey: 'register-member-new-key' });
    assert.equal((await request(`/api/v1/activities/${created.id}`)).body.registeredCount, 1);
    const mine = await call(member, 'club_my_registrations');
    assert.equal(mine.items.length, 1);
    assert.equal(mine.items[0].activity.id, created.id);
    assert.equal((await call(other, 'club_my_registrations')).items.length, 0);
    await toolError(member, 'club_activity_registrations', { id: created.id }, 'MCP_PERMISSION_REQUIRED');
    assert.equal((await call(admin, 'club_activity_registrations', { id: created.id })).items.length, 1);
    const cancelArgs = { id: created.id, requestKey: 'cancel-member-1' };
    await toolError(member, 'club_cancel_registration', { id: created.id });
    const cancelled = await call(member, 'club_cancel_registration', cancelArgs);
    assertOperation(cancelled, cancelArgs.requestKey, false);
    assert.equal(cancelled.activityId, created.id);
    assert.equal(cancelled.registered, false);
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(cancelled.id, registered.id);
    assert.equal(cancelled.url, registered.url);
    assertReplay(cancelled, await call(member, 'club_cancel_registration', cancelArgs));
    await call(member, 'club_cancel_registration', { ...cancelArgs, requestKey: 'cancel-member-new-key' });
    assert.equal((await request(`/api/v1/activities/${created.id}`)).body.registeredCount, 0);
    assert.equal((await call(member, 'club_my_registrations')).items[0].status, 'cancelled');

    const pluginInput = {
      packageName: '@cqai/mcp-smoke-fixture', displayName: 'MCP 投稿测试',
      summary: '离线 fixture 包名，校验投稿和市场发布状态', description: '## 插件说明\n\n这是一条隔离数据库测试记录。',
      categories: ['productivity'], keywords: ['cqai'],
      repositoryUrl: 'https://github.com/cqai/mcp-smoke-fixture', homepageUrl: '', iconUrl: '',
      compatibilityApiVersion: '', compatibilityHosts: [],
    };
    const checkedPackage = await call(member, 'club_validate_plugin_package', { packageName: pluginInput.packageName });
    assert.equal(checkedPackage.name, pluginInput.packageName);
    assert.equal(checkedPackage.version, '1.0.0');
    assert.equal(checkedPackage.tarballUrl, `http://127.0.0.1:${jwksPort}/registry/fixture.tgz`);
    assert.equal(checkedPackage.integrity, 'sha512-smokefixture');
    assert.ok(Number.isFinite(Date.parse(checkedPackage.checkedAt)));
    await toolError(member, 'club_validate_plugin_package', { packageName: '@cqai/mcp-missing-fixture' }, 'NPM_PACKAGE_NOT_FOUND');
    await toolError(member, 'club_submit_plugin', {
      input: { ...pluginInput, packageName: '@cqai/mcp-missing-fixture' }, requestKey: 'missing-package-submission',
    }, 'NPM_PACKAGE_NOT_FOUND');
    assert.equal(await db.pluginSubmission.count(), 0, 'A nonexistent npm package must not create a submission');
    await toolError(member, 'club_submit_plugin', { input: pluginInput });
    const submitArgs = { input: pluginInput, requestKey: 'submit-plugin-1' };
    const submitted = await call(member, 'club_submit_plugin', submitArgs);
    assertOperation(submitted, submitArgs.requestKey, false);
    assert.equal(typeof submitted.id, 'string');
    assert.equal(submitted.status, 'pending');
    assert.equal(submitted.marketStatus, null);
    assert.equal(typeof submitted.url, 'string');
    assert.equal(new URL(submitted.url).origin, baseUrl);
    assertReplay(submitted, await call(member, 'club_submit_plugin', submitArgs));
    await toolError(member, 'club_submit_plugin', {
      ...submitArgs, input: { ...pluginInput, summary: '重试键不能替换投稿内容' },
    }, 'IDEMPOTENCY_CONFLICT');
    assert.equal((await call(member, 'club_my_plugin_submissions')).items.length, 1);
    assert.equal((await call(other, 'club_my_plugin_submissions')).items.length, 0);
    assert.equal((await call(member, 'club_get_plugin_submission', { id: submitted.id })).marketStatus, null);
    await toolError(other, 'club_get_plugin_submission', { id: submitted.id });
    await toolError(admin, 'club_get_plugin_submission', { id: submitted.id });
    assert.equal(await db.pluginSubmission.count(), 1);
    const reviewArgs = { id: submitted.id, decision: 'approve', note: '隔离测试通过', requestKey: 'review-plugin-1' };
    await toolError(admin, 'club_review_plugin_submission', { id: submitted.id, decision: 'approve' });
    await toolError(member, 'club_review_plugin_submission', { ...reviewArgs, requestKey: 'review-denied' }, 'MCP_PERMISSION_REQUIRED');
    const reviewDenied = await request('/mcp', {
      method: 'POST', token: publisherToken, headers: mcpHeaders,
      body: { jsonrpc: '2.0', id: 3, method: 'tools/call', params: {
        name: 'club_review_plugin_submission', arguments: { ...reviewArgs, requestKey: 'raw-review-denied' },
      } },
    });
    assert.equal(reviewDenied.status, 403, JSON.stringify(reviewDenied.body));
    assert.match(reviewDenied.headers.get('www-authenticate'), /scope="plugin:admin"/);
    const pendingSubmissions = await call(admin, 'club_list_plugin_submissions', { status: 'pending', page: 1, limit: 20 });
    assert.equal(pendingSubmissions.data.length, 1);
    assert.equal(pendingSubmissions.data[0].id, submitted.id);
    const approved = await call(admin, 'club_review_plugin_submission', reviewArgs);
    assertOperation(approved, reviewArgs.requestKey, false);
    assert.equal(approved.status, 'approved');
    assert.equal(approved.marketStatus, 'draft');
    const reviewReplay = await call(admin, 'club_review_plugin_submission', reviewArgs);
    assertReplay(approved, reviewReplay);
    assert.equal(reviewReplay.pluginId, approved.pluginId);
    assert.equal(await db.plugin.count(), 1, 'Review retries must not duplicate market drafts');
    const reviewed = await call(member, 'club_get_plugin_submission', { id: submitted.id });
    assert.equal(reviewed.status, 'approved');
    assert.equal(reviewed.marketStatus, 'draft');
    assert.ok(reviewed.pluginId);
    assert.equal((await call(member, 'club_my_plugin_submissions')).items[0].marketStatus, 'draft');
    assert.equal(await db.plugin.count({ where: { status: 'published' } }), 0, 'Approval must not claim market publication');
    const marketUpdateArgs = {
      id: approved.pluginId, input: { ...pluginInput, summary: '管理员确认后的市场摘要' }, requestKey: 'update-market-plugin-1',
    };
    await toolError(admin, 'club_update_market_plugin', { id: approved.pluginId, input: marketUpdateArgs.input });
    await toolError(member, 'club_update_market_plugin', { ...marketUpdateArgs, requestKey: 'market-update-denied' }, 'MCP_PERMISSION_REQUIRED');
    const marketUpdated = await call(admin, 'club_update_market_plugin', marketUpdateArgs);
    assertOperation(marketUpdated, marketUpdateArgs.requestKey, false);
    assert.equal(marketUpdated.summary, marketUpdateArgs.input.summary);
    assert.equal(marketUpdated.status, 'draft');
    const marketUpdateReplay = await call(admin, 'club_update_market_plugin', marketUpdateArgs);
    assertReplay(marketUpdated, marketUpdateReplay);
    assert.equal(marketUpdateReplay.updatedAt, marketUpdated.updatedAt);
    const marketPublishArgs = { id: approved.pluginId, requestKey: 'publish-market-plugin-1' };
    await toolError(admin, 'club_publish_market_plugin', { id: approved.pluginId });
    await toolError(member, 'club_publish_market_plugin', { ...marketPublishArgs, requestKey: 'market-publish-denied' }, 'MCP_PERMISSION_REQUIRED');
    const marketPublished = await call(admin, 'club_publish_market_plugin', marketPublishArgs);
    assertOperation(marketPublished, marketPublishArgs.requestKey, false);
    assert.equal(marketPublished.status, 'published');
    assert.ok(marketPublished.publishedAt);
    const marketPublishReplay = await call(admin, 'club_publish_market_plugin', marketPublishArgs);
    assertReplay(marketPublished, marketPublishReplay);
    assert.equal(marketPublishReplay.publishedAt, marketPublished.publishedAt);
    assert.equal((await call(member, 'club_get_plugin_submission', { id: submitted.id })).marketStatus, 'published');
    assert.equal(await db.plugin.count({ where: { status: 'published' } }), 1);
    console.log('Club MCP smoke passed: HTTP and real stdio bridge handshakes, protected resource metadata, JWT/Origin, permissions, article preparation, idempotency, activity REST readback, registrations and private plugin submissions.');
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.stack : String(error)}\nMCP portal output:\n${appOutput.slice(-4000)}`);
  } finally {
    const stdioPids = clients.flatMap(({ transport }) => transport instanceof StdioClientTransport && transport.pid ? [transport.pid] : []);
    await Promise.allSettled(clients.map(async ({ client, transport }) => {
      await client.close();
      await transport.close();
    }));
    if (app) await stopApp(app);
    if (db) await db.$disconnect();
    if (jwksServer?.listening) await new Promise(resolve => jwksServer.close(resolve));
    fs.rmSync(tempDirectory, { recursive: true, force: true });
    for (const pid of stdioPids) {
      assert.throws(() => process.kill(pid, 0), error => error.code === 'ESRCH', 'The stdio bridge child must exit during cleanup');
    }
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
