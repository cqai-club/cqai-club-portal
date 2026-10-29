import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { absoluteUrl, breadcrumbJsonLd, createPageMetadata, serializeJsonLd } from "@/lib/seo";

import { EmptyState, ProjectCard } from "./_components";
import { getPublishedProjects } from "./_data";
import styles from "./projects.module.css";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 12;

type ProjectsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function positivePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(raw ?? "1", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

export async function generateMetadata({ searchParams }: ProjectsPageProps): Promise<Metadata> {
  const page = positivePage((await searchParams).page);
  let noIndex = false;
  try {
    await getPublishedProjects(page, PAGE_SIZE);
  } catch {
    noIndex = true;
  }
  return createPageMetadata({
    title: `${page > 1 ? `项目广场第 ${page} 页` : "AI 项目广场与项目合作"} | 重庆AI创享俱乐部`,
    description: `${page > 1 ? `项目广场第 ${page} 页。` : ""}发现重庆 AI 创享俱乐部公开发布的 AI 创研项目，了解项目介绍、应用方向与合作需求，连接技术、产业场景与共创伙伴。`,
    path: page > 1 ? `/projects/?page=${page}` : "/projects/",
    noIndex,
  });
}

export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
  const query = await searchParams;
  const requestedPage = positivePage(query.page);

  let result;
  try {
    result = await getPublishedProjects(requestedPage, PAGE_SIZE);
  } catch (error) {
    console.error("[projects] Failed to render public project list", error);
    return (
      <main id="projects-main">
        <section className={styles.hero}>
          <div className={styles.heroInner}>
            <span className={styles.eyebrow}>PROJECT SQUARE</span>
            <h1>项目广场</h1>
            <p>让真实需求遇见技术、场景与伙伴，一起把 AI 项目带到真实世界。</p>
          </div>
        </section>
        <div className={styles.content}>
          <EmptyState
            title="项目暂时无法加载"
            description="服务可能正在短暂维护，请稍后重试；项目征集仍可正常填写。"
            retryHref="/projects/"
          />
        </div>
      </main>
    );
  }

  if (requestedPage > Math.max(result.totalPages, 1)) {
    redirect(result.totalPages > 1 ? `/projects/?page=${result.totalPages}` : "/projects/");
  }

  return (
    <main id="projects-main">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd([
        breadcrumbJsonLd([{ name: "俱乐部首页", path: "/" }, { name: "项目广场", path: "/projects/" }]),
        {
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "AI 项目广场",
          url: absoluteUrl(result.page > 1 ? `/projects/?page=${result.page}` : "/projects/"),
          mainEntity: {
            "@type": "ItemList",
            itemListElement: result.data.map((project, index) => ({
              "@type": "ListItem",
              position: (result.page - 1) * PAGE_SIZE + index + 1,
              name: project.name,
              url: absoluteUrl(`/projects/${encodeURIComponent(project.slug)}/`),
            })),
          },
        },
      ]) }} />
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <span className={styles.eyebrow}>PROJECT SQUARE</span>
          <h1>项目广场</h1>
          <p>让真实需求遇见技术、场景与伙伴，一起把 AI 项目带到真实世界。</p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryAction} href="/member/dashboard/project-submission">
              提交我的项目
            </Link>
            <Link className={styles.secondaryAction} href="/#projects">
              返回官网项目区
            </Link>
          </div>
        </div>
      </section>

      <section className={styles.content} aria-labelledby="project-list-title">
        <div className={styles.sectionHead}>
          <div>
            <span className={styles.eyebrow}>EXPLORE PROJECTS</span>
            <h2 id="project-list-title">发现创研项目</h2>
            <p>这里仅展示已经由俱乐部审核并正式发布的项目。</p>
          </div>
          <span className={styles.resultCount}>共 {result.total} 个项目</span>
        </div>

        {result.data.length ? (
          <>
            <div className={styles.projectGrid}>
              {result.data.map((project) => (
                <ProjectCard key={project.slug} project={project} />
              ))}
            </div>
            {result.totalPages > 1 && (
              <nav className={styles.pagination} aria-label="项目分页">
                {result.page > 1 && (
                  <Link className={styles.paginationLink} href={result.page === 2 ? "/projects/" : `/projects/?page=${result.page - 1}`}>
                    ← 上一页
                  </Link>
                )}
                <span className={styles.paginationCurrent} aria-current="page">
                  第 {result.page} / {result.totalPages} 页
                </span>
                {result.page < result.totalPages && (
                  <Link className={styles.paginationLink} href={`/projects/?page=${result.page + 1}`}>
                    下一页 →
                  </Link>
                )}
              </nav>
            )}
          </>
        ) : (
          <EmptyState
            title="项目正在集结中"
            description="首批项目正在整理发布。你也可以提交自己的 AI 项目，寻找资源、伙伴和第一批用户。"
          />
        )}
      </section>
    </main>
  );
}
