/* eslint-disable @typescript-eslint/no-require-imports -- this Node smoke test is CommonJS */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const { PrismaClient } = require('@prisma/client');

const projectRoot = path.resolve(__dirname, '..');
const siteUrl = 'https://seo.example.test';
// Next renders metadata in <head> for HTML-limited crawlers. Testing with
// Bingbot proves titles, canonical URLs and sharing tags do not need JS.
const crawlerHeaders = { 'User-Agent': 'Bingbot' };

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

function decodeHtml(value) {
  return value.replace(/&(?:amp|quot|apos|lt|gt|#39);/g, entity => ({
    '&amp;': '&', '&quot;': '"', '&apos;': "'", '&#39;': "'", '&lt;': '<', '&gt;': '>',
  })[entity]);
}

function attributes(tag) {
  return Object.fromEntries(Array.from(tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g),
    ([, key, value]) => [key.toLowerCase(), decodeHtml(value)]));
}

function readSeo(html) {
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] || '';
  const meta = Array.from(head.matchAll(/<meta\b[^>]*>/gi), ([tag]) => attributes(tag));
  const links = Array.from(head.matchAll(/<link\b[^>]*>/gi), ([tag]) => attributes(tag));
  const data = Array.from(html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))
    .filter(([, attrs]) => attributes(attrs).type === 'application/ld+json')
    .flatMap(([, , json]) => {
      assert.doesNotMatch(json, /</, 'JSON-LD must escape HTML delimiters from submitted content');
      const parsed = JSON.parse(json);
      return Array.isArray(parsed) ? parsed : parsed['@graph'] || [parsed];
    });
  return {
    head,
    title: decodeHtml(head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ''),
    meta,
    description: meta.find(item => item.name === 'description')?.content,
    canonical: links.filter(item => item.rel === 'canonical'),
    data,
  };
}

