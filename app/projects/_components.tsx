/* eslint-disable @next/next/no-img-element -- cover URLs are controlled dynamic API resources */

import Link from "next/link";

import type { PublicContact, PublicProjectView } from "./_types";
import styles from "./projects.module.css";

const STAGE_LABELS: Record<string, string> = {
  idea: "构想验证",
  build: "开发中",
  pilot: "试点运行",
  live: "已上线",
};

export const projectStageLabel = (stage: string): string =>
  STAGE_LABELS[stage] ?? stage;

export function SiteHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link className={styles.brand} href="/" aria-label="返回重庆 AI 创享俱乐部首页">
          <img src="/images/logo-nav.png" alt="" width="38" height="38" />
          <span className={styles.brandCopy}>
            <strong>重庆AI创享俱乐部</strong>
            <small>CHONGQING AI INNOVATION CLUB</small>
          </span>
        </Link>
        <nav className={styles.nav} aria-label="项目广场导航">
          <Link className={styles.navLink} href="/">
            俱乐部首页
          </Link>
          <Link className={styles.navLink} href="/projects/" aria-current="page">
            项目广场
          </Link>
          <Link className={`${styles.navLink} ${styles.memberNavLink}`} href="/member">
            会员中心
          </Link>
          <Link className={styles.navCta} href="/collect/?type=project">
            提交项目
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div>
          <strong>重庆 AI 创享俱乐部</strong>
          <p>连接创新力量，共建 AI 生态。</p>
        </div>
        <nav className={styles.footerLinks} aria-label="页脚导航">
          <Link href="/">俱乐部首页</Link>
          <Link href="/projects/">项目广场</Link>
          <Link href="/collect/?type=project">提交项目</Link>
        </nav>
      </div>
    </footer>
  );
}

export function ProjectCard({ project }: { project: PublicProjectView }) {
  const stage = projectStageLabel(project.stage);

  return (
    <Link
      className={styles.projectCard}
      href={`/projects/${encodeURIComponent(project.slug)}/`}
    >
      <div className={styles.cover}>
        {project.coverUrl ? (
          <img
            src={project.coverUrl}
            alt={`${project.name}项目封面`}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className={styles.coverFallback}>{project.name}</div>
        )}
      </div>
      <div className={styles.cardBody}>
        {(stage || project.focus) && (
          <div className={styles.tags} aria-label="项目标签">
            {stage && <span className={styles.tag}>{stage}</span>}
            {project.focus && <span className={styles.tag}>{project.focus}</span>}
          </div>
        )}
        <h2>{project.name}</h2>
        {project.ownerName && <p className={styles.owner}>负责人：{project.ownerName}</p>}
        <p className={styles.summary}>{project.summary}</p>
        <span className={styles.cardCta} aria-hidden="true">
          查看项目详情 →
        </span>
      </div>
    </Link>
  );
}

export function EmptyState({
  title,
  description,
  retryHref,
}: {
  title: string;
  description: string;
  retryHref?: string;
}) {
  return (
    <section className={styles.emptyState} aria-live="polite">
      <div className={styles.emptyStateInner}>
        <h2>{title}</h2>
        <p>{description}</p>
        <div className={styles.emptyActions}>
          {retryHref && (
            <Link className={styles.secondaryAction} href={retryHref}>
              重新加载
            </Link>
          )}
          <Link className={styles.primaryAction} href="/collect/?type=project">
            提交项目
          </Link>
        </div>
      </div>
    </section>
  );
}

export function PublicContactAction({ contact }: { contact: PublicContact }) {
  if (contact.type === "none") return null;

  if (contact.type === "email" && contact.value) {
    return (
      <a className={styles.primaryAction} href={`mailto:${contact.value}`}>
        邮件联系项目方
      </a>
    );
  }

  if (contact.type === "url" && contact.value) {
    return (
      <a
        className={styles.primaryAction}
        href={contact.value}
        target="_blank"
        rel="noopener noreferrer"
      >
        联系项目方 ↗
      </a>
    );
  }

  return (
    <Link className={styles.primaryAction} href="/#join">
      联系俱乐部
    </Link>
  );
}
