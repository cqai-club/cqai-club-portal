import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { chmod, lstat, mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { auth, discoverOAuthServerInfo } from '@modelcontextprotocol/sdk/client/auth.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { OAuthTokensSchema } from '@modelcontextprotocol/sdk/shared/auth.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const LOOPBACK = new Set(['127.0.0.1', '[::1]', 'localhost']);
const TokenResponseSchema = OAuthTokensSchema.omit({ issuer: true });
const normalizeIssuer = (value) => new URL(value).href.replace(/\/$/, '');

function checkedUrl(value, label) {
  const url = new URL(value);
  if (url.username || url.password || url.hash || url.search ||
    !(url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK.has(url.hostname)))) {
    throw new Error(`${label} must use HTTPS (HTTP is allowed only on loopback), without credentials, query or fragment.`);
  }
  return url;
}

export function readConfig(env = process.env) {
  for (const name of ['CQAI_MCP_URL', 'CQAI_MCP_CLIENT_ID', 'CQAI_MCP_ISSUER', 'CQAI_MCP_REDIRECT_URI']) {
    if (!env[name]?.trim()) throw new Error(`Missing ${name}. See docs/club-mcp.md.`);
  }
  const serverUrl = checkedUrl(env.CQAI_MCP_URL, 'CQAI_MCP_URL');
  const issuer = checkedUrl(env.CQAI_MCP_ISSUER, 'CQAI_MCP_ISSUER');
  const redirectUrl = checkedUrl(env.CQAI_MCP_REDIRECT_URI, 'CQAI_MCP_REDIRECT_URI');
  if (redirectUrl.protocol !== 'http:' || !LOOPBACK.has(redirectUrl.hostname) || !redirectUrl.port) {
    throw new Error('CQAI_MCP_REDIRECT_URI must be an HTTP loopback URL with a fixed, registered port.');
  }
  const config = {
    serverUrl: serverUrl.href,
    issuer: normalizeIssuer(issuer),
    redirectUrl: redirectUrl.href,
    clientId: env.CQAI_MCP_CLIENT_ID.trim(),
    scope: env.CQAI_MCP_SCOPE?.trim(),
    stateDir: env.CQAI_MCP_STATE_DIR || join(homedir(), '.config', 'cqai-club-mcp'),
  };
  config.binding = createHash('sha256').update(JSON.stringify([
    config.serverUrl, config.issuer, config.clientId, config.redirectUrl,
  ])).digest('hex');
  return config;
}

export class TokenStore {
  constructor(config) {
    this.config = config;
    this.path = join(config.stateDir, `${config.binding}.json`);
  }

  async ensureDirectory() {
    await mkdir(this.config.stateDir, { recursive: true, mode: 0o700 });
    const directory = await lstat(this.config.stateDir);
    if (!directory.isDirectory() || directory.isSymbolicLink() ||
      (process.getuid && directory.uid !== process.getuid())) {
      throw new Error('Credential directory must be a regular directory owned by this user.');
    }
    await chmod(this.config.stateDir, 0o700);
  }

  async acquireLock() {
    await this.ensureDirectory();
    const path = `${this.path}.lock`;
    const nonce = randomBytes(16).toString('hex');
    const deadline = Date.now() + 30_000;
    while (true) {
      try {
        const file = await open(path, 'wx', 0o600);
        try {
          await file.writeFile(JSON.stringify({ pid: process.pid, nonce }), 'utf8');
          await file.close();
        } catch (error) {
          await file.close().catch(() => {});
          await unlink(path).catch(() => {});
          throw error;
        }
        return async () => {
          try {
            const owner = JSON.parse(await readFile(path, 'utf8'));
            if (owner.nonce === nonce) await unlink(path);
          } catch (error) {
            if (error.code !== 'ENOENT') throw error;
          }
        };
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        let stat;
        try { stat = await lstat(path); } catch (readError) {
          if (readError.code === 'ENOENT') continue;
          throw readError;
        }
        if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) ||
          (process.getuid && stat.uid !== process.getuid())) {
          throw new Error('Unsafe credential lock file.');
        }
        try {
          const owner = JSON.parse(await readFile(path, 'utf8'));
          if (Number.isSafeInteger(owner.pid) && owner.pid > 0) {
            try { process.kill(owner.pid, 0); } catch (probe) {
              if (probe.code === 'ESRCH') {
                // Only remove the lock if its owner has not changed while checking.
                const current = JSON.parse(await readFile(path, 'utf8'));
                if (current.nonce === owner.nonce) await unlink(path);
                continue;
              }
            }
          }
        } catch (readError) {
          if (readError.code === 'ENOENT') continue;
          if (!(readError instanceof SyntaxError)) throw readError;
          // Another process may still be writing the lock after its exclusive open.
        }
        if (Date.now() >= deadline) throw new Error('Another process is updating these MCP credentials. Try again.');
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
  }

