const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');

const projectRoot = path.resolve(__dirname, '..');
const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'cqai-club-ci-'));
const databasePath = path.join(tempDirectory, 'smoke-test.db');
const adminUsername = 'ci-admin';
const adminPassword = 'ci-password-for-tests-only';
let applicationProcess;

const checkWebsiteAssets = () => {
  const websiteRoot = path.join(projectRoot, 'site');
  const entryFile = path.join(websiteRoot, 'index.html');
  assert.ok(fs.existsSync(entryFile), 'official website entry should exist');

  const html = fs.readFileSync(entryFile, 'utf8');
  assert.match(html, /<title>重庆AI创享俱乐部/, 'official website should have the expected title');
  assert.match(html, /rel=["']icon["'][^>]+href=["']\/images\/logo-nav\.png["']/, 'official website should use the club favicon');
  assert.match(html, /href=["']\/apply\/["']/, 'official website should link to the local application route');
  assert.doesNotMatch(
    html,
    /https?:\/\/(?:localhost|127\.0\.0\.1|8\.137\.71\.156)(?=[:/]|$)/,
    'official website should not link to a local or retired server address'
  );

  const references = [
    ...Array.from(html.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi), match => match[1]),
    ...Array.from(html.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi), match => match[1])
  ];

  const localReferences = references
    .filter(Boolean)
    .filter(reference => !/^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(reference));

  for (const reference of new Set(localReferences)) {
    const relativePath = reference.split(/[?#]/, 1)[0];
    if (!relativePath) continue;

    const assetPath = path.resolve(websiteRoot, relativePath);
    assert.ok(
      assetPath.startsWith(`${websiteRoot}${path.sep}`),
      `website asset should remain inside site/: ${reference}`
    );
    assert.ok(fs.existsSync(assetPath), `website asset should exist: ${reference}`);
  }
};

const prepareDatabase = async databaseUrl => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const migrationsDirectory = path.join(projectRoot, 'prisma', 'migrations');
  const migrationFiles = fs.readdirSync(migrationsDirectory, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(migrationsDirectory, entry.name, 'migration.sql'))
    .filter(file => fs.existsSync(file))
    .sort();

  assert.ok(migrationFiles.length > 0, 'at least one database migration should exist');

  try {
    for (const migrationFile of migrationFiles) {
      const statements = fs.readFileSync(migrationFile, 'utf8')
        .replace(/^\s*--.*$/gm, '')
        .split(';')
        .map(statement => statement.trim())
        .filter(Boolean);

      for (const statement of statements) {
        await prisma.$executeRawUnsafe(statement);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
};

const reservePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.unref();
  server.on('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    server.close(error => {
      if (error) return reject(error);
      resolve(address.port);
    });
  });
});

const request = async (baseUrl, pathname, options = {}) => {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const body = await response.text();
  return { response, body };
};

const waitForServer = async baseUrl => {
  const deadline = Date.now() + 15_000;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const result = await request(baseUrl, '/');
      if (result.response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  throw new Error(`Server did not become ready: ${lastError || 'timeout'}`);
};

const stopApplication = async () => {
  if (!applicationProcess || applicationProcess.exitCode !== null) return;

  applicationProcess.kill('SIGTERM');
  await Promise.race([
    new Promise(resolve => applicationProcess.once('exit', resolve)),
    new Promise(resolve => setTimeout(resolve, 3_000))
  ]);

  if (applicationProcess.exitCode === null) applicationProcess.kill('SIGKILL');
};

const main = async () => {
  checkWebsiteAssets();

  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env,
    DATABASE_URL: `file:${databasePath}`,
    PORT: String(port),
    HOSTNAME: '127.0.0.1',
    CONFIG_DIR: path.join(projectRoot, 'deploy'),
    ADMIN_USERNAME: adminUsername,
    ADMIN_PASSWORD: adminPassword,
    BASE_URL_PROD: 'https://plugins.example.invalid'
  };

  await prepareDatabase(env.DATABASE_URL);

  // The application is a Next.js `output: 'standalone'` build. The CI runner
  // produces that build in a prior step; the server is the standalone
  // server.js (reads ./site and ./storage relative to process.cwd()).
  const serverScript = path.join(projectRoot, '.next', 'standalone', 'server.js');
  assert.ok(fs.existsSync(serverScript), 'standalone server.js should exist (build it first)');

  applicationProcess = spawn(process.execPath, [serverScript], {
    cwd: projectRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let serverOutput = '';
  applicationProcess.stdout.on('data', chunk => { serverOutput += chunk; });
  applicationProcess.stderr.on('data', chunk => { serverOutput += chunk; });

  await waitForServer(baseUrl);

  const health = await request(baseUrl, '/api/health');
  assert.equal(health.response.status, 200, 'health endpoint should load');
  assert.deepEqual(JSON.parse(health.body), { status: 'ok' });

  const portalPage = await request(baseUrl, '/');
  assert.equal(portalPage.response.status, 200, 'official portal should load');
  assert.match(portalPage.body, /重庆AI创享俱乐部 \| 在重庆，做AI/);
  assert.equal(portalPage.response.headers.get('x-powered-by'), null, 'server signature should be hidden');

  const portalImage = await request(baseUrl, '/images/logo-nav.png');
  assert.equal(portalImage.response.status, 200, 'official portal assets should load');
  assert.match(portalImage.response.headers.get('content-type') || '', /image\/png/);

  const applicationPage = await request(baseUrl, '/apply/');
  assert.equal(applicationPage.response.status, 200, 'member application page should load');
  assert.match(applicationPage.body, /重庆AI创享俱乐部 入会申请/);
  assert.match(applicationPage.body, /rel=["']icon["'][^>]+href=["']\/images\/logo-nav\.png["']/);
  assert.match(applicationPage.body, /href=["']\/["']>← 返回俱乐部官网/);

  const legacyAdminPage = await request(baseUrl, '/admin/', { redirect: 'manual' });
  assert.equal(legacyAdminPage.response.status, 307, 'legacy admin URL should redirect');
  assert.equal(
    new URL(legacyAdminPage.response.headers.get('location'), baseUrl).pathname,
    '/member/dashboard/admin/members'
  );

  const legacyCollectionsPage = await request(baseUrl, '/collection-admin.html', { redirect: 'manual' });
  assert.equal(legacyCollectionsPage.response.status, 307, 'legacy collections URL should redirect');
  assert.equal(
    new URL(legacyCollectionsPage.response.headers.get('location'), baseUrl).pathname,
    '/member/dashboard/admin/collections'
  );

  const unauthorizedMembers = await request(baseUrl, '/api/admin/members');
  assert.equal(unauthorizedMembers.response.status, 401, 'admin API should reject anonymous access');

  const invalidLogin = await request(baseUrl, '/api/admin/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: adminUsername, password: 'incorrect-test-password' })
  });
  assert.equal(invalidLogin.response.status, 401, 'invalid admin credentials should be rejected');

  const validLogin = await request(baseUrl, '/api/admin/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: adminUsername, password: adminPassword })
  });
  assert.equal(validLogin.response.status, 200, 'valid admin credentials should be accepted');
  const { token } = JSON.parse(validLogin.body);
  assert.ok(token, 'admin login should return a session token');

  const resourceSessionCookie = process.env.CI_LOGTO_SESSION_COOKIE;

  const catalogManifest = await request(baseUrl, '/catalog-source.json');
  assert.equal(catalogManifest.response.status, 200, 'catalog manifest should be public');
  const manifestPayload = JSON.parse(catalogManifest.body);
  assert.equal(manifestPayload.manifestVersion, '1.0.0');
  assert.equal(manifestPayload.transport.endpoint, 'https://plugins.example.invalid/v1/plugins');
  assert.deepEqual(manifestPayload.query.supported, ['q', 'category', 'cursor', 'limit']);

  const emptyCatalog = await request(baseUrl, '/v1/plugins');
  assert.equal(emptyCatalog.response.status, 200, 'empty plugin catalog should be public');
  assert.deepEqual(JSON.parse(emptyCatalog.body).items, []);

  const authorization = resourceSessionCookie
    ? { cookie: resourceSessionCookie }
    : { authorization: `Bearer ${token}` };

  if (!resourceSessionCookie) {
    const legacyTokenRequest = await request(baseUrl, '/api/admin/plugins', {
      headers: authorization
    });
    assert.equal(
      legacyTokenRequest.response.status,
      401,
      'legacy admin tokens must not bypass Logto resource permissions'
    );
    console.log('Skipping authenticated plugin lifecycle: CI_LOGTO_SESSION_COOKIE is not configured.');
  } else {
  const pluginPayload = {
    packageName: 'dsh-plugin-ci-market',
    displayName: 'CI Market Plugin',
    summary: 'A plugin used by the catalog smoke test.',
    description: 'Smoke test detail.',
    categories: ['testing', 'automation'],
    keywords: ['ci', 'catalog'],
    repositoryUrl: 'https://github.com/example/dsh-plugin-ci-market',
    homepageUrl: 'https://example.invalid/dsh-plugin-ci-market',
    iconUrl: 'https://images.example.invalid/plugin.png',
    compatibilityApiVersion: '1.0',
    compatibilityHosts: ['dsh-desktop']
  };
  const invalidPlugin = await request(baseUrl, '/api/admin/plugins', {
    method: 'POST',
    headers: { ...authorization, 'content-type': 'application/json' },
    body: JSON.stringify({ ...pluginPayload, packageName: 'not a package name' })
  });
  assert.equal(invalidPlugin.response.status, 400, 'invalid plugin data should be rejected');

  const draftPlugin = await request(baseUrl, '/api/admin/plugins', {
    method: 'POST',
    headers: { ...authorization, 'content-type': 'application/json' },
    body: JSON.stringify(pluginPayload)
  });
  assert.equal(draftPlugin.response.status, 201, `draft plugin should be created: ${draftPlugin.body}`);
  const draftPluginId = JSON.parse(draftPlugin.body).id;
  assert.ok(draftPluginId, 'draft plugin should return an id');

  const minimalPlugin = await request(baseUrl, '/api/admin/plugins', {
    method: 'POST',
    headers: { ...authorization, 'content-type': 'application/json' },
    body: JSON.stringify({
      packageName: 'dsh-plugin-ci-minimal',
      displayName: 'CI Minimal Plugin',
      summary: 'A plugin with optional URL fields omitted.',
      description: '',
      categories: [],
      keywords: [],
      repositoryUrl: '',
      homepageUrl: '',
      iconUrl: '',
      compatibilityApiVersion: '',
      compatibilityHosts: []
    })
  });
  assert.equal(minimalPlugin.response.status, 201, `empty optional URLs should be accepted: ${minimalPlugin.body}`);

  const draftCatalog = await request(baseUrl, '/v1/plugins');
  assert.deepEqual(JSON.parse(draftCatalog.body).items, [], 'draft plugins must stay private');

  const publishPlugin = await request(baseUrl, `/api/admin/plugins/${draftPluginId}/status`, {
    method: 'PATCH',
    headers: { ...authorization, 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'published' })
  });
  assert.equal(publishPlugin.response.status, 200, 'plugin should publish');

  const publishedCatalog = await request(baseUrl, '/v1/plugins?q=CI%20Market&category=testing&limit=1');
  assert.equal(publishedCatalog.response.status, 200, `published catalog should load: ${publishedCatalog.body}`);
  const publishedPayload = JSON.parse(publishedCatalog.body);
  assert.equal(publishedPayload.items.length, 1, 'published plugin should be discoverable');
  assert.equal(publishedPayload.items[0].package.name, pluginPayload.packageName);
  assert.match(publishedPayload.items[0].media.icon.url, /\/v1\/plugins\/[^/]+\/icon$/);
  assert.equal(publishedPayload.items[0].repository.url, pluginPayload.repositoryUrl);

  const pluginList = await request(baseUrl, '/api/admin/plugins?status=published', { headers: authorization });
  assert.equal(pluginList.response.status, 200, 'published plugin admin list should load');
  assert.equal(JSON.parse(pluginList.body).total, 1);

  const updatedPlugin = await request(baseUrl, `/api/admin/plugins/${draftPluginId}`, {
    method: 'PATCH',
    headers: { ...authorization, 'content-type': 'application/json' },
    body: JSON.stringify({ ...pluginPayload, displayName: 'Updated CI Market Plugin' })
  });
  assert.equal(updatedPlugin.response.status, 200, 'plugin should be editable');
  assert.equal(JSON.parse(updatedPlugin.body).displayName, 'Updated CI Market Plugin');

  const unpublishPlugin = await request(baseUrl, `/api/admin/plugins/${draftPluginId}/status`, {
    method: 'PATCH',
    headers: { ...authorization, 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'unpublished' })
  });
  assert.equal(unpublishPlugin.response.status, 200, 'plugin should be taken offline');
  assert.equal(JSON.parse((await request(baseUrl, '/v1/plugins')).body).items.length, 0, 'unpublished plugins must stay private');
  }

  const testPhone = ['199', '0000', '0000'].join('');
  const application = {
    name: 'CI 测试用户',
    phone: testPhone,
    wechat: 'ci-test-user',
    email: 'ci-test@example.invalid',
    organization: '=CI_TEST_ORG',
    title: '测试工程师',
    orgType: '其他',
    orgTypeOther: '自动化测试',
    provideRes: ['技术能力'],
    provideResOther: '',
    needRes: ['行业交流'],
    needResOther: '',
    purpose: '资源链接',
    purposeOther: '',
    events: ['技术分享'],
    eventsOther: '',
    timePref: '周末',
    city: '重庆',
    cityOther: '',
    roleIntent: '普通会员',
    bio: '仅用于自动化测试',
    privacy: '同意俱乐部内部使用'
  };

  const incompleteSubmission = await request(baseUrl, '/api/apply', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...application, events: [] })
  });
  assert.equal(incompleteSubmission.response.status, 400, 'incomplete application should be rejected');

  const submission = await request(baseUrl, '/api/apply', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(application)
  });
  assert.equal(submission.response.status, 201, `application should be accepted: ${submission.body}`);

  const duplicateSubmission = await request(baseUrl, '/api/apply', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(application)
  });
  assert.equal(duplicateSubmission.response.status, 400, 'duplicate phone should be rejected');

  if (resourceSessionCookie) {
  const members = await request(baseUrl, '/api/admin/members?limit=10', { headers: authorization });
  assert.equal(members.response.status, 200, `member query should succeed: ${members.body}`);
  const membersPayload = JSON.parse(members.body);
  assert.equal(membersPayload.total, 1, 'member query should return the submitted application');
  assert.equal(membersPayload.data[0].phone, application.phone);

  const boundedMembers = await request(baseUrl, '/api/admin/members?page=-1&limit=1000', {
    headers: authorization
  });
  assert.equal(boundedMembers.response.status, 200, 'invalid pagination values should be normalized');
  assert.equal(JSON.parse(boundedMembers.body).page, 1);

  const exportResult = await request(baseUrl, '/api/admin/members/export', { headers: authorization });
  assert.equal(exportResult.response.status, 200, `CSV export should succeed: ${exportResult.body}`);
  assert.match(exportResult.response.headers.get('content-type') || '', /text\/csv/);
  assert.match(exportResult.body, /CI 测试用户/);
  assert.match(exportResult.body, /'=CI_TEST_ORG/, 'CSV export should neutralize spreadsheet formulas');

  const collectionApplication = {
    type: 'project',
    projectName: 'CI Collection Project',
    owner: 'CI Owner',
    oneLine: 'A collection smoke test',
    stage: 'pilot',
    projectFocus: 'Automation',
    projectBio: 'Collection submission for automated testing',
    projectContact: '19900000001',
    consent: 'true'
  };
  const collectionSubmission = await request(baseUrl, '/api/collection-submissions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(collectionApplication)
  });
  assert.equal(collectionSubmission.response.status, 201, `collection submission should be accepted: ${collectionSubmission.body}`);
  const collectionId = JSON.parse(collectionSubmission.body).id;
  assert.ok(collectionId, 'collection submission should return an id');

  const collectionList = await request(baseUrl, '/api/admin/collection-submissions?limit=10', {
    headers: authorization
  });
  assert.equal(collectionList.response.status, 200, `collection query should succeed: ${collectionList.body}`);
  const collectionListPayload = JSON.parse(collectionList.body);
  assert.equal(collectionListPayload.total, 1, 'collection query should return the submitted project');
  assert.equal(collectionListPayload.data[0].id, collectionId);

  const collectionDetail = await request(baseUrl, `/api/admin/collection-submissions/${collectionId}`, {
    headers: authorization
  });
  assert.equal(collectionDetail.response.status, 200, 'collection detail should load');
  assert.equal(JSON.parse(collectionDetail.body).payload.projectName, collectionApplication.projectName);

  const collectionStatus = await request(baseUrl, `/api/admin/collection-submissions/${collectionId}/status`, {
    method: 'PATCH',
    headers: { ...authorization, 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'approved' })
  });
  assert.equal(collectionStatus.response.status, 200, 'collection status should update');
  assert.equal(JSON.parse(collectionStatus.body).status, 'approved');

  const collectionExport = await request(baseUrl, '/api/admin/collection-submissions/export', {
    headers: authorization
  });
  assert.equal(collectionExport.response.status, 200, `collection CSV export should succeed: ${collectionExport.body}`);
  assert.match(collectionExport.response.headers.get('content-type') || '', /text\/csv/);
  assert.match(collectionExport.body, /CI Collection Project/);
  } else {
    const legacyMembersRequest = await request(baseUrl, '/api/admin/members?limit=10', {
      headers: authorization
    });
    assert.equal(legacyMembersRequest.response.status, 401, 'legacy tokens must not access member admin APIs');

    const legacyCollectionsRequest = await request(baseUrl, '/api/admin/collection-submissions?limit=10', {
      headers: authorization
    });
    assert.equal(legacyCollectionsRequest.response.status, 401, 'legacy tokens must not access collection admin APIs');
  }

  console.log(
    resourceSessionCookie
      ? 'Smoke test passed: portal, application, admin, authentication, member and collection submissions, status updates, and CSV exports.'
      : 'Smoke test passed: portal, public submissions, catalog visibility, and Logto permission boundary.'
  );

  if (applicationProcess.exitCode !== null && applicationProcess.exitCode !== 0) {
    throw new Error(`Application exited unexpectedly.\n${serverOutput}`);
  }
};

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await stopApplication();
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  });
