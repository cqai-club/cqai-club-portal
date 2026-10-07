import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod, lstat, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { auth } from '@modelcontextprotocol/sdk/client/auth.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { connectRemote, createOAuthProvider, readConfig, serveBridge, TokenStore, validateOAuthCallback } from '../bridge.mjs';

const json = (body, options) => Response.json(body, options);

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'cqai-mcp-bridge-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const config = readConfig({
    CQAI_MCP_URL: 'https://club.example/mcp', CQAI_MCP_ISSUER: 'https://auth.example/oidc',
    CQAI_MCP_CLIENT_ID: 'public-test-client', CQAI_MCP_REDIRECT_URI: 'http://127.0.0.1:41887/callback',
    CQAI_MCP_STATE_DIR: join(directory, 'credentials'),
  });
  const store = new TokenStore(config);
  let clock = 1_800_000_000_000;
  const stats = { refresh: 0, exchanges: 0, requests: [], tokenRequests: [], foreignRequests: [] };
  const state = { currentAccess: 'access-new', alwaysReject: false, resourceOverride: undefined, issuerOverride: undefined, authorizationUrl: undefined, omitRefreshToken: false };
  const metadata = {
    issuer: config.issuer, authorization_endpoint: `${config.issuer}/auth`, token_endpoint: `${config.issuer}/token`,
    response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none'], code_challenge_methods_supported: ['S256'],
  };
  const fetchFn = async (input, init = {}) => {
    const url = new URL(String(input));
    assert.equal(init.redirect, 'error', 'HTTP redirects must be refused');
    if (url.origin === 'https://club.example' && url.pathname.startsWith('/.well-known/oauth-protected-resource')) {
      return json({ resource: state.resourceOverride || config.serverUrl, authorization_servers: [state.issuerOverride || config.issuer], scopes_supported: ['club:read', 'club:write'] });
    }
    if (url.origin === 'https://auth.example' && url.pathname.includes('/.well-known/')) return json(metadata);
    if (url.href === metadata.token_endpoint) {
      const body = new URLSearchParams(init.body);
      stats.tokenRequests.push(Object.fromEntries(body));
      assert.equal(body.get('client_id'), config.clientId);
      assert.equal(body.get('resource'), config.serverUrl, 'resource must come from protected resource metadata');
      if (body.get('grant_type') === 'refresh_token') {
        stats.refresh++;
        assert.ok(body.get('refresh_token')?.startsWith('refresh-'));
      } else {
        stats.exchanges++;
        assert.equal(body.get('grant_type'), 'authorization_code');
        assert.equal(body.get('code'), 'valid-code');
        assert.equal(body.get('redirect_uri'), config.redirectUrl);
        assert.equal(createHash('sha256').update(body.get('code_verifier')).digest('base64url'), state.authorizationUrl.searchParams.get('code_challenge'));
      }
      state.currentAccess = `access-${stats.refresh + stats.exchanges}`;
      return json({
        token_type: 'Bearer', access_token: state.currentAccess, expires_in: 3_600,
        ...(!state.omitRefreshToken ? { refresh_token: `refresh-${stats.refresh + stats.exchanges}` } : {}),
      });
    }
    if (url.href === config.serverUrl) {
      if (init.method === 'GET') return new Response(null, { status: 405 });
      const message = JSON.parse(init.body);
      const headers = new Headers(init.headers);
      stats.requests.push({ message, authorization: headers.get('authorization') });
      if (state.alwaysReject || headers.get('authorization') !== `Bearer ${state.currentAccess}`) {
        return new Response(null, { status: 401, headers: {
          'WWW-Authenticate': `Bearer resource_metadata="https://club.example/.well-known/oauth-protected-resource/mcp", scope="club:read club:write"`,
        } });
      }
      // The mock speaks MCP through the pinned SDK, rather than hand-written JSON-RPC.
      const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
      const server = new Server({ name: 'mock-club', version: 'test' }, { capabilities: { tools: {} } });
      server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [{
        name: 'club_create_activity', description: 'Mock activity creation', inputSchema: { type: 'object' },
        annotations: { readOnlyHint: false, idempotentHint: true },
      }] }));
      server.setRequestHandler(CallToolRequestSchema, async (request) => ({
        content: [{ type: 'text', text: JSON.stringify(request.params.arguments) }],
        structuredContent: { id: 'real-mock-id', input: request.params.arguments },
      }));
      await server.connect(transport);
      const response = await transport.handleRequest(new Request(url, init));
      const text = await response.text();
      await server.close();
      return new Response(text || null, { status: response.status, headers: response.headers });
    }
    stats.foreignRequests.push(url.href);
    throw new Error('Unexpected mock network request');
  };
  const saveTokens = async ({ expiresAt = clock + 3_600_000, access = 'access-old' } = {}) => store.save({
    version: 1, binding: config.binding, expiresAt,
    tokens: { issuer: config.issuer, token_type: 'Bearer', access_token: access, refresh_token: 'refresh-original', expires_in: 3_600 },
  });
  return { config, store, stats, state, fetchFn, saveTokens, now: () => clock, advance: (ms) => { clock += ms; } };
}

