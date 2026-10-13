import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// CI uses Node 20, which cannot import TypeScript directly. Use the same
// in-memory transpilation approach as the portal's other module tests.
const filename = new URL('../lib/ebao-download.ts', import.meta.url);
const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  fileName: filename.pathname,
}).outputText;
const moduleExports = {};
runInNewContext(compiled, {
  exports: moduleExports,
  require: createRequire(import.meta.url),
  process, fetch, URL, AbortSignal,
}, { filename: filename.pathname });
const { resolveEbaoDownload, selectDownloadSource } = moduleExports;

const repositories = {
  github: {
    apiPath: '/repos/cqai-club/ebao-studio/releases',
    releases: 'https://github.com/cqai-club/ebao-studio/releases',
  },
  gitcode: {
    apiPath: '/api/v5/repos/g-dxw/ebao-studio/releases',
    releases: 'https://gitcode.com/g-dxw/ebao-studio/releases',
  },
};

function installer(source, version, platform = 'windows', overrides = {}) {
  const name = overrides.name ?? `eBao-Studio-${version}-${platform === 'windows' ? 'x64-Setup.exe' : 'universal.dmg'}`;
  return {
    name,
    browser_download_url: `${repositories[source].releases}/download/v${version}/${name}`,
    ...overrides,
  };
}

function release(date, assets, overrides = {}) {
  return { published_at: date, assets, ...overrides };
}