  async withLock(operation) {
    const release = await this.acquireLock();
    try { return await operation(); } finally { await release(); }
  }

  async checkFile() {
    try {
      const stat = await lstat(this.path);
      if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) ||
        (process.getuid && stat.uid !== process.getuid())) {
        throw new Error('Credential file must be a regular file owned by this user with mode 600.');
      }
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') return false;
      throw error;
    }
  }

  async load() {
    if (!(await this.checkFile())) return undefined;
    const record = JSON.parse(await readFile(this.path, 'utf8'));
    if (record.version !== 1 || record.binding !== this.config.binding ||
      normalizeIssuer(record.tokens?.issuer) !== this.config.issuer ||
      typeof record.tokens?.access_token !== 'string' || !record.tokens.access_token ||
      record.tokens.token_type?.toLowerCase() !== 'bearer' ||
      !Number.isFinite(record.expiresAt)) {
      throw new Error('Credential file does not match this MCP connection. Run logout and login again.');
    }
    return record;
  }

  async save(record) {
    await this.ensureDirectory();
    await this.checkFile();
    const temporary = `${this.path}.${randomBytes(12).toString('hex')}.tmp`;
    const file = await open(temporary, 'wx', 0o600);
    try {
      await file.writeFile(`${JSON.stringify(record)}\n`, 'utf8');
      await file.sync();
      await file.close();
      await rename(temporary, this.path);
    } catch (error) {
      await file.close().catch(() => {});
      await unlink(temporary).catch(() => {});
      throw error;
    }
  }

  async clear() {
    if (await this.checkFile()) await unlink(this.path);
  }

  async clearIfCurrent(expected) {
    const current = await this.load();
    if (expected && current && current.revision === expected.revision &&
      current.expiresAt === expected.expiresAt &&
      current.tokens.access_token === expected.tokens.access_token &&
      current.tokens.refresh_token === expected.tokens.refresh_token) {
      await this.clear();
      return undefined;
    }
    return current;
  }
}

function validateDiscovery(config, discovery) {
  const resource = discovery.resourceMetadata;
  const metadata = discovery.authorizationServerMetadata;
  if (!resource || resource.resource !== config.serverUrl ||
    !Array.isArray(resource.authorization_servers) || resource.authorization_servers.length !== 1 ||
    normalizeIssuer(resource.authorization_servers[0]) !== config.issuer ||
    normalizeIssuer(discovery.authorizationServerUrl) !== config.issuer) {
    throw new Error('Protected resource metadata must identify this MCP URL and the configured Logto issuer.');
  }
  if (!metadata || normalizeIssuer(metadata.issuer) !== config.issuer ||
    !metadata.code_challenge_methods_supported?.includes('S256')) {
    throw new Error('Logto metadata must match CQAI_MCP_ISSUER and support PKCE S256.');
  }
  for (const name of ['authorization_endpoint', 'token_endpoint']) {
    const endpoint = checkedUrl(metadata[name], name);
    if (endpoint.origin !== new URL(config.issuer).origin) {
      throw new Error(`OAuth ${name} must use the configured Logto origin.`);
    }
  }
}

