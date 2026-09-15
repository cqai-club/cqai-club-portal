const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const sharp = require('sharp');

const projectRoot = path.resolve(__dirname, '..');
const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'cqai-club-ci-'));
const databasePath = path.join(tempDirectory, 'smoke-test.db');
const adminUsername = 'ci-admin';
const adminPassword = 'ci-password-for-tests-only';
const ciAdminToken = randomBytes(32).toString('hex');
const ciAuthenticatedToken = randomBytes(32).toString('hex');
let applicationProcess;

const checkWebsiteAssets = () => {
  const websiteRoot = path.join(projectRoot, 'site');
  const entryFile = path.join(websiteRoot, 'index.html');
  assert.ok(fs.existsSync(entryFile), 'official website entry should exist');

  const html = fs.readFileSync(entryFile, 'utf8');
  assert.match(html, /<title>重庆AI创享俱乐部/, 'official website should have the expected title');
  assert.match(html, /rel=["']icon["'][^>]+href=["']\/images\/logo-nav\.png["']/, 'official website should use the club favicon');
  assert.match(html, /href=["']\/apply\/["']/, 'official website should link to the local application route');
  assert.match(html, /href=["']\/projects\/["']/, 'official website should link to the public project square');
  const headerNavigation = html.match(/<ul id=["']navLinks["']>([\s\S]*?)<\/ul>/)?.[1] || '';
  const footerNavigation = html.match(/<h4>导航<\/h4>\s*<ul>([\s\S]*?)<\/ul>/)?.[1] || '';
  assert.match(headerNavigation, /href=["']\/projects\/["']>项目广场<\//, 'header should link to the project square');
  assert.match(footerNavigation, /href=["']\/projects\/["']>项目广场<\//, 'footer should link to the project square');
  assert.match(html, /\/api\/projects\?featured=true&limit=6/, 'homepage projects should come from the public API');
  assert.doesNotMatch(
    html,
    /https?:\/\/(?:localhost|127\.0\.0\.1|8\.137\.71\.156)(?=[:/]|$)/,
    'official website should not link to a local or retired server address'
  );

  const references = [
    ...Array.from(html.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi), match => match[1]),
    ...Array.from(html.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g), match => match[1])
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

  const collectionHtml = fs.readFileSync(path.join(websiteRoot, 'collect', 'index.html'), 'utf8');
  assert.match(collectionHtml, /name:\s*["']projectCover["']/, 'project collection should accept one cover image');
  assert.match(collectionHtml, /URLSearchParams\(window\.location\.search\)/, 'project collection should honor the type query parameter');
};

const prepareDatabase = async databaseUrl => {
  const prismaCli = path.join(projectRoot, 'node_modules', 'prisma', 'build', 'index.js');
  assert.ok(fs.existsSync(prismaCli), 'Prisma CLI should be installed');

  const result = spawnSync(process.execPath, [
    prismaCli,
    'migrate',
    'deploy',
    '--schema',
    path.join(projectRoot, 'prisma', 'schema.prisma')
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: databaseUrl }
  });

  assert.equal(
    result.status,
    0,
    `database migrations should deploy cleanly: ${result.stderr || result.stdout}`
  );

  const inspectionClient = new PrismaClient({
    datasources: { db: { url: databaseUrl } }
  });
  try {
    const timestampTypes = await inspectionClient.$queryRawUnsafe(
      `SELECT typeof("createdAt") AS createdType, typeof("updatedAt") AS updatedType, typeof("publishedAt") AS publishedType FROM "Project" WHERE "id" = 'seed-project-logic-garden'`
    );
    assert.deepEqual(
      timestampTypes,
      [{ createdType: 'integer', updatedType: 'integer', publishedType: 'integer' }],
      'seed timestamps must use Prisma-compatible SQLite integer storage'
    );
  } finally {
    await inspectionClient.$disconnect();
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

const requestBuffer = async (baseUrl, pathname, options = {}) => {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const body = Buffer.from(await response.arrayBuffer());
  return { response, body };
};

const assertNormalizedProjectCover = async (result, label) => {
  assert.equal(result.response.status, 200, `${label} should load`);
  assert.equal(result.response.headers.get('content-type'), 'image/jpeg', `${label} should be JPEG`);
  assert.equal(result.response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(
    Number(result.response.headers.get('content-length')),
    result.body.length,
    `${label} should report its normalized byte length`
  );
  assert.ok(result.body.length > 0 && result.body.length <= 5 * 1024 * 1024, `${label} should stay within 5 MiB`);
  const metadata = await sharp(result.body, { failOn: 'warning' }).metadata();
  assert.equal(metadata.format, 'jpeg', `${label} bytes should decode as JPEG`);
  assert.equal(metadata.width, 1600, `${label} should have canonical width`);
  assert.equal(metadata.height, 1000, `${label} should have canonical height`);
  assert.equal(metadata.orientation, undefined, `${label} should not retain EXIF orientation`);
  assert.equal(metadata.exif, undefined, `${label} should not retain EXIF metadata`);
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
    CQAI_STORAGE_ROOT: path.join(tempDirectory, 'storage'),
    CI: 'true',
    CQAI_CI_AUTH_BYPASS: 'enabled-for-smoke-tests',
    CQAI_CI_ADMIN_TOKEN: ciAdminToken,
    CQAI_CI_AUTHENTICATED_TOKEN: ciAuthenticatedToken,
    ADMIN_USERNAME: adminUsername,
    ADMIN_PASSWORD: adminPassword,
    BASE_URL_PROD: 'https://plugins.example.invalid'
  };

  // Prisma 5's SQLite schema engine does not reliably create a missing file
  // when DATABASE_URL is an absolute path on every supported host.
  fs.closeSync(fs.openSync(databasePath, 'w'));
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
  assert.match(portalPage.body, /href=["']\/member["'][^>]*>会员中心</);
  assert.equal(portalPage.response.headers.get('x-powered-by'), null, 'server signature should be hidden');

  const portalImage = await request(baseUrl, '/images/logo-nav.png');
  assert.equal(portalImage.response.status, 200, 'official portal assets should load');
  assert.match(portalImage.response.headers.get('content-type') || '', /image\/png/);

  const applicationPage = await request(baseUrl, '/apply/');
  assert.equal(applicationPage.response.status, 200, 'member application page should load');
  assert.match(applicationPage.body, /重庆AI创享俱乐部 入会申请/);
  assert.match(applicationPage.body, /rel=["']icon["'][^>]+href=["']\/images\/logo-nav\.png["']/);
  assert.match(applicationPage.body, /href=["']\/["']>← 返回俱乐部官网/);

  const collectionPage = await request(baseUrl, '/collect/?type=project');
  assert.equal(collectionPage.response.status, 200, 'project collection page should load');
  assert.match(collectionPage.body, /name:\s*["']projectCover["']/);

  const projectSquare = await request(baseUrl, '/projects/');
  assert.equal(projectSquare.response.status, 200, 'public project square should load');
  assert.match(projectSquare.body, /项目广场/);
  assert.match(projectSquare.body, /href="\/member"[^>]*>\s*会员中心\s*</);

  const publicProjects = await request(baseUrl, '/api/projects?featured=true&limit=6');
  assert.equal(publicProjects.response.status, 200, `featured projects should load: ${publicProjects.body}`);
  const publicProjectsPayload = JSON.parse(publicProjects.body);
  assert.equal(publicProjectsPayload.data.length, 6, 'the six migrated homepage projects should be featured');
  assert.equal(publicProjectsPayload.data[0].slug, 'logic-garden');
  assert.equal(publicProjectsPayload.data[0].name, '理园LogicGarden——私家园林智慧平台');
  const initialSeedUpdatedAt = publicProjectsPayload.data[0].updatedAt;
  assert.equal('internalContact' in publicProjectsPayload.data[0], false, 'public summaries must omit internal contact data');
  assert.equal('sourceSubmissionId' in publicProjectsPayload.data[0], false, 'public summaries must omit submission linkage');

  const publicProjectDetail = await request(baseUrl, '/api/projects/logic-garden');
  assert.equal(publicProjectDetail.response.status, 200, 'public project detail API should load');
  const publicProjectDetailPayload = JSON.parse(publicProjectDetail.body);
  assert.equal(publicProjectDetailPayload.publicContact.type, 'club');
  assert.equal('internalContact' in publicProjectDetailPayload, false, 'public detail must omit internal contact data');

  const projectDetailPage = await request(baseUrl, '/projects/logic-garden');
  assert.equal(projectDetailPage.response.status, 200, 'public project detail page should load');
  assert.match(projectDetailPage.body, /理园LogicGarden/);

  const projectCover = await request(baseUrl, '/api/projects/logic-garden/cover');
  assert.equal(projectCover.response.status, 200, 'published project cover should load');
  assert.match(projectCover.response.headers.get('content-type') || '', /image\/jpeg/);
  assert.equal(projectCover.response.headers.get('x-content-type-options'), 'nosniff');

  const unauthorizedProjects = await request(baseUrl, '/api/admin/projects');
  assert.equal(unauthorizedProjects.response.status, 401, 'project administration should reject anonymous access');

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
    : { authorization: `Bearer ${ciAdminToken}` };
  const legacyAuthorization = { authorization: `Bearer ${token}` };
  const authenticatedWithoutPermission = {
    authorization: `Bearer ${ciAuthenticatedToken}`
  };

  const legacyTokenRequest = await request(baseUrl, '/api/admin/projects', {
    headers: legacyAuthorization
  });
  assert.equal(
    legacyTokenRequest.response.status,
    401,
    'legacy admin tokens must not bypass Logto resource permissions'
  );
  const forbiddenProjects = await request(baseUrl, '/api/admin/projects', {
    headers: authenticatedWithoutPermission
  });
  assert.equal(
    forbiddenProjects.response.status,
    403,
    'authenticated users without member:admin must be forbidden'
  );

  const editableSeedProject = await request(baseUrl, '/api/admin/projects/seed-project-logic-garden', {
    method: 'PATCH',
    headers: { ...authorization, 'content-type': 'application/json', 'if-match': initialSeedUpdatedAt },
    body: JSON.stringify({ ownerName: 'CI migration editor' })
  });
  assert.equal(
    editableSeedProject.response.status,
    200,
    `migrated projects must remain editable: ${editableSeedProject.body}`
  );
  const staleSeedUpdate = await request(baseUrl, '/api/admin/projects/seed-project-logic-garden', {
    method: 'PATCH',
    headers: { ...authorization, 'content-type': 'application/json', 'if-match': initialSeedUpdatedAt },
    body: JSON.stringify({ ownerName: 'stale editor' })
  });
  assert.equal(staleSeedUpdate.response.status, 409, 'stale administrator edits must not overwrite newer project data');
  const lockedSeedSlug = await request(baseUrl, '/api/admin/projects/seed-project-logic-garden', {
    method: 'PATCH',
    headers: { ...authorization, 'content-type': 'application/json' },
    body: JSON.stringify({ slug: 'changed-after-publish' })
  });
  assert.equal(lockedSeedSlug.response.status, 400, 'a migrated published project slug must stay locked');
  const occupiedFeaturedOrder = await request(baseUrl, '/api/admin/projects/seed-project-logic-garden', {
    method: 'PATCH',
    headers: { ...authorization, 'content-type': 'application/json' },
    body: JSON.stringify({ featuredOrder: 2 })
  });
  assert.equal(occupiedFeaturedOrder.response.status, 409, 'published homepage positions must remain unique');

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
    projectBio: 'Collection submission for automated testing\nSecond paragraph',
    needs: 'Pilot customer\nTechnical partner',
    projectContact: '19900000001',
    consent: 'true'
  };
  const collectionForm = new FormData();
  for (const [key, value] of Object.entries(collectionApplication)) {
    collectionForm.append(key, value);
  }
  const coverBytes = await sharp(Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1600">
      <defs>
        <linearGradient id="cover-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#5f4b8b"/>
          <stop offset="0.5" stop-color="#d7bde2"/>
          <stop offset="1" stop-color="#f39c6b"/>
        </linearGradient>
      </defs>
      <rect width="2400" height="1600" fill="url(#cover-gradient)"/>
      <circle cx="1200" cy="800" r="420" fill="#ffffff" fill-opacity="0.45"/>
    </svg>
  `)).png().toBuffer();
  assert.ok(coverBytes.length <= 5 * 1024 * 1024, 'real project cover fixture should fit the upload limit');
  collectionForm.append('projectCover', new Blob([coverBytes], { type: 'image/png' }), 'ci-project-cover.unexpected');
  const collectionSubmission = await request(baseUrl, '/api/collection-submissions', {
    method: 'POST',
    headers: {
      'x-forwarded-for': '203.0.113.66',
      'x-real-ip': '198.51.100.42'
    },
    body: collectionForm
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
  const collectionDetailPayload = JSON.parse(collectionDetail.body);
  assert.equal(collectionDetailPayload.payload.projectName, collectionApplication.projectName);
  assert.equal(collectionDetailPayload.assets[0].kind, 'projectCover');
  assert.equal(collectionDetailPayload.assets[0].mimeType, 'image/jpeg');
  assert.ok(collectionDetailPayload.assets[0].size <= 5 * 1024 * 1024);
  assert.equal(
    collectionDetailPayload.ipAddress,
    '198.51.100.42',
    'rate limiting and audit data must use the reverse proxy address instead of spoofed X-Forwarded-For'
  );
  const collectionAssetBytes = await requestBuffer(
    baseUrl,
    collectionDetailPayload.assets[0].downloadUrl,
    { headers: authorization }
  );
  await assertNormalizedProjectCover(collectionAssetBytes, 'stored project submission cover');
  assert.ok(
    collectionAssetBytes.body.length < coverBytes.length,
    'project submission cover should be compressed from the source PNG'
  );

  const prematureImport = await request(
    baseUrl,
    `/api/admin/collection-submissions/${collectionId}/import-project`,
    { method: 'POST', headers: authorization }
  );
  assert.equal(prematureImport.response.status, 409, 'unapproved submissions must not enter the project square');

  const collectionStatus = await request(baseUrl, `/api/admin/collection-submissions/${collectionId}/status`, {
    method: 'PATCH',
    headers: { ...authorization, 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'approved' })
  });
  assert.equal(collectionStatus.response.status, 200, 'collection status should update');
  assert.equal(JSON.parse(collectionStatus.body).status, 'approved');

  const concurrentImports = await Promise.all([
    request(
      baseUrl,
      `/api/admin/collection-submissions/${collectionId}/import-project`,
      { method: 'POST', headers: authorization }
    ),
    request(
      baseUrl,
      `/api/admin/collection-submissions/${collectionId}/import-project`,
      { method: 'POST', headers: authorization }
    )
  ]);
  assert.deepEqual(
    concurrentImports.map(result => result.response.status).sort(),
    [200, 201],
    `concurrent imports should create exactly one draft: ${concurrentImports.map(result => result.body).join(' | ')}`
  );
  const concurrentPayloads = concurrentImports.map(result => JSON.parse(result.body));
  const importedPayload = concurrentPayloads.find(payload => payload.created);
  assert.ok(importedPayload, 'one concurrent import should report that it created the project');
  assert.equal(
    concurrentPayloads[0].project.id,
    concurrentPayloads[1].project.id,
    'concurrent imports should resolve to the same project'
  );
  assert.equal(importedPayload.created, true);
  assert.equal(importedPayload.project.status, 'draft');
  assert.equal(importedPayload.project.internalContact, collectionApplication.projectContact);
  assert.equal(importedPayload.project.description, collectionApplication.projectBio);
  assert.equal(importedPayload.project.collaborationNeeds, collectionApplication.needs);
  assert.ok(importedPayload.project.coverUrl, 'the project cover should be copied into independent storage');
  assert.equal(importedPayload.project.coverMimeType, 'image/jpeg');
  assert.ok(importedPayload.project.coverSize <= 5 * 1024 * 1024);
  const importedProjectId = importedPayload.project.id;
  const importedProjectSlug = importedPayload.project.slug;
  const importedAdminCover = await requestBuffer(
    baseUrl,
    `/api/admin/projects/${importedProjectId}/cover`,
    { headers: authorization }
  );
  await assertNormalizedProjectCover(importedAdminCover, 'imported project cover');

  const repeatedImport = await request(
    baseUrl,
    `/api/admin/collection-submissions/${collectionId}/import-project`,
    { method: 'POST', headers: authorization }
  );
  assert.equal(repeatedImport.response.status, 200, 'repeated import should return the existing project');
  assert.equal(JSON.parse(repeatedImport.body).created, false);
  assert.equal(JSON.parse(repeatedImport.body).project.id, importedProjectId);

  const hiddenDraft = await request(baseUrl, `/api/projects/${importedProjectSlug}`);
  assert.equal(hiddenDraft.response.status, 404, 'draft projects must remain private');

  const invalidContact = await request(baseUrl, `/api/admin/projects/${importedProjectId}`, {
    method: 'PATCH',
    headers: { ...authorization, 'content-type': 'application/json' },
    body: JSON.stringify({ publicContactType: 'email', publicContactValue: 'not-an-email' })
  });
  assert.equal(invalidContact.response.status, 400, 'invalid public contact data should be rejected');

  const featureDraft = await request(baseUrl, `/api/admin/projects/${importedProjectId}`, {
    method: 'PATCH',
    headers: { ...authorization, 'content-type': 'application/json' },
    body: JSON.stringify({ featured: true, featuredOrder: 1 })
  });
  assert.equal(featureDraft.response.status, 200, 'a draft may be prepared as a homepage recommendation');
  const blockedFeaturedPublish = await request(baseUrl, `/api/admin/projects/${importedProjectId}/status`, {
    method: 'PATCH',
    headers: { ...authorization, 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'published' })
  });
  assert.equal(blockedFeaturedPublish.response.status, 409, 'a seventh featured project must be rejected');

  const preparePublish = await request(baseUrl, `/api/admin/projects/${importedProjectId}`, {
    method: 'PATCH',
    headers: { ...authorization, 'content-type': 'application/json' },
    body: JSON.stringify({
      featured: false,
      featuredOrder: null,
      publicContactType: 'email',
      publicContactValue: 'project@example.invalid'
    })
  });
  assert.equal(preparePublish.response.status, 200, `project should be ready to publish: ${preparePublish.body}`);

  const publishProject = await request(baseUrl, `/api/admin/projects/${importedProjectId}/status`, {
    method: 'PATCH',
    headers: { ...authorization, 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'published' })
  });
  assert.equal(publishProject.response.status, 200, `complete project should publish: ${publishProject.body}`);

  const visibleProject = await request(baseUrl, `/api/projects/${importedProjectSlug}`);
  assert.equal(visibleProject.response.status, 200, 'published project should become public');
  const visiblePayload = JSON.parse(visibleProject.body);
  assert.equal(visiblePayload.publicContact.type, 'email');
  assert.equal(visiblePayload.publicContact.value, 'project@example.invalid');
  assert.equal('internalContact' in visiblePayload, false, 'published project must not leak internal contact');
  assert.equal('sourceSubmissionId' in visiblePayload, false, 'published project must not leak its submission id');
  const visibleProjectCover = await requestBuffer(
    baseUrl,
    `/api/projects/${importedProjectSlug}/cover`
  );
  await assertNormalizedProjectCover(visibleProjectCover, 'published imported project cover');

  const updatedProject = await request(baseUrl, `/api/admin/projects/${importedProjectId}`, {
    method: 'PATCH',
    headers: { ...authorization, 'content-type': 'application/json' },
    body: JSON.stringify({ summary: 'Updated public project summary' })
  });
  assert.equal(updatedProject.response.status, 200, 'published project should remain directly editable');
  assert.equal(
    JSON.parse((await request(baseUrl, `/api/projects/${importedProjectSlug}`)).body).summary,
    'Updated public project summary',
    'published edits should be visible immediately'
  );

  const manualDraft = await request(baseUrl, '/api/admin/projects', {
    method: 'POST',
    headers: { ...authorization, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Incomplete CI Project' })
  });
  assert.equal(manualDraft.response.status, 201, 'administrators should be able to create a manual draft');
  const manualDraftId = JSON.parse(manualDraft.body).id;
  const incompletePublish = await request(baseUrl, `/api/admin/projects/${manualDraftId}/status`, {
    method: 'PATCH',
    headers: { ...authorization, 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'published' })
  });
  assert.equal(incompletePublish.response.status, 400, 'incomplete projects must not publish');

  const invalidCoverForm = new FormData();
  const truncatedPng = coverBytes.subarray(0, 64);
  assert.deepEqual(
    [...truncatedPng.subarray(0, 8)],
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    'truncated fixture should retain a valid PNG signature'
  );
  invalidCoverForm.append('cover', new Blob([truncatedPng], { type: 'image/png' }), 'truncated.png');
  const invalidCover = await request(baseUrl, `/api/admin/projects/${manualDraftId}/cover`, {
    method: 'PUT',
    headers: authorization,
    body: invalidCoverForm
  });
  assert.equal(invalidCover.response.status, 400, 'cover uploads must fully decode signature-valid images');

  const excessivePixelCoverBytes = await sharp({
    create: {
      width: 8000,
      height: 5001,
      channels: 3,
      background: { r: 85, g: 70, b: 130 }
    }
  }).png({ compressionLevel: 9 }).toBuffer();
  assert.ok(excessivePixelCoverBytes.length <= 5 * 1024 * 1024, 'pixel-limit fixture should fit the byte limit');
  const excessivePixelCoverForm = new FormData();
  excessivePixelCoverForm.append(
    'cover',
    new Blob([excessivePixelCoverBytes], { type: 'image/png' }),
    'too-many-pixels.png'
  );
  const excessivePixelCover = await request(baseUrl, `/api/admin/projects/${manualDraftId}/cover`, {
    method: 'PUT',
    headers: authorization,
    body: excessivePixelCoverForm
  });
  assert.equal(excessivePixelCover.response.status, 400, 'covers above the 40 MP decode limit must be rejected');

  const oversizedCoverBytes = Buffer.alloc((5 * 1024 * 1024) + 1);
  coverBytes.copy(oversizedCoverBytes);
  const oversizedCoverForm = new FormData();
  oversizedCoverForm.append(
    'cover',
    new Blob([oversizedCoverBytes], { type: 'image/png' }),
    'oversized.png'
  );
  const oversizedCover = await request(baseUrl, `/api/admin/projects/${manualDraftId}/cover`, {
    method: 'PUT',
    headers: authorization,
    body: oversizedCoverForm
  });
  assert.equal(oversizedCover.response.status, 400, 'covers larger than 5 MiB must be rejected');
  assert.match(oversizedCover.body, /5MB/, 'oversized cover rejection should explain the limit');

  const orientedCoverBytes = await sharp({
    create: {
      width: 1200,
      height: 2000,
      channels: 4,
      background: { r: 35, g: 140, b: 190, alpha: 0.55 }
    }
  })
    .jpeg({ quality: 96 })
    .withMetadata({ orientation: 6 })
    .toBuffer();
  assert.equal((await sharp(orientedCoverBytes).metadata()).orientation, 6, 'admin fixture should carry EXIF orientation');
  const orientedCoverForm = new FormData();
  orientedCoverForm.append(
    'cover',
    new Blob([orientedCoverBytes], { type: 'image/jpeg' }),
    'oriented-cover.jpg'
  );
  const orientedCoverUpload = await request(baseUrl, `/api/admin/projects/${manualDraftId}/cover`, {
    method: 'PUT',
    headers: authorization,
    body: orientedCoverForm
  });
  assert.equal(orientedCoverUpload.response.status, 200, `valid admin cover should upload: ${orientedCoverUpload.body}`);
  const orientedCoverPayload = JSON.parse(orientedCoverUpload.body);
  assert.equal(orientedCoverPayload.coverMimeType, 'image/jpeg');
  assert.ok(orientedCoverPayload.coverSize > 0 && orientedCoverPayload.coverSize <= 5 * 1024 * 1024);
  const normalizedAdminCover = await requestBuffer(
    baseUrl,
    `/api/admin/projects/${manualDraftId}/cover`,
    { headers: authorization }
  );
  await assertNormalizedProjectCover(normalizedAdminCover, 'administrator-uploaded project cover');

  const unpublishProject = await request(baseUrl, `/api/admin/projects/${importedProjectId}/status`, {
    method: 'PATCH',
    headers: { ...authorization, 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'unpublished' })
  });
  assert.equal(unpublishProject.response.status, 200, 'published project should be removable from public view');
  assert.equal((await request(baseUrl, `/api/projects/${importedProjectSlug}`)).response.status, 404, 'unpublished detail must be hidden');
  assert.equal((await request(baseUrl, `/api/projects/${importedProjectSlug}/cover`)).response.status, 404, 'unpublished cover must be hidden');

  const collectionExport = await request(baseUrl, '/api/admin/collection-submissions/export', {
    headers: authorization
  });
  assert.equal(collectionExport.response.status, 200, `collection CSV export should succeed: ${collectionExport.body}`);
  assert.match(collectionExport.response.headers.get('content-type') || '', /text\/csv/);
  assert.match(collectionExport.body, /CI Collection Project/);

  console.log('Smoke test passed: portal, project square, project lifecycle, applications, authenticated administration, submissions, exports, and permission boundaries.');

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