test('OAuth uses discovery, PKCE S256, a bound public client and a checked state callback', async (t) => {
  const f = await fixture(t);
  const oauth = await createOAuthProvider(f.config, {
    fetchFn: f.fetchFn, now: f.now, interactive: true,
    redirectToAuthorization: (url) => { f.state.authorizationUrl = url; },
  });
  assert.equal(await auth(oauth.provider, { serverUrl: f.config.serverUrl, scope: 'openid offline_access club:read club:write', fetchFn: oauth.secureFetch }), 'REDIRECT');
  const url = f.state.authorizationUrl;
  assert.equal(url.origin, 'https://auth.example');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('resource'), f.config.serverUrl);
  assert.equal(url.searchParams.get('state'), oauth.state);
  const callback = new URL(f.config.redirectUrl);
  callback.searchParams.set('state', oauth.state);
  callback.searchParams.set('code', 'valid-code');
  callback.searchParams.set('iss', f.config.issuer);
  const code = validateOAuthCallback(callback, { ...f.config, state: oauth.state });
  assert.equal(await auth(oauth.provider, { serverUrl: f.config.serverUrl, authorizationCode: code, fetchFn: oauth.secureFetch }), 'AUTHORIZED');
  assert.equal(f.stats.exchanges, 1);
  assert.equal((await lstat(f.store.path)).mode & 0o777, 0o600);
  assert.equal((await lstat(f.config.stateDir)).mode & 0o777, 0o700);
  assert.equal((await f.store.load()).tokens.issuer, f.config.issuer);
  callback.searchParams.set('state', 'attacker-state');
  assert.throws(() => validateOAuthCallback(callback, { ...f.config, state: oauth.state }), /state/);
  callback.searchParams.set('state', oauth.state);
  callback.searchParams.set('iss', 'https://evil.example');
  assert.throws(() => validateOAuthCallback(callback, { ...f.config, state: oauth.state }), /issuer/);
  callback.searchParams.delete('iss');
  callback.searchParams.append('code', 'duplicate');
  assert.throws(() => validateOAuthCallback(callback, { ...f.config, state: oauth.state }), /single authorization code/);
});

test('expired credentials refresh before first request and rotate safely across restarts', async (t) => {
  const f = await fixture(t);
  await f.saveTokens({ expiresAt: f.now() - 1 });
  const remote = await connectRemote(f.config, { fetchFn: f.fetchFn, now: f.now });
  t.after(() => remote.client.close());
  assert.equal(f.stats.refresh, 1);
  assert.equal(f.stats.requests[0].authorization, 'Bearer access-1');
  assert.equal((await f.store.load()).tokens.refresh_token, 'refresh-1');
  f.advance(3_600_000);
  await remote.client.listTools();
  assert.equal(f.stats.refresh, 2);
  const restarted = await createOAuthProvider(f.config, { fetchFn: f.fetchFn, now: f.now });
  assert.equal((await restarted.provider.tokens()).access_token, 'access-2');
  assert.equal(f.stats.refresh, 2, 'a restart must use the persisted fresh credentials');
});