export async function createOAuthProvider(config, {
  interactive = false, redirectToAuthorization, fetchFn = globalThis.fetch,
  now = Date.now, store = new TokenStore(config),
} = {}) {
  // Interactive login deliberately starts a new PKCE grant so changed scopes
  // or roles take effect. Keep the old file until the new grant succeeds.
  let record = interactive ? undefined : await store.load();
  let discovery;
  const trustedTokenEndpoints = new Set();
  let verifier;
  const state = randomBytes(32).toString('base64url');
  let refreshing;
  let refreshLockHeld = false;
  let grantRelease;
  let grantAttempt;
  let tokenResponse;
  const releaseGrant = async (release = grantRelease) => {
    if (grantRelease === release) grantRelease = undefined;
    if (release) await release();
  };
  const resourceOrigin = new URL(config.serverUrl).origin;
  const issuerOrigin = new URL(config.issuer).origin;

  // All network paths, including SDK discovery and token refresh, pass through this guard.
  // Redirects are rejected rather than risking a token or verifier crossing origins.
  const secureFetch = async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = (init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    const isResource = url.href === config.serverUrl;
    const isResourceMetadata = method === 'GET' && url.origin === resourceOrigin &&
      /^\/\.well-known\/oauth-protected-resource(?:\/|$)/.test(url.pathname);
    const isIssuerMetadata = method === 'GET' && url.origin === issuerOrigin &&
      /(?:^|\/)\.well-known\/(?:oauth-authorization-server|openid-configuration)(?:\/|$)/.test(url.pathname);
    const isToken = method === 'POST' && trustedTokenEndpoints.has(url.href);
    const tokenRelease = isToken ? grantRelease : undefined;
    const tokenParams = isToken ? new URLSearchParams(init.body) : undefined;
    if (url.username || url.password || url.hash ||
      !(isResource || isResourceMetadata || isIssuerMetadata || isToken) ||
      (headers.has('authorization') && !isResource)) {
      throw new Error('Blocked an untrusted MCP/OAuth request. Check the configured URLs and discovery metadata.');
    }
    try {
      const response = await fetchFn(input, {
        ...init, redirect: 'error',
        signal: init.signal || (input instanceof Request ? input.signal : undefined) || AbortSignal.timeout(30_000),
      });
      if (isToken) {
        if (!response.ok) await releaseGrant(tokenRelease);
        else {
          // Release on malformed success responses too: SDK validation may throw
          // before saveTokens can finish the grant and release its lock.
          try {
            const body = await response.clone().json();
            const parsed = TokenResponseSchema.safeParse(body);
            if (!parsed.success || !parsed.data.access_token ||
              parsed.data.token_type.toLowerCase() !== 'bearer' ||
              !Number.isFinite(parsed.data.expires_in) || parsed.data.expires_in <= 0) {
              await releaseGrant(tokenRelease);
            } else {
              // The SDK preserves its original refreshAuthorization() argument
              // when the response omits refresh_token. Our request hook may have
              // replaced that stale argument with a token another process saved.
              // Keep evidence from the actual wire response and request instead.
              tokenResponse = {
                accessToken: parsed.data.access_token,
                refreshToken: Object.hasOwn(body, 'refresh_token') ? parsed.data.refresh_token
                  : tokenParams.get('grant_type') === 'refresh_token' ? tokenParams.get('refresh_token') : undefined,
              };
            }
          } catch { await releaseGrant(tokenRelease); }
        }
      }
      return response;
    } catch (error) {
      if (isToken) await releaseGrant(tokenRelease);
      throw error;
    }
  };

  const provider = {
    redirectUrl: config.redirectUrl,
    clientMetadata: {
      client_name: 'CQAI Club local MCP bridge',
      redirect_uris: [config.redirectUrl],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: config.scope || 'openid offline_access',
    },
    clientInformation: () => ({ client_id: config.clientId, issuer: config.issuer }),
    addClientAuthentication: async (_headers, params) => {
      grantRelease = await store.acquireLock();
      try {
        params.set('client_id', config.clientId);
        if (params.get('grant_type') === 'refresh_token') {
          // Another process may have rotated the refresh token after this
          // provider loaded it. Never send the stale in-memory token.
          record = await store.load();
          if (!record?.tokens.refresh_token) throw new Error('Login required. Run cqai-club-mcp login.');
          grantAttempt = record;
          params.set('refresh_token', record.tokens.refresh_token);
        } else {
          grantAttempt = undefined;
        }
      } catch (error) {
        await releaseGrant();
        throw error;
      }
    },
    state: () => state,
    tokens: async () => {
      if (record && now() >= record.expiresAt - 30_000) await ensureFresh();
      return record?.tokens;
    },
    saveTokens: async (tokens) => {
      if (normalizeIssuer(tokens.issuer) !== config.issuer ||
        tokens.token_type?.toLowerCase() !== 'bearer' || !tokens.access_token ||
        !Number.isFinite(tokens.expires_in) || tokens.expires_in <= 0) {
        throw new Error('The authorization server returned unusable credentials.');
      }
      const rawResponse = tokenResponse;
      tokenResponse = undefined;
      const refreshToken = rawResponse?.accessToken === tokens.access_token
        ? rawResponse.refreshToken : tokens.refresh_token || record?.tokens.refresh_token;
      const next = {
        version: 1, binding: config.binding, revision: randomBytes(16).toString('hex'),
        tokens: { ...tokens, refresh_token: refreshToken },
        expiresAt: now() + tokens.expires_in * 1_000,
      };
      try {
        if (grantRelease || refreshLockHeld) await store.save(next);
        else await store.withLock(() => store.save(next));
        record = next;
      } finally { await releaseGrant(); }
    },
    saveCodeVerifier: (value) => { verifier = value; },
    codeVerifier: () => {
      if (!verifier) throw new Error('No active PKCE login. Run login again.');
      return verifier;
    },
    redirectToAuthorization: async (url) => {
      // A failed token HTTP request already releases its own grant lock.
      // Do not release a different, concurrent auth flow's lock here.
      if (!interactive || !redirectToAuthorization) {
        throw new Error('Login required. Run cqai-club-mcp login in a terminal, then reconnect this MCP server.');
      }
      if (!discovery || url.origin !== issuerOrigin ||
        url.origin + url.pathname !== new URL(discovery.authorizationServerMetadata.authorization_endpoint).origin +
          new URL(discovery.authorizationServerMetadata.authorization_endpoint).pathname ||
        url.searchParams.get('state') !== state ||
        url.searchParams.get('code_challenge_method') !== 'S256') {
        throw new Error('Blocked an unexpected OAuth authorization URL.');
      }
      await redirectToAuthorization(url);
    },
    saveDiscoveryState: (value) => {
      validateDiscovery(config, value);
      trustedTokenEndpoints.add(value.authorizationServerMetadata.token_endpoint);
      discovery = value;
    },
    discoveryState: () => discovery,
    invalidateCredentials: async (scope) => {
      if (scope === 'tokens' || scope === 'all') {
        const expected = grantAttempt || record;
        const clear = () => store.clearIfCurrent(expected);
        const current = refreshLockHeld ? await clear() : await store.withLock(clear);
        record = interactive ? undefined : current;
      }
      if (scope === 'verifier' || scope === 'all') verifier = undefined;
      if (scope === 'discovery' || scope === 'all') discovery = undefined;
      // This is a pre-registered public client; client information never changes.
    },
  };

  const discover = async () => {
    if (!discovery) provider.saveDiscoveryState(await discoverOAuthServerInfo(config.serverUrl, { fetchFn: secureFetch }));
    return discovery;
  };
  const ensureFresh = async () => {
    if (!record?.tokens.refresh_token) {
      throw new Error('Login required. Run cqai-club-mcp login in a terminal.');
    }
    if (!refreshing) {
      refreshing = store.withLock(async () => {
        record = await store.load();
        if (record && now() < record.expiresAt - 30_000) return;
        if (!record?.tokens.refresh_token) throw new Error('Login required. Run cqai-club-mcp login.');
        grantAttempt = record;
        const rawProvider = {
          ...provider, tokens: () => record?.tokens,
          addClientAuthentication: (_headers, params) => { params.set('client_id', config.clientId); },
        };
        refreshLockHeld = true;
        try {
          await discover();
          await auth(rawProvider, { serverUrl: config.serverUrl, fetchFn: secureFetch });
        } finally { refreshLockHeld = false; }
      }).finally(() => { refreshing = undefined; });
    }
    await refreshing;
  };

  return { provider, secureFetch, discover, store, state, cleanup: releaseGrant };
}

