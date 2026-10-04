/* eslint-disable @typescript-eslint/no-require-imports -- this Node security test is CommonJS */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { redirect } = require('next/navigation');
const { getRedirectError, getURLFromRedirectError } = require('next/dist/client/components/redirect');

function loadModule(relativePath, dependencies) {
  const filename = path.join(__dirname, '..', relativePath);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, {
    exports,
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `unexpected dependency: ${name}`);
      return dependencies[name];
    },
  }, { filename });
  return exports;
}

async function main() {
  const sdk = await import('@logto/next');
  const { LogtoClientError, LogtoError, LogtoRequestError } = sdk;
  const helpers = loadModule('lib/member/login-error.ts', { '@logto/next': sdk });
  const sensitive = 'SENSITIVE_TEST_CREDENTIAL';
  const response = new Response(JSON.stringify({ token: sensitive }), {
    status: 400,
    headers: { 'logto-core-request-id': 'synthetic_request-id_123' },
  });
  const invalidGrant = new LogtoRequestError('oidc.invalid_grant', sensitive, response);
  invalidGrant.name = sensitive;

  const cases = [
    [invalidGrant, 'authorization-failed'],
    [new LogtoClientError('sign_in_session.invalid', sensitive), 'invalid-session'],
    [new LogtoClientError('sign_in_session.not_found', sensitive), 'invalid-session'],
    [new LogtoError('callback_uri_verification.error_found', { code: sensitive }), 'authorization-failed'],
    ...[
      'callback_uri_verification.redirect_uri_mismatched',
      'callback_uri_verification.missing_state',
      'callback_uri_verification.state_mismatched',
      'callback_uri_verification.missing_code',
    ].map(code => [new LogtoError(code, sensitive), 'invalid-session']),
  ];

  let outcome;
  let calls = 0;
  const logs = [];
  const { GET } = loadModule('app/member/callback/route.ts', {
    '@/lib/logto': { handleSignIn: async () => { calls++; if (outcome) throw outcome; } },
    '@/lib/logger': { logger: { warn: (...args) => logs.push(args) } },
    '@/lib/member/login-error': helpers,
    'next/navigation': { redirect },
  });
  const request = { nextUrl: { searchParams: new URLSearchParams({ code: sensitive, state: sensitive }) } };

  for (const [error, expected] of cases) {
    outcome = error;
    logs.length = 0;
    const previousCalls = calls;
    await assert.rejects(GET(request), result => {
      assert.equal(getURLFromRedirectError(result), `/member/sign-in?error=${expected}`);
      return true;
    });
    assert.equal(calls, previousCalls + 1, 'callback must not retry the authorization code');
    assert.equal(logs.length, 1);
    const fields = logs[0][1];
    assert.ok(['LogtoClientError', 'LogtoError', 'LogtoRequestError'].includes(fields.name));
    assert.ok(Object.keys(fields).every(key => ['code', 'name', 'requestId'].includes(key)));
    assert.ok(!JSON.stringify(logs).includes(sensitive), 'logs must omit request secrets and SDK error data');
  }
  assert.equal(response.bodyUsed, false, 'diagnostic logging must not read the response body');
  assert.equal(helpers.memberLoginErrorRequestId(invalidGrant), 'synthetic_request-id_123');
  for (const requestId of ['bad identifier', 'https://unsafe.example', 'a'.repeat(129), '']) {
    const error = new LogtoRequestError('oidc.invalid_grant', sensitive, new Response(null, {
      headers: { 'logto-core-request-id': requestId },
    }));
    assert.equal(helpers.memberLoginErrorRequestId(error), undefined);
  }

  outcome = undefined;
  logs.length = 0;
  await assert.rejects(GET(request), error => {
    assert.equal(getURLFromRedirectError(error), '/member/dashboard');
    return true;
  });
  assert.equal(logs.length, 0);

  const successfulApplicationRedirect = getRedirectError('/member/dashboard/application', 'replace');
  const lookalike = Object.assign(new Error(sensitive), { name: 'LogtoRequestError', code: 'oidc.invalid_grant' });
  for (const error of [
    successfulApplicationRedirect,
    new Error(sensitive), lookalike,
    new LogtoRequestError('oidc.invalid_client', sensitive),
    new LogtoError('id_token.invalid_iat', sensitive),
    new LogtoClientError('missing_scope_organizations', sensitive),
  ]) {
    outcome = error;
    logs.length = 0;
    await assert.rejects(GET(request), result => {
      assert.equal(result, error, 'successful SDK redirects and unknown failures must be preserved');
      return true;
    });
    assert.equal(logs.length, 0);
  }

  assert.equal(helpers.normalizeMemberLoginError('authorization-failed'), 'authorization-failed');
  assert.equal(helpers.normalizeMemberLoginError('invalid-session'), 'invalid-session');
  for (const value of [undefined, null, ['invalid-session'], '/member/dashboard', sensitive]) {
    assert.equal(helpers.normalizeMemberLoginError(value), undefined);
  }

  console.log('Member callback tests passed: SDK failure allowlist, safe diagnostics, successful redirects, and unknown-error propagation.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
