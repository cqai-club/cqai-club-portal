/* eslint-disable @typescript-eslint/no-require-imports -- this Node security test is CommonJS */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadModule(relativePath, dependencies = {}) {
  const filename = path.join(__dirname, '..', relativePath);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
    fileName: filename,
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, {
    exports,
    URLSearchParams,
    Headers,
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `unexpected dependency: ${name}`);
      return dependencies[name];
    },
  }, { filename });
  return exports;
}

const targets = loadModule('lib/member/return-to.ts');
const { normalizeMemberReturnTo, memberLoginPath, MEMBER_APPLICATION_PATH, MEMBER_PROJECT_SUBMISSION_PATH, MEMBER_RETURN_TO_HEADER } = targets;
const AI_GATEWAY_PATH = '/member/dashboard/ai-gateway';

for (const value of [
  '/member/dashboard',
  '/member/dashboard/',
  MEMBER_APPLICATION_PATH,
  MEMBER_PROJECT_SUBMISSION_PATH,
  AI_GATEWAY_PATH,
  `${MEMBER_APPLICATION_PATH}/`,
  '/member/dashboard/profile',
  '/member/dashboard/admin/projects/abc-123',
]) {
  assert.equal(normalizeMemberReturnTo(value), value);
}

for (const value of [
  undefined, null, false, {}, [MEMBER_APPLICATION_PATH], '',
  'https://example.com/member/dashboard', '//example.com/member/dashboard',
  '/member/dashboardish', '/member/dashboard//example.com',
  '/member/dashboard/../login', '/member/dashboard/./application',
  '/member/dashboard/%2e%2e/login', '/member/dashboard/%2F%2Fexample.com',
  '/member/dashboard/%252e%252e/login', '/member/dashboard\\example.com',
  `${MEMBER_APPLICATION_PATH}?returnTo=https://example.com`,
  `${MEMBER_APPLICATION_PATH}#https://example.com`,
  `${MEMBER_APPLICATION_PATH}\n`, `${MEMBER_APPLICATION_PATH}\r\nLocation: https://example.com`,
  ` ${MEMBER_APPLICATION_PATH}`, `${MEMBER_APPLICATION_PATH}\u0000`,
  `/member/dashboard/${'a'.repeat(2048)}`,
]) {
  assert.equal(normalizeMemberReturnTo(value), undefined, `must reject: ${JSON.stringify(value)}`);
}

assert.equal(memberLoginPath(), '/member/login');
assert.equal(memberLoginPath('//example.com'), '/member/login');
const login = new URL(memberLoginPath(MEMBER_APPLICATION_PATH), 'https://club.example');
assert.equal(login.pathname, '/member/login');
assert.equal(login.searchParams.get('returnTo'), MEMBER_APPLICATION_PATH);
assert.equal(new URL(memberLoginPath(MEMBER_APPLICATION_PATH, true), login).searchParams.get('reauth'), '1');

const { proxy } = loadModule('proxy.ts', {
  '@/lib/member/return-to': targets,
  'next/server': { NextResponse: { next: value => value } },
});

for (const pathname of [MEMBER_APPLICATION_PATH, `${MEMBER_APPLICATION_PATH}/`, MEMBER_PROJECT_SUBMISSION_PATH, `${MEMBER_PROJECT_SUBMISSION_PATH}/`, '/member/dashboard/resources', '/member/dashboard/resources/', '/member/dashboard/admin/resources', AI_GATEWAY_PATH, `${AI_GATEWAY_PATH}/`]) {
  const response = proxy({
    headers: new Headers({ [MEMBER_RETURN_TO_HEADER]: '//example.com', 'x-test': 'preserved' }),
    nextUrl: { pathname },
  });
  assert.equal(response.request.headers.get(MEMBER_RETURN_TO_HEADER), pathname.replace(/\/$/, ""));
  assert.equal(response.request.headers.get('x-test'), 'preserved');
}

for (const pathname of ['/member/dashboard', '/member/dashboard/profile', `${MEMBER_APPLICATION_PATH}/other`, `${AI_GATEWAY_PATH}/other`]) {
  const response = proxy({
    headers: new Headers({ [MEMBER_RETURN_TO_HEADER]: MEMBER_APPLICATION_PATH }),
    nextUrl: { pathname },
  });
  assert.equal(response.request.headers.get(MEMBER_RETURN_TO_HEADER), null);
}