test('interactive login requests new scopes through PKCE without reusing an old refresh token', async (t) => {
  const f = await fixture(t);
  await f.saveTokens();
  f.config.scope = 'activity:publish';
  const oauth = await createOAuthProvider(f.config, {
    fetchFn: f.fetchFn, now: f.now, interactive: true,
    redirectToAuthorization: (url) => { f.state.authorizationUrl = url; },
  });
  const originalFile = await readFile(f.store.path, 'utf8');
  assert.equal(await auth(oauth.provider, {
    serverUrl: f.config.serverUrl, scope: `openid offline_access ${f.config.scope}`, fetchFn: oauth.secureFetch,
  }), 'REDIRECT');
  assert.equal(f.stats.refresh, 0);
  assert.equal(f.state.authorizationUrl.searchParams.get('scope'), 'openid offline_access activity:publish');
  assert.equal(await readFile(f.store.path, 'utf8'), originalFile, 'old credentials survive an incomplete login');
  f.state.omitRefreshToken = true;
  await auth(oauth.provider, { serverUrl: f.config.serverUrl, authorizationCode: 'valid-code', fetchFn: oauth.secureFetch });
  assert.equal(f.stats.exchanges, 1);
  assert.equal((await f.store.load()).tokens.refresh_token, undefined, 'a new grant cannot inherit the previous grant refresh token');
});

test('providers sharing a token file perform one refresh and share its rotated credentials', async (t) => {
  const f = await fixture(t);
  await f.saveTokens({ expiresAt: f.now() - 1 });
  let acceptedRefresh = 'refresh-original';
  const rotatingFetch = async (input, init) => {
    if (String(input) === `${f.config.issuer}/token`) {
      const supplied = new URLSearchParams(init.body).get('refresh_token');
      if (supplied !== acceptedRefresh) return json({ error: 'invalid_grant' }, { status: 400 });
      const response = await f.fetchFn(input, init);
      acceptedRefresh = (await response.clone().json()).refresh_token;
      return response;
    }
    return f.fetchFn(input, init);
  };
  const a = await createOAuthProvider(f.config, { fetchFn: rotatingFetch, now: f.now });
  const b = await createOAuthProvider(f.config, { fetchFn: rotatingFetch, now: f.now });
  const tokens = await Promise.all([a.provider.tokens(), b.provider.tokens()]);
  assert.equal(f.stats.refresh, 1);
  assert.equal(tokens[0].access_token, tokens[1].access_token);
  assert.equal(tokens[0].refresh_token, 'refresh-1');
  assert.equal((await f.store.load()).tokens.refresh_token, 'refresh-1');
});

test('a stale provider receiving 401 preserves the actual latest refresh token when the server omits it', async (t) => {
  const f = await fixture(t);
  await f.saveTokens();
  let acceptedRefresh = 'refresh-original';
  const rotatingFetch = async (input, init) => {
    if (String(input) === `${f.config.issuer}/token`) {
      assert.equal(new URLSearchParams(init.body).get('refresh_token'), acceptedRefresh);
      const response = await f.fetchFn(input, init);
      acceptedRefresh = (await response.clone().json()).refresh_token || acceptedRefresh;
      return response;
    }
    return f.fetchFn(input, init);
  };
  // Both providers initially cache R0. A's 401 rotates it to R1 before B's 401.
  const stale = await createOAuthProvider(f.config, { fetchFn: rotatingFetch, now: f.now });
  const first = await connectRemote(f.config, { fetchFn: rotatingFetch, now: f.now });
  t.after(() => first.client.close());
  assert.equal((await f.store.load()).tokens.refresh_token, 'refresh-1');
  f.state.omitRefreshToken = true;
  const second = new Client({ name: 'stale-provider-client', version: 'test' }, { capabilities: {} });
  t.after(() => second.close());
  await second.connect(new StreamableHTTPClientTransport(new URL(f.config.serverUrl), {
    authProvider: stale.provider, fetch: stale.secureFetch,
  }));
  assert.deepEqual(f.stats.tokenRequests.map((request) => request.refresh_token), ['refresh-original', 'refresh-1']);
  assert.equal((await f.store.load()).tokens.refresh_token, 'refresh-1');
  assert.equal((await stale.provider.tokens()).refresh_token, 'refresh-1');
});

