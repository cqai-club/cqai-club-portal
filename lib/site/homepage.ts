import { listPublicActivities, type ActivityView } from "@/lib/club-activities";
import { listPublicProjects, type PublicProject } from "@/lib/project-market";
import { listPublicPartnerGroups } from "@/lib/partners";
import { absoluteUrl, DEFAULT_SOCIAL_IMAGE, HOME_TITLE, serializeJsonLd, SITE_DESCRIPTION, SITE_NAME } from "@/lib/seo";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

function localizedAttributes(nameZh: string, nameEn: string): string {
  return `data-home-zh="${escapeHtml(nameZh)}" data-home-en="${escapeHtml(nameEn)}"`;
}

function partnerGroups(groups: Awaited<ReturnType<typeof listPublicPartnerGroups>>): string {
  if (!groups.length) {
    return '<p class="desc" data-home-zh="合作伙伴信息正在整理。" data-home-en="Partner information is being updated.">合作伙伴信息正在整理。</p>';
  }
  return `<div class="partner-groups">${groups.map(group => {
    const names = (duplicate = false) => group.partners.map(partner => {
      const attributes = localizedAttributes(partner.nameZh, partner.nameEn);
      const name = escapeHtml(partner.nameZh);
      const element = partner.url
        ? `<a href="${escapeHtml(partner.url)}" target="_blank" rel="noopener noreferrer"${duplicate ? ' tabindex="-1"' : ""} ${attributes}>${name}</a>`
        : `<span ${attributes}>${name}</span>`;
      return `<span class="sep">·</span>${element}`;
    }).join("");
    return `<div class="partner-group reveal"><h4 ${localizedAttributes(group.nameZh, group.nameEn)}>${escapeHtml(group.nameZh)}</h4>
      <div class="v-marquee"><div class="v-track"><div class="v-group">${names()}</div><div class="v-group" aria-hidden="true">${names(true)}</div></div></div></div>`;
  }).join("")}</div>`;
}

function projectCard(project: PublicProject): string {
  const name = escapeHtml(project.name);
  const stage = ({ build: "开发中", pilot: "试运行", live: "正式上线" } as Record<string, string>)[project.stage];
  const image = project.coverUrl
    ? `<img src="${escapeHtml(project.coverUrl)}" alt="${name}项目封面" loading="lazy" decoding="async">`
    : `<div class="project-img-fallback">${name}</div>`;
  return `<a class="project-card" href="/projects/${encodeURIComponent(project.slug)}/">
    <div class="project-img">${image}</div><div class="project-info"><h4>${name}</h4>
    <div class="project-meta">${[stage, project.focus].filter(Boolean).map(tag => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
    <p>${escapeHtml(project.summary)}</p><span class="project-card-cta">查看项目详情 →</span></div></a>`;
}

function activityCard(activity: ActivityView): string {
  const title = escapeHtml(activity.title);
  const date = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "medium", timeStyle: "short" }).format(new Date(activity.startsAt));
  const image = activity.coverUrl
    ? `<div class="club-event-cover"><img src="${escapeHtml(activity.coverUrl)}" alt="${title}活动封面" width="1600" height="1000" loading="lazy" decoding="async"></div>` : "";
  return `<a class="club-event-card" href="/activities/${encodeURIComponent(activity.id)}/">${image}
    <div class="club-event-body"><time class="date" datetime="${activity.startsAt}">${date}</time>
    <h4>${title}</h4><p>${escapeHtml(activity.summary)}</p></div></a>`;
}