async function testApplicationReturn() {
  // Exercise the real return page after login with each verified membership state.
  for (const [access, destination] of [
    ['unauthorized', memberLoginPath(MEMBER_APPLICATION_PATH)],
    ['allowed', '/member/dashboard/plans'],
    ['denied', '/member/dashboard/plans?application=open'],
    ['unavailable', '/member/dashboard/plans'],
  ]) {
    const page = loadModule('app/member/dashboard/application/page.tsx', {
      'next/navigation': { redirect(location) { throw new Error(location); } },
      '@/lib/member/innovation-access': { innovationMemberPageAccess: async () => access },
      '@/lib/member/return-to': targets,
    });
    await assert.rejects(page.default(), error => error.message === destination, `application return for ${access}`);
  }

  // A stale application=open link must not mount a drawer for existing members.
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const container = ({ children }) => React.createElement(React.Fragment, null, children);
  const types = loadModule('app/member/dashboard/plans/membership-types.tsx', {
    react: { ...React, useTransition: () => [false, () => {}] },
    'react/jsx-runtime': require('react/jsx-runtime'),
    'next/navigation': { useRouter: () => ({ refresh() {} }) },
    'next/image': { __esModule: true, default: () => null },
    'lucide-react': require('lucide-react'),
    '@/components/ui/button': { Button: container },
    '@/components/ui/card': { Card: container },
    '@/components/ui/dialog': Object.fromEntries(['Dialog', 'DialogClose', 'DialogContent', 'DialogDescription', 'DialogFooter', 'DialogHeader', 'DialogTitle', 'DialogTrigger'].map(name => [name, container])),
    '@/lib/i18n/client': { useTranslations: () => ({ t: key => key }) },
    '@/components/member/member-application-drawer': { __esModule: true, default: () => React.createElement('aside', { 'data-application-open': 'true' }) },
  });
  for (const membership of ['ordinary', 'chuangxiang', null]) {
    const html = renderToStaticMarkup(React.createElement(types.default, { currentMembership: membership, initialIdentity: { name: '', email: '', phone: '' } }));
    assert.equal(html.includes('data-application-open="true"'), membership === 'ordinary', `application drawer for ${membership}`);
  }
}

async function testAiGatewayAccess() {
  const React = require('react');
  const jsxRuntime = require('react/jsx-runtime');
  const { renderToStaticMarkup } = require('react-dom/server');
  const container = ({ children }) => React.createElement(React.Fragment, null, children);
  const prompt = loadModule('components/member/innovation-membership-prompt.tsx', {
    'react/jsx-runtime': jsxRuntime,
    'next/link': { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) },
    'lucide-react': require('lucide-react'),
    '@/components/ui/button': { Button: container },
    '@/components/ui/card': { Card: container },
    '@/lib/i18n/client': { useTranslations: () => ({ t: key => key }) },
  });

  // Keep the real page and membership-denial component; replace only membership I/O and Next redirects.
  for (const access of ['allowed', 'denied', 'unauthorized', 'unavailable']) {
    const redirects = [];
    const navigation = { redirect(location) { redirects.push(location); throw new Error(location); } };
    const gate = loadModule('components/member/innovation-page-access.tsx', {
      'react/jsx-runtime': jsxRuntime,
      'next/navigation': navigation,
      '@/lib/member/innovation-access': { innovationMemberPageAccess: async () => access },
      '@/lib/member/return-to': targets,
    });
    const page = loadModule('app/member/dashboard/ai-gateway/page.tsx', {
      'react/jsx-runtime': jsxRuntime,
      'next/navigation': navigation,
      '@/components/member/innovation-page-access': gate,
      '@/components/member/innovation-membership-prompt': prompt,
    });

    if (access === 'allowed' || access === 'unauthorized') {
      const destination = access === 'allowed' ? 'https://relay.cqaiclub.asia/' : memberLoginPath(AI_GATEWAY_PATH);
      await assert.rejects(page.default(), error => error.message === destination, `AI gateway redirect for ${access}`);
      assert.deepEqual(redirects, [destination]);
      continue;
    }

    const result = await page.default();
    const html = renderToStaticMarkup(result);
    assert.deepEqual(redirects, [], `AI gateway must not redirect for ${access}`);
    assert.ok(!html.includes('relay.cqaiclub.asia'), `AI gateway URL must not be exposed for ${access}`);
    if (access === 'denied') {
      assert.equal(result.props.section, 'aiGateway');
      assert.match(html, /aiGateway\.membershipRequired/);
      assert.match(html, /href="\/member\/dashboard\/plans\?application=open"/);
    } else {
      assert.match(html, /role="alert"/);
      assert.match(html, /href="\/member\/dashboard\/ai-gateway"/);
      assert.ok(!html.includes('application=open'), 'Unavailable identity must not be treated as a non-member');
    }
  }
}

testApplicationReturn().then(testAiGatewayAccess).then(() => {
  console.log('Member login return-target tests passed: canonical paths, malicious targets, proxy header isolation, reauthentication, membership-aware application returns, stale drawer links, and AI gateway access states.');
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