test('an old failed refresh cannot delete credentials saved by a concurrent new login', async (t) => {
  const f = await fixture(t);
  await f.saveTokens();
  let signalFailure;
  const failureReady = new Promise((resolve) => { signalFailure = resolve; });
  let finishFailure;
  let failOnce = true;
  const older = await createOAuthProvider(f.config, {
    now: f.now,
    fetchFn: async (input, init) => {
      if (String(input) === `${f.config.issuer}/token` && failOnce) {
        failOnce = false;
        const body = new ReadableStream({ start(controller) {
          finishFailure = () => { controller.enqueue(new TextEncoder().encode('{"error":"invalid_grant"}')); controller.close(); };
        } });
        signalFailure();
        return new Response(body, { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      return f.fetchFn(input, init);
    },
  });
  const attempt = auth(older.provider, { serverUrl: f.config.serverUrl, fetchFn: older.secureFetch });
  await failureReady;
  const newer = await createOAuthProvider(f.config, {
    fetchFn: f.fetchFn, now: f.now, interactive: true,
    redirectToAuthorization: (url) => { f.state.authorizationUrl = url; },
  });
  await auth(newer.provider, { serverUrl: f.config.serverUrl, fetchFn: newer.secureFetch });
  await auth(newer.provider, { serverUrl: f.config.serverUrl, authorizationCode: 'valid-code', fetchFn: newer.secureFetch });
  const saved = await f.store.load();
  let clearCalls = 0;
  const originalClear = older.store.clear.bind(older.store);
  older.store.clear = async () => { clearCalls++; return originalClear(); };
  finishFailure();
  assert.equal(await attempt, 'AUTHORIZED');
  assert.equal(clearCalls, 0, 'invalidating the old grant must not remove the newer file');
  assert.ok((await f.store.load()).tokens.refresh_token);
  assert.notEqual((await f.store.load()).tokens.refresh_token, 'refresh-original');
  assert.notEqual((await f.store.load()).revision, saved.revision, 'the SDK can recover by refreshing the newer grant');
});

test('SDK retries a 401 once with refresh and forwards tools without changing arguments', async (t) => {
  const f = await fixture(t);
  await f.saveTokens();
  const remote = await connectRemote(f.config, { fetchFn: f.fetchFn, now: f.now });
  t.after(() => remote.client.close());
  assert.equal(f.stats.refresh, 1);
  assert.equal(f.stats.requests.filter(({ message }) => message.method === 'initialize').length, 2);
  const [localClientTransport, localServerTransport] = InMemoryTransport.createLinkedPair();
  const bridge = await serveBridge(remote.client, localServerTransport);
  const local = new Client({ name: 'mock-static-header-client', version: 'test' }, { capabilities: {} });
  t.after(async () => { await local.close(); await bridge.close(); });
  await local.connect(localClientTransport);
  const tools = await local.listTools();
  assert.equal(tools.tools[0].name, 'club_create_activity');
  assert.equal(tools.tools[0].annotations.idempotentHint, true);
  const input = { requestKey: 'persisted-key', input: { title: 'An activity' }, source: { key: 'article-1' } };
  const result = await local.callTool({ name: 'club_create_activity', arguments: input });
  assert.deepEqual(result.structuredContent.input, input);
  assert.equal(result.structuredContent.id, 'real-mock-id');
  assert.equal(f.stats.requests.at(-1).message.params.arguments.requestKey, 'persisted-key');
});

test('a repeated 401 stops after one retry and serve never opens a browser', async (t) => {
  const f = await fixture(t);
  await f.saveTokens();
  f.state.alwaysReject = true;
  await assert.rejects(connectRemote(f.config, { fetchFn: f.fetchFn, now: f.now }), /401/);
  assert.equal(f.stats.refresh, 1);
  assert.equal(f.stats.requests.length, 2);
  await f.store.clear();
  f.stats.requests.length = 0;
  await assert.rejects(connectRemote(f.config, { fetchFn: f.fetchFn, now: f.now }), /Login required/);
  assert.equal(f.stats.requests.length, 1);
});

test('foreign discovery endpoints and mismatched resource identifiers are blocked before token exchange', async (t) => {
  const f = await fixture(t);
  const oauth = await createOAuthProvider(f.config, { fetchFn: f.fetchFn, now: f.now });
  await assert.rejects(oauth.secureFetch('https://evil.example/.well-known/oauth-protected-resource'), /untrusted/);
  f.state.issuerOverride = 'https://evil.example/oidc';
  await assert.rejects(oauth.discover(), /untrusted/);
  assert.equal(f.stats.foreignRequests.length, 0);
  f.state.issuerOverride = undefined;
  f.state.resourceOverride = 'https://club.example/other-resource';
  await assert.rejects(oauth.discover(), /Protected resource metadata/);
  assert.equal(f.stats.tokenRequests.length, 0);
  f.state.resourceOverride = undefined;
  const poisoned = await createOAuthProvider(f.config, {
    now: f.now,
    fetchFn: async (input, init) => {
      const response = await f.fetchFn(input, init);
      if (String(input).startsWith('https://auth.example/') && String(input).includes('/.well-known/')) {
        return json({ ...await response.json(), token_endpoint: 'https://evil.example/token' });
      }
      return response;
    },
  });
  await assert.rejects(poisoned.discover(), /configured Logto origin/);
  assert.equal(f.stats.tokenRequests.length, 0);
});

test('unsafe token files are not read and logout only removes this connection', async (t) => {
  const f = await fixture(t);
  await f.saveTokens();
  const unrelated = join(f.config.stateDir, 'other.json');
  await writeFile(unrelated, 'preserved', { mode: 0o600 });
  await chmod(f.store.path, 0o644);
  await assert.rejects(f.store.load(), /mode 600/);
  await chmod(f.store.path, 0o600);
  await f.store.clear();
  assert.equal(await readFile(unrelated, 'utf8'), 'preserved');
  await symlink(unrelated, f.store.path);
  await assert.rejects(f.store.load(), /regular file/);
});

test('dead PID locks recover and symlink locks are refused', async (t) => {
  const f = await fixture(t);
  await f.saveTokens();
  const lock = `${f.store.path}.lock`;
  await writeFile(lock, JSON.stringify({ pid: 2_147_483_647, nonce: 'dead-owner' }), { mode: 0o600 });
  assert.equal(await f.store.withLock(() => 'recovered'), 'recovered');
  await assert.rejects(lstat(lock), { code: 'ENOENT' });
  const unrelated = join(f.config.stateDir, 'unrelated');
  await writeFile(unrelated, 'preserved', { mode: 0o600 });
  await symlink(unrelated, lock);
  await assert.rejects(f.store.acquireLock(), /Unsafe credential lock/);
  assert.equal(await readFile(unrelated, 'utf8'), 'preserved');
});

test('malformed token success responses release the file lock and retain prior credentials', async (t) => {
  const f = await fixture(t);
  await f.saveTokens();
  const original = await readFile(f.store.path, 'utf8');
  const oauth = await createOAuthProvider(f.config, {
    now: f.now,
    fetchFn: (input, init) => String(input) === `${f.config.issuer}/token`
      ? json({ access_token: 'unusable', token_type: 'Bearer' }) : f.fetchFn(input, init),
  });
  await assert.rejects(auth(oauth.provider, { serverUrl: f.config.serverUrl, fetchFn: oauth.secureFetch }), /Login required/);
  assert.equal(await readFile(f.store.path, 'utf8'), original);
  assert.equal(await f.store.withLock(() => 'available'), 'available');
});

test('invalid optional OAuth token fields cannot leave a live process lock after a 401', async (t) => {
  for (const optional of [{ refresh_token: 123 }, { scope: 123 }, { id_token: 123 }]) {
    const f = await fixture(t);
    await f.saveTokens({ access: 'access-new' });
    const original = await readFile(f.store.path, 'utf8');
    const remote = await connectRemote(f.config, {
      now: f.now,
      fetchFn: (input, init) => String(input) === `${f.config.issuer}/token`
        ? json({ access_token: 'invalid-optional', token_type: 'Bearer', expires_in: 3_600, ...optional })
        : f.fetchFn(input, init),
    });
    t.after(() => remote.client.close());
    // Fail during an established connection, where connectRemote's startup
    // cleanup cannot mask a token-grant lock leak.
    f.state.currentAccess = 'revoked-token';
    await assert.rejects(remote.client.listTools(), /Login required/);
    assert.equal(await readFile(f.store.path, 'utf8'), original);
    assert.equal(await f.store.withLock(() => 'available'), 'available');
  }
});