function checkPublicSeo(html, pathname) {
  const seo = readSeo(html);
  assert.ok(seo.title.trim(), `${pathname}: server HTML should have a title`);
  assert.ok(seo.description?.trim(), `${pathname}: server HTML should have a description`);
  assert.equal(seo.canonical.length, 1, `${pathname}: exactly one canonical URL`);
  assert.equal(seo.canonical[0].href, `${siteUrl}${pathname}`, `${pathname}: self-canonical URL`);
  assert.doesNotMatch(seo.meta.filter(item => item.name === 'robots').map(item => item.content).join(','), /noindex/i,
    `${pathname}: public content should be indexable`);
  for (const field of ['og:title', 'og:description', 'og:url', 'og:image']) {
    assert.ok(seo.meta.some(item => item.property === field && item.content), `${pathname}: ${field}`);
  }
  assert.equal(seo.meta.find(item => item.property === 'og:url').content, `${siteUrl}${pathname}`);
  for (const field of ['og:image', 'twitter:image']) {
    const value = seo.meta.find(item => item.property === field || item.name === field)?.content;
    assert.ok(value && /^https?:\/\//.test(value), `${pathname}: absolute ${field}`);
  }
  assert.ok(seo.meta.some(item => item.name === 'twitter:card' && item.content), `${pathname}: Twitter sharing card`);
  assert.ok(/<h1\b/i.test(html), `${pathname}: heading must be present without JS`);
  assert.doesNotMatch(html, /<script\b[^>]*\bid=["']seo-injection["']/i,
    `${pathname}: submitted content must not close a structured-data script`);
  return seo;
}

function hasLink(html, href) {
  return Array.from(html.matchAll(/<a\b[^>]*>/gi), ([tag]) => attributes(tag).href).includes(href);
}

async function seed(db) {
  const now = new Date();
  const day = 24 * 60 * 60 * 1000;
  const offset = days => new Date(now.getTime() + days * day);
  for (let index = 1; index <= 14; index += 1) {
    await db.project.create({ data: {
      id: `seo-project-${index}`, slug: `seo-project-${index}`, status: 'published',
      name: index === 1 ? 'SEO 共创项目 & 工作坊' : `SEO 项目 ${index}`,
      summary: index === 1
        ? 'SEO 项目简介 </script><script id="seo-injection">window.injected = true</script>'
        : `公开项目 ${index} 的真实介绍。`,
      description: `## 公开介绍\n\n项目 ${index} 的技术方案和合作需求。`,
      reviewedAt: now, publishedAt: offset(-index), stage: 'build', featured: index === 1,
      internalContact: 'PRIVATE-SEO-CONTACT-SENTINEL',
    } });
  }
  for (const [id, status, reviewedAt] of [
    ['seo-draft-project', 'draft', now],
    ['seo-unreviewed-project', 'published', null],
    ['seo-unpublished-project', 'unpublished', now],
  ]) {
    await db.project.create({ data: {
      id, slug: id, status, reviewedAt,
      name: 'PRIVATE-SEO-PROJECT-SENTINEL', summary: '尚未公开的项目', description: '内部内容',
    } });
  }
  const activity = {
    title: 'SEO 重庆 AI 交流活动', summary: '讨论 AI 应用与项目协作的公开交流活动。',
    content: '## 活动安排\n\n现场讨论真实应用问题。', mode: 'offline', location: '重庆市渝中区交流空间',
    startsAt: offset(7), endsAt: offset(7.1), registrationOpensAt: offset(-1),
    registrationClosesAt: offset(6), capacity: 30, status: 'published',
    createdByIssuer: 'seo-test', createdBySub: 'seo-test', publishedAt: now,
  };
  await db.clubActivity.create({ data: { ...activity, id: 'seo-upcoming' } });
  await db.clubActivity.create({ data: { ...activity, id: 'seo-cancelled', title: 'SEO 已取消活动', summary: '这场原定的 AI 交流活动已取消。', status: 'cancelled', cancelledAt: now } });
  await db.clubActivity.create({ data: { ...activity, id: 'seo-past-recap', title: 'SEO 往期交流活动', startsAt: offset(-8), endsAt: offset(-7),
    recapTitle: 'SEO 活动图文回顾', recapSummary: '公开活动的讨论过程与实践经验。', recapContent: '## 现场回顾\n\n这里记录公开活动的讨论成果。', recapPublishedAt: offset(-6),
  } });
  await db.clubActivity.create({ data: { ...activity, id: 'seo-draft-activity', title: 'PRIVATE-SEO-ACTIVITY-SENTINEL', status: 'draft' } });
  await db.clubActivity.create({ data: { ...activity, id: 'seo-deleted-activity', title: 'PRIVATE-SEO-DELETED-SENTINEL', deletedAt: now } });
  await db.clubActivity.create({ data: { ...activity, id: 'seo-empty-recap', startsAt: offset(-8), endsAt: offset(-7),
    recapContent: ' \n\t ', recapPublishedAt: offset(-6),
  } });
  await db.clubActivity.create({ data: { ...activity, id: 'seo-future-recap', recapContent: '提前准备的内部草稿', recapPublishedAt: now } });
}

async function main() {
  assert.ok(fs.existsSync(path.join(projectRoot, '.next/BUILD_ID')), 'Run npm run build before test:seo');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cqai-seo-'));
  const databasePath = path.join(directory, 'seo.db');
  fs.writeFileSync(databasePath, '');
  const databaseUrl = `file:${databasePath}`;
  const migrate = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', path.join(projectRoot, 'prisma/schema.prisma')], {
    cwd: projectRoot, encoding: 'utf8', env: { ...process.env, DATABASE_URL: databaseUrl },
  });
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  let app;
  let output = '';
  try {
    assert.equal(migrate.status, 0, migrate.stderr || migrate.stdout);
    await seed(db);
    const port = await availablePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port)], {
      cwd: projectRoot,
      env: {
        ...process.env, DATABASE_URL: databaseUrl, SITE_URL: siteUrl, HOME_URL: siteUrl,
        NODE_ENV: 'production', LOGTO_ENDPOINT: '', LOGTO_APP_ID: '', LOGTO_APP_SECRET: '',
        LOGTO_COOKIE_SECRET: '', BASE_URL_PROD: `${baseUrl}/member`,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    app.stdout.on('data', chunk => { output += String(chunk); });
    app.stderr.on('data', chunk => { output += String(chunk); });
    async function get(pathname) {
      return fetch(`${baseUrl}${pathname}`, { headers: crawlerHeaders, redirect: 'manual' });
    }
    for (let attempt = 0; ; attempt += 1) {
      assert.equal(app.exitCode, null, `SEO app exited: ${output}`);
      try {
        if ((await get('/')).ok) break;
      } catch { /* Wait for the local process to start. */ }
      assert.ok(attempt < 80, `SEO app did not become ready: ${output}`);
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    const titles = new Set();
    const descriptions = new Set();
    const pages = ['/', '/events/', '/projects/', '/projects/?page=2', '/projects/seo-project-1/',
      '/activities/seo-upcoming/', '/activities/seo-cancelled/', '/events/recaps/seo-past-recap/', '/ebao-studio/'];
    const documents = new Map();
    for (const pathname of pages) {
      const response = await get(pathname);
      assert.equal(response.status, 200, `${pathname}: public page should return 200`);
      const html = await response.text();
      const seo = checkPublicSeo(html, pathname);
      assert.ok(!titles.has(seo.title), `${pathname}: title must distinguish each public page`);
      titles.add(seo.title);
      assert.ok(!descriptions.has(seo.description), `${pathname}: description must distinguish each public page`);
      descriptions.add(seo.description);
      assert.doesNotMatch(html, /PRIVATE-SEO-(?:CONTACT|PROJECT|ACTIVITY|DELETED)-SENTINEL/,
        `${pathname}: private records and internal contacts must not enter public HTML`);
      documents.set(pathname, { html, seo });
    }
    assert.ok(hasLink(documents.get('/').html, '/projects/seo-project-1/'), 'homepage must expose published project links without JS');
    assert.ok(hasLink(documents.get('/').html, '/activities/seo-upcoming/'), 'homepage must expose upcoming activity links without JS');
    assert.ok(hasLink(documents.get('/projects/').html, '/projects/?page=2'), 'project pagination should use crawlable links');
    assert.ok(hasLink(documents.get('/projects/?page=2').html, '/projects/seo-project-14/'), 'later project pages should contain server-rendered details links');
    assert.ok(hasLink(documents.get('/events/').html, '/events/recaps/seo-past-recap/'), 'event list should link to published recaps');
    assert.ok(documents.get('/').seo.data.some(item => item['@type'] === 'Organization'), 'homepage organization schema');
    for (const [pathname, type] of [
      ['/projects/seo-project-1/', 'CreativeWork'], ['/activities/seo-upcoming/', 'Event'],
      ['/events/recaps/seo-past-recap/', 'Article'],
    ]) {
      const { seo } = documents.get(pathname);
      assert.ok(seo.data.some(item => item['@type'] === type), `${pathname}: ${type} schema`);
      assert.ok(seo.data.some(item => item['@type'] === 'BreadcrumbList'), `${pathname}: breadcrumb schema`);
    }
    const cancelled = documents.get('/activities/seo-cancelled/').seo.data.find(item => item['@type'] === 'Event');
    assert.equal(cancelled?.eventStatus, 'https://schema.org/EventCancelled', 'cancelled events must not be advertised as scheduled');

    const alias = await get('/index.html');
    assert.equal(alias.status, 308, 'legacy home URL must permanently redirect');
    assert.equal(new URL(alias.headers.get('location'), baseUrl).pathname, '/', 'legacy homepage redirects to the canonical root');
    const oldActivities = await get('/activities/');
    assert.equal(oldActivities.status, 308, 'old activity list must permanently redirect');
    assert.equal(new URL(oldActivities.headers.get('location'), baseUrl).pathname, '/events/');
    for (const pathname of ['/projects/seo-draft-project/', '/projects/seo-unreviewed-project/',
      '/activities/seo-draft-activity/', '/activities/seo-deleted-activity/',
      '/events/recaps/seo-empty-recap/', '/events/recaps/seo-future-recap/']) {
      const response = await get(pathname);
      assert.equal(response.status, 404, `${pathname}: nonpublic content should not return a soft 404`);
      const html = await response.text();
      assert.doesNotMatch(html, /PRIVATE-SEO-/, `${pathname}: private record content must not be rendered`);
    }

    const robotResponse = await get('/robots.txt');
    assert.equal(robotResponse.status, 200);
    const robots = await robotResponse.text();
    assert.match(robots, /User-Agent:\s*\*/i, 'robots should address general crawlers');
    assert.match(robots, /Allow:\s*\//i, 'public pages should be crawlable');
    assert.ok(robots.includes(`Sitemap: ${siteUrl}/sitemap.xml`), 'robots should advertise the configured sitemap');
    const disallowed = Array.from(robots.matchAll(/^Disallow:\s*(\S+)\s*$/gmi), ([, value]) => value);
    for (const pathname of ['/member/sign-in/', '/member/dashboard/', '/preview/activity-manager/']) {
      assert.ok(!disallowed.some(prefix => pathname.startsWith(prefix)),
        `${pathname}: crawlers must be able to read noindex directives`);
      const response = await get(pathname);
      const html = await response.text();
      const directives = [response.headers.get('x-robots-tag') || '',
        ...readSeo(html).meta.filter(item => item.name === 'robots').map(item => item.content)].join(',');
      assert.match(directives, /noindex/i, `${pathname}: private or preview surface must carry noindex`);
    }

    const sitemapResponse = await get('/sitemap.xml');
    assert.equal(sitemapResponse.status, 200);
    const sitemap = await sitemapResponse.text();
    const urls = Array.from(sitemap.matchAll(/<loc>([^<]+)<\/loc>/g), ([, value]) => decodeHtml(value));
    assert.equal(new Set(urls).size, urls.length, 'sitemap must not contain duplicate URLs');
    for (const pathname of ['/', '/events/', '/projects/', '/ebao-studio/',
      ...Array.from({ length: 14 }, (_, index) => `/projects/seo-project-${index + 1}/`),
      '/activities/seo-upcoming/', '/activities/seo-cancelled/', '/activities/seo-past-recap/',
      '/events/recaps/seo-past-recap/']) {
      assert.ok(urls.includes(`${siteUrl}${pathname}`), `${pathname}: all indexable content should be discoverable through the sitemap`);
    }
    assert.ok(urls.every(value => value.startsWith(`${siteUrl}/`)), 'sitemap URLs must use the runtime canonical origin');
    assert.ok(!urls.some(value => /(?:member|preview|api|seo-draft|seo-unreviewed|seo-unpublished|seo-deleted)/.test(new URL(value).pathname)),
      'sitemap must exclude private routes, drafts, unreviewed projects and deleted activities');
    assert.ok(!urls.includes(`${siteUrl}/events/recaps/seo-empty-recap/`), 'blank recaps must not enter sitemap');
    assert.ok(!urls.includes(`${siteUrl}/events/recaps/seo-future-recap/`), 'recaps of future events must not enter sitemap');

    await db.project.update({ where: { id: 'seo-project-14' }, data: { status: 'unpublished' } });
    const refreshed = await (await get('/sitemap.xml')).text();
    assert.ok(!refreshed.includes(`${siteUrl}/projects/seo-project-14/`), 'sitemap must follow publication changes without a rebuild');
    console.log('SEO smoke test passed: server metadata, crawlable links, structured data, canonical URLs, noindex and public sitemap.');
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.stack : String(error)}\nPortal output:\n${output.slice(-5000)}`);
  } finally {
    if (app && app.exitCode === null) {
      app.kill('SIGTERM');
      await once(app, 'exit');
    }
    await db.$disconnect();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
