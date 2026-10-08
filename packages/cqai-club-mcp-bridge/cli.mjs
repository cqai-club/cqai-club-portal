#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { auth } from '@modelcontextprotocol/sdk/client/auth.js';
import { connectRemote, createOAuthProvider, readConfig, serveBridge, TokenStore, validateOAuthCallback } from './bridge.mjs';

const HELP = `CQAI Club MCP local bridge (Node >=20)

  cqai-club-mcp login [--no-browser]   Sign in with a pre-registered Logto public client
  cqai-club-mcp serve                  Run the MCP stdio bridge
  cqai-club-mcp logout                 Delete this connection's saved local tokens

Required environment: CQAI_MCP_URL, CQAI_MCP_CLIENT_ID,
CQAI_MCP_ISSUER, CQAI_MCP_REDIRECT_URI. See docs/club-mcp.md.
`;

function openBrowser(url) {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'rundll32' : 'xdg-open';
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url.href] : [url.href];
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore', windowsHide: true });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error('Could not open the browser. Run login --no-browser.')));
  });
}

async function login(config, noBrowser) {
  const redirect = new URL(config.redirectUrl);
  let oauth;
  let acceptCode;
  let rejectCode;
  const code = new Promise((resolve, reject) => { acceptCode = resolve; rejectCode = reject; });
  // Attach a rejection handler while discovery/browser startup is still in progress.
  code.catch(() => {});
  const callback = createServer((req, res) => {
    const requestUrl = new URL(req.url, redirect.origin);
    if (req.method !== 'GET' || requestUrl.pathname !== redirect.pathname) {
      res.writeHead(404).end();
      return;
    }
    // Check the actual Host rather than accepting an attacker-chosen browser origin.
    if (req.headers.host !== redirect.host || !oauth) {
      res.writeHead(400).end('Invalid login callback.');
      return;
    }
    try {
      const result = validateOAuthCallback(requestUrl, { ...config, state: oauth.state });
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end('CQAI Club sign-in callback received. Return to your terminal.');
      acceptCode(result);
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end('Invalid or declined login callback. Return to your terminal.');
      rejectCode(error);
    }
  });
  await new Promise((resolve, reject) => {
    callback.once('error', reject);
    callback.listen(Number(redirect.port), redirect.hostname.replace(/^\[|\]$/g, ''), resolve);
  });
  const timer = setTimeout(() => rejectCode(new Error('Login timed out. Run login again.')), 5 * 60_000);
  try {
    oauth = await createOAuthProvider(config, {
      interactive: true,
      redirectToAuthorization: async (url) => {
        if (noBrowser) process.stderr.write(`Open this URL in your browser:\n${url.href}\n`);
        else await openBrowser(url);
      },
    });
    const discovery = await oauth.discover();
    const scope = [...new Set([
      'openid', 'offline_access',
      ...(config.scope?.split(/\s+/) || discovery.resourceMetadata.scopes_supported || []),
    ])].join(' ');
    const result = await auth(oauth.provider, { serverUrl: config.serverUrl, scope, fetchFn: oauth.secureFetch });
    if (result === 'REDIRECT') {
      await auth(oauth.provider, {
        serverUrl: config.serverUrl, authorizationCode: await code, scope, fetchFn: oauth.secureFetch,
      });
    }
    process.stderr.write('CQAI Club sign-in saved locally. You can now connect the stdio MCP bridge.\n');
  } finally {
    clearTimeout(timer);
    await oauth?.cleanup();
    await new Promise((resolve) => callback.close(resolve));
  }
}

async function main() {
  const [command = 'help', ...options] = process.argv.slice(2);
  if (['help', '--help', '-h'].includes(command)) {
    process.stderr.write(HELP);
    return;
  }
  if (!['login', 'serve', 'logout'].includes(command) ||
    options.some((value) => command !== 'login' || value !== '--no-browser')) {
    throw new Error(HELP);
  }
  const config = readConfig();
  if (command === 'login') return login(config, options.includes('--no-browser'));
  if (command === 'logout') {
    const store = new TokenStore(config);
    await store.withLock(() => store.clear());
    process.stderr.write('Saved tokens removed for this MCP connection.\n');
    return;
  }
  const remote = await connectRemote(config);
  const bridge = await serveBridge(remote.client);
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await bridge.close().catch(() => {});
    await remote.client.close().catch(() => {});
  };
  process.once('SIGINT', () => { void close(); });
  process.once('SIGTERM', () => { void close(); });
  process.stdin.once('end', () => { void close(); });
}

main().catch(() => {
  // SDK errors can contain raw upstream bodies. Keep stdout strictly MCP and avoid
  // accidentally copying credentials or backend details into a client's logs.
  process.stderr.write('CQAI Club MCP bridge failed. Check the required environment, trusted discovery metadata and local file permissions. Run login if authorization has expired.\n');
  process.exitCode = 1;
});
