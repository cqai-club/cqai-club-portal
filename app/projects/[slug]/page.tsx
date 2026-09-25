/* eslint-disable @next/next/no-img-element -- cover URLs are controlled dynamic API resources */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { projectStageLabel, PublicContactAction } from "../_components";
import { getPublishedProject } from "../_data";
import styles from "../projects.module.css";

export const dynamic = "force-dynamic";

type ProjectDetailPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: ProjectDetailPageProps): Promise<Metadata> {
  const { slug } = await params;

  try {
    const project = await getPublishedProject(slug);
    if (!project) {
      return {
        title: "项目未找到 | 重庆 AI 创享俱乐部",
        robots: { index: false, follow: false },
      };
    }

    return {
      title: `${project.name} | 项目广场`,
      description: project.summary,
      robots: { index: true, follow: true },
      openGraph: {
        title: project.name,
        description: project.summary,
        type: "article",
        publishedTime: project.publishedAt ?? undefined,
        modifiedTime: project.updatedAt,
      },
    };
  } catch {
    return {
      title: "项目广场 | 重庆 AI 创享俱乐部",
      description: "查看重庆 AI 创享俱乐部公开发布的创研项目。",
    };
  }
}

export default async function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const { slug } = await params;
  const project = await getPublishedProject(slug);
  if (!project) notFound();

  const stage = projectStageLabel(project.stage);

  return (
    <main id="projects-main" className={styles.detailMain}>
      <nav className={styles.breadcrumb} aria-label="面包屑导航">
        <Link href="/">俱乐部首页</Link>
        <span aria-hidden="true">/</span>
        <Link href="/projects/">项目广场</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{project.name}</span>
      </nav>

      <article>
        <header className={styles.detailHeader}>
          <div className={styles.detailCover}>
            {project.coverUrl ? (
              <img src={project.coverUrl} alt={`${project.name}项目封面`} />
            ) : (
              <div className={styles.coverFallback}>{project.name}</div>
            )}
          </div>
          <div className={styles.detailIntro}>
            {(stage || project.focus) && (
              <div className={styles.tags} aria-label="项目标签">
                {stage && <span className={styles.tag}>{stage}</span>}
                {project.focus && <span className={styles.tag}>{project.focus}</span>}
              </div>
            )}
            <h1>{project.name}</h1>
            <p className={styles.detailSummary}>{project.summary}</p>
            {project.ownerName && (
              <p className={styles.detailOwner}>项目负责人：{project.ownerName}</p>
            )}
            <div className={styles.detailActions}>
              {project.demoUrl && (
                <a
                  className={styles.secondaryAction}
                  href={project.demoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  立即体验 ↗
                </a>
              )}
              <PublicContactAction contact={project.publicContact} projectName={project.name} />
            </div>
          </div>
        </header>

        <div className={styles.detailBody}>
          <div>
            <section className={styles.proseSection} aria-labelledby="project-description-title">
              <h2 id="project-description-title">项目介绍</h2>
              <p>{project.description}</p>
            </section>
            {project.collaborationNeeds && (
              <section className={styles.proseSection} aria-labelledby="project-needs-title">
                <h2 id="project-needs-title">期待合作</h2>
                <p>{project.collaborationNeeds}</p>
              </section>
            )}
          </div>

          <aside className={styles.detailAside} aria-labelledby="project-facts-title">
            <h2 id="project-facts-title">项目信息</h2>
            <dl className={styles.factList}>
              {stage && (
                <div>
                  <dt>项目阶段</dt>
                  <dd>{stage}</dd>
                </div>
              )}
              {project.focus && (
                <div>
                  <dt>AI 方向</dt>
                  <dd>{project.focus}</dd>
                </div>
              )}
              {project.ownerName && (
                <div>
                  <dt>项目负责人</dt>
                  <dd>{project.ownerName}</dd>
                </div>
              )}
            </dl>
          </aside>
        </div>
      </article>
    </main>
  );
}