function responseFor(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function mockReleaseFetch(payload, calls = []) {
  return async (url, init) => {
    calls.push({ url: new URL(url), init });
    return responseFor(payload);
  };
}

test('visitor IP selects GitCode for China and GitHub for overseas IPv4 and IPv6', () => {
  for (const [ip, expected] of [
    ['223.5.5.5', 'gitcode'],
    ['2400:3200::1', 'gitcode'],
    ['8.8.8.8', 'github'],
    ['2001:4860:4860::8888', 'github'],
  ]) {
    assert.equal(selectDownloadSource(new Headers({ 'x-real-ip': ip }), null), expected, ip);
  }
});

test('manual source selection overrides location; invalid choices use location', () => {
  const chineseVisitor = new Headers({ 'x-real-ip': '223.5.5.5' });
  const overseasVisitor = new Headers({ 'x-real-ip': '8.8.8.8' });
  assert.equal(selectDownloadSource(chineseVisitor, 'github'), 'github');
  assert.equal(selectDownloadSource(overseasVisitor, 'gitcode'), 'gitcode');
  for (const invalid of ['', 'unknown', 'https://example.com']) {
    assert.equal(selectDownloadSource(chineseVisitor, invalid), 'gitcode');
    assert.equal(selectDownloadSource(overseasVisitor, invalid), 'github');
  }
});

test('trusted real IP takes priority and forwarded chains use the proxy-appended last IP', () => {
  assert.equal(selectDownloadSource(new Headers({
    'x-real-ip': '8.8.8.8',
    'x-forwarded-for': '223.5.5.5',
  }), null), 'github');
  assert.equal(selectDownloadSource(new Headers({
    'x-real-ip': '223.5.5.5',
    'x-forwarded-for': '8.8.8.8',
  }), null), 'gitcode');
  assert.equal(selectDownloadSource(new Headers({
    'x-forwarded-for': '223.5.5.5, 8.8.8.8',
  }), null), 'github', 'a client-supplied first address must not select the mirror');
  assert.equal(selectDownloadSource(new Headers({
    'x-forwarded-for': '8.8.8.8, 2400:3200::1',
  }), null), 'gitcode');
});

test('unknown, private and absent visitor addresses default to GitHub', () => {
  for (const ip of ['127.0.0.1', '10.0.0.1', '::1', 'not-an-ip']) {
    assert.equal(selectDownloadSource(new Headers({ 'x-real-ip': ip }), null), 'github', ip);
  }
  assert.equal(selectDownloadSource(new Headers(), null), 'github');
});

for (const source of ['github', 'gitcode']) {
  test(`${source}: latest usable platform installer is selected from fresh releases on every click`, async () => {
    const calls = [];
    const older = installer(source, '1.0.0');
    const latestWindows = installer(source, '1.1.0');
    const latestMac = installer(source, '1.2.0', 'macos');
    const payload = [
      release('2026-01-01T00:00:00Z', [older]),
      release('2026-03-01T00:00:00Z', [latestMac]),
      release('2026-02-01T00:00:00Z', [latestWindows]),
    ];
    const fetcher = mockReleaseFetch(payload, calls);
    assert.equal(await resolveEbaoDownload('windows', source, fetcher), latestWindows.browser_download_url);
    assert.equal(await resolveEbaoDownload('macos', source, fetcher), latestMac.browser_download_url);
    assert.equal(calls.length, 2, 'each click must read current release metadata');
    for (const { url, init } of calls) {
      assert.equal(url.pathname, repositories[source].apiPath);
      assert.equal(url.searchParams.get('per_page'), '100');
      if (source === 'gitcode') assert.equal(url.searchParams.get('direction'), 'desc');
      assert.equal(init.cache, 'no-store');
      assert.ok(init.signal instanceof AbortSignal, 'metadata requests must have a deadline');
    }
  });

  test(`${source}: drafts are skipped and a newer published prerelease remains downloadable`, async () => {
    const stable = installer(source, '1.0.0');
    const beta = installer(source, '1.1.0-beta.1');
    const draft = installer(source, '2.0.0');
    const payload = [
      release('2026-04-01T00:00:00Z', [draft], { draft: true }),
      release('2026-03-01T00:00:00Z', [draft], { release_status: 'draft' }),
      release('2026-02-01T00:00:00Z', [beta], { prerelease: true }),
      release('2026-01-01T00:00:00Z', [stable]),
    ];
    assert.equal(await resolveEbaoDownload('windows', source, mockReleaseFetch(payload)), beta.browser_download_url);
  });

  test(`${source}: created_at is used when a release has no published_at`, async () => {
    const latest = installer(source, '1.1.0');
    const payload = [
      release('2026-01-01T00:00:00Z', [installer(source, '1.0.0')]),
      { created_at: '2026-02-01T00:00:00Z', assets: [latest] },
    ];
    assert.equal(await resolveEbaoDownload('windows', source, mockReleaseFetch(payload)), latest.browser_download_url);
  });

  for (const [description, higherVersion, laterUploadedVersion] of [
    ['higher version wins over a later mirror upload', '0.0.14', '0.0.13'],
    ['prerelease numbers are compared numerically', '1.0.0-beta.10', '1.0.0-beta.2'],
    ['final release wins over a later prerelease of the same version', '1.0.0', '1.0.0-beta.10'],
    ['next-major prerelease wins over an older stable release', '2.0.0-beta.1', '1.0.0'],
  ]) {
    test(`${source}: ${description}`, async () => {
      const wanted = installer(source, higherVersion);
      const payload = [
        {
          tag_name: `v${laterUploadedVersion}`,
          created_at: '2026-02-01T00:00:00Z',
          prerelease: laterUploadedVersion.includes('-'),
          assets: [installer(source, laterUploadedVersion)],
        },
        {
          tag_name: `v${higherVersion}`,
          created_at: '2026-01-01T00:00:00Z',
          prerelease: higherVersion.includes('-'),
          assets: [wanted],
        },
      ];
      assert.equal(await resolveEbaoDownload('windows', source, mockReleaseFetch(payload)), wanted.browser_download_url);
    });
  }

  test(`${source}: source archives, update artifacts and unrelated installers are not installation downloads`, async () => {
    const wanted = installer(source, '1.0.0', 'macos', { name: 'EBAO-STUDIO-1.0.0-UNIVERSAL.DMG' });
    const payload = [
      release('2026-02-01T00:00:00Z', [
        installer(source, '2.0.0', 'macos', { name: 'Source-code.zip' }),
        installer(source, '2.0.0', 'macos', { name: 'eBao-Studio-2.0.0.dmg.blockmap' }),
        installer(source, '2.0.0', 'macos', { name: 'other-app-2.0.0.dmg' }),
        installer(source, '2.0.0'),
      ]),
      release('2026-01-01T00:00:00Z', [wanted]),
    ];
    assert.equal(await resolveEbaoDownload('macos', source, mockReleaseFetch(payload)), wanted.browser_download_url);
  });

  test(`${source}: incomplete uploads, source packages and other Windows architectures are skipped`, async () => {
    const wanted = installer(source, '1.0.0');
    const payload = [
      release('2026-02-01T00:00:00Z', [
        installer(source, '2.0.0', 'windows', { state: 'new' }),
        installer(source, '2.0.0', 'windows', { type: 'source' }),
        installer(source, '2.0.0', 'windows', { name: 'eBao-Studio-2.0.0-arm64-Setup.exe' }),
      ]),
      release('2026-01-01T00:00:00Z', [wanted]),
    ];
    assert.equal(await resolveEbaoDownload('windows', source, mockReleaseFetch(payload)), wanted.browser_download_url);
  });

  test(`${source}: asset URLs must be official HTTPS download paths without credentials`, async () => {
    const allowed = installer(source, '1.0.0');
    const otherSource = source === 'github' ? 'gitcode' : 'github';
    const invalidUrls = [
      'not-a-url',
      allowed.browser_download_url.replace('https:', 'http:'),
      allowed.browser_download_url.replace('https://', 'https://user:password@'),
      allowed.browser_download_url.replace('/releases/download/', '/blob/'),
      allowed.browser_download_url.replace('/ebao-studio/', '/another-repo/'),
      installer(otherSource, '2.0.0').browser_download_url,
      'https://example.com/eBao-Studio-2.0.0.exe',
    ];
    for (const browser_download_url of invalidUrls) {
      const payload = [
        release('2026-02-01T00:00:00Z', [installer(source, '2.0.0', 'windows', { browser_download_url })]),
        release('2026-01-01T00:00:00Z', [allowed]),
      ];
      assert.equal(await resolveEbaoDownload('windows', source, mockReleaseFetch(payload)), allowed.browser_download_url, browser_download_url);
    }
  });

  test(`${source}: malformed metadata and missing installers fall back to the same releases page`, async () => {
    for (const payload of [
      null,
      {},
      { data: [] },
      [],
      [null, 'malformed'],
      [release('2026-01-01T00:00:00Z', null)],
      [release('2026-01-01T00:00:00Z', [null, {}, 'malformed'])],
      [release('2026-01-01T00:00:00Z', [installer(source, '1.0.0', 'macos')])],
    ]) {
      const calls = [];
      assert.equal(await resolveEbaoDownload('windows', source, mockReleaseFetch(payload, calls)), repositories[source].releases);
      assert.equal(calls.length, 1, 'unusable metadata must not trigger requests to a different source');
    }
  });

  test(`${source}: HTTP, JSON and network errors keep the chosen source`, async () => {
    for (const failure of [
      async () => responseFor({ message: 'unavailable' }, 503),
      async () => new Response('invalid JSON', { status: 200 }),
      async () => { throw new TypeError('network unavailable'); },
    ]) {
      const calls = [];
      const fetcher = async (url, init) => {
        calls.push({ url: new URL(url), init });
        return failure();
      };
      assert.equal(await resolveEbaoDownload('windows', source, fetcher), repositories[source].releases);
      assert.equal(calls.length, 1, 'source failure must not silently switch download providers');
      assert.equal(calls[0].url.pathname, repositories[source].apiPath);
    }
  });

  test(`${source}: a five-second metadata timeout falls back to its releases page`, async t => {
    let configuredTimeout;
    let requestOptions;
    t.mock.method(AbortSignal, 'timeout', milliseconds => {
      configuredTimeout = milliseconds;
      return AbortSignal.abort(new DOMException('deadline reached', 'TimeoutError'));
    });
    const fetcher = async (_url, init) => {
      requestOptions = init;
      init.signal.throwIfAborted();
      throw new Error('timeout signal must be aborted');
    };
    assert.equal(await resolveEbaoDownload('windows', source, fetcher), repositories[source].releases);
    assert.equal(configuredTimeout, 5000);
    assert.equal(requestOptions.cache, 'no-store');
    assert.ok(requestOptions.signal instanceof AbortSignal);
    assert.equal(requestOptions.signal.aborted, true);
    assert.equal(requestOptions.signal.reason.name, 'TimeoutError');
    assert.equal(AbortSignal.timeout.mock.callCount(), 1);
  });
}