function homepageHead(): string {
  const title = escapeHtml(HOME_TITLE);
  const description = escapeHtml(SITE_DESCRIPTION);
  const url = escapeHtml(absoluteUrl("/"));
  const image = escapeHtml(absoluteUrl(DEFAULT_SOCIAL_IMAGE));
  const verification = [
    ["google-site-verification", process.env.GOOGLE_SITE_VERIFICATION],
    ["msvalidate.01", process.env.BING_SITE_VERIFICATION],
    ["baidu-site-verification", process.env.BAIDU_SITE_VERIFICATION],
  ].filter(([, value]) => value?.trim()).map(([name, value]) => `<meta name="${name}" content="${escapeHtml(value!.trim())}">`).join("\n");
  return `<title>${title}</title>
    <meta name="description" content="${description}">
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
    <link rel="canonical" href="${url}">
    <meta property="og:type" content="website">
    <meta property="og:locale" content="zh_CN">
    <meta property="og:site_name" content="${SITE_NAME}">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:url" content="${url}">
    <meta property="og:image" content="${image}">
    <meta property="og:image:alt" content="${SITE_NAME}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${title}">
    <meta name="twitter:description" content="${description}">
    <meta name="twitter:image" content="${image}">
    ${verification}
    <script type="application/ld+json">${serializeJsonLd({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "Organization", "@id": absoluteUrl("/#organization"), name: SITE_NAME, alternateName: "Chongqing AI Innovation Club", url: absoluteUrl("/"), logo: absoluteUrl("/images/logo-nav.png") },
        { "@type": "WebSite", "@id": absoluteUrl("/#website"), name: SITE_NAME, url: absoluteUrl("/"), inLanguage: "zh-CN", publisher: { "@id": absoluteUrl("/#organization") } },
        { "@type": "WebPage", name: HOME_TITLE, description: SITE_DESCRIPTION, url: absoluteUrl("/"), isPartOf: { "@id": absoluteUrl("/#website") }, about: { "@id": absoluteUrl("/#organization") }, inLanguage: "zh-CN" },
      ],
    })}</script>`;
}

/** Render the same published records to every visitor, including non-JS crawlers. */
export async function renderHomepage(template: string): Promise<string> {
  const [projects, activities, partners] = await Promise.allSettled([
    listPublicProjects({ featured: true, limit: 6 }), listPublicActivities(30, false),
    listPublicPartnerGroups(),
  ]);
  const data: { projects?: PublicProject[]; activities?: ActivityView[] } = {};
  let html = template.replace(/<!-- seo:head:start -->[\s\S]*?<!-- seo:head:end -->/, () => homepageHead());
  if (projects.status === "fulfilled") {
    data.projects = projects.value.data;
    const content = data.projects.map(projectCard).join("") || '<p class="project-state">推荐项目正在整理，<a href="/projects/">浏览项目广场</a>。</p>';
    html = html.replace(/<!-- home:projects:start -->[\s\S]*?<!-- home:projects:end -->/, () => content)
      .replace('id="featuredProjectGrid" aria-live="polite" aria-busy="true"', 'id="featuredProjectGrid" aria-live="polite" aria-busy="false"');
  } else {
    console.error("[seo] Homepage projects unavailable");
  }
  if (activities.status === "fulfilled") {
    data.activities = activities.value.items.filter(item => Date.parse(item.startsAt) >= Date.now()).slice(0, 3);
    const content = data.activities.map(activityCard).join("") || '<p class="club-events-empty">暂无即将开始的活动，<a href="/events/">查看活动交流与历史回顾</a>。</p>';
    html = html.replace(/<!-- home:activities:start -->[\s\S]*?<!-- home:activities:end -->/, () => content);
  } else {
    console.error("[seo] Homepage activities unavailable");
  }
  const partnerContent = partners.status === "fulfilled"
    ? partnerGroups(partners.value)
    : '<p class="desc" data-home-zh="合作伙伴信息暂时不可用，请稍后刷新。" data-home-en="Partner information is temporarily unavailable. Please refresh later.">合作伙伴信息暂时不可用，请稍后刷新。</p>';
  if (partners.status === "rejected") console.error("[homepage] Partners unavailable");
  html = html.replace(/<!-- home:partners:start -->[\s\S]*?<!-- home:partners:end -->/, () => partnerContent);
  const seed = {
    projects: data.projects?.map(({ slug, name, summary, stage, focus, coverUrl, publicContact }) => ({ slug, name, summary, stage, focus, coverUrl, publicContact })),
    activities: data.activities?.map(({ id, title, summary, coverUrl, startsAt }) => ({ id, title, summary, coverUrl, startsAt })),
  };
  return html.replace("<!-- home:public-data -->", () => `<script id="home-public-data" type="application/json">${serializeJsonLd(seed)}</script>`);
}