export function validateOAuthCallback(callbackUrl, { redirectUrl, issuer, state }) {
  const url = new URL(callbackUrl);
  const expected = new URL(redirectUrl);
  const suppliedState = url.searchParams.get('state') || '';
  const actual = Buffer.from(suppliedState);
  const intended = Buffer.from(state);
  if (url.origin !== expected.origin || url.pathname !== expected.pathname ||
    url.searchParams.getAll('state').length !== 1 || actual.length !== intended.length ||
    !timingSafeEqual(actual, intended)) {
    throw new Error('OAuth callback state did not match this login.');
  }
  if (url.searchParams.has('iss') &&
    (url.searchParams.getAll('iss').length !== 1 || normalizeIssuer(url.searchParams.get('iss')) !== issuer)) {
    throw new Error('OAuth callback issuer did not match the configured Logto issuer.');
  }
  if (url.searchParams.has('error')) throw new Error('Authorization was declined or failed. Run login again.');
  if (url.searchParams.getAll('code').length !== 1 || !url.searchParams.get('code')) {
    throw new Error('OAuth callback did not contain a single authorization code.');
  }
  return url.searchParams.get('code');
}

export async function connectRemote(config, options = {}) {
  const oauth = await createOAuthProvider(config, options);
  const client = new Client({ name: 'cqai-club-mcp-bridge', version: '0.1.0' }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(new URL(config.serverUrl), {
    authProvider: oauth.provider, fetch: oauth.secureFetch,
    reconnectionOptions: { maxRetries: 0, initialReconnectionDelay: 1_000, maxReconnectionDelay: 1_000, reconnectionDelayGrowFactor: 1 },
  });
  try {
    await client.connect(transport);
    return { client, transport, oauth };
  } catch (error) {
    await oauth.cleanup();
    await client.close().catch(() => {});
    throw error;
  }
}

export async function serveBridge(remote, transport = new StdioServerTransport()) {
  const server = new Server({ name: 'cqai-club-mcp-bridge', version: '0.1.0' }, { capabilities: { tools: {} } });
  let queue = Promise.resolve();
  const sequential = (action) => {
    const result = queue.then(action);
    queue = result.catch(() => {});
    return result;
  };
  server.setRequestHandler(ListToolsRequestSchema, (request) => sequential(() => remote.listTools(request.params)));
  server.setRequestHandler(CallToolRequestSchema, (request, extra) => sequential(() => remote.callTool(
    request.params, undefined, { signal: extra.signal },
  )));
  await server.connect(transport);
  return server;
}
