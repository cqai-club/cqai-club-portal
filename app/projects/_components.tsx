/* eslint-disable @next/next/no-img-element -- cover URLs are controlled dynamic API resources */

import Link from "next/link";
import { Menu, X } from "lucide-react";

import type { PublicContact, PublicProjectView } from "./_types";
import styles from "./projects.module.css";

const STAGE_LABELS: Record<string, string> = {
  build: "开发中",
  pilot: "试运行",
  live: "正式上线",
};

export const projectStageLabel = (stage: string): string =>
  STAGE_LABELS[stage] ?? stage;

export function SiteHeader({ current }: { current: "events" | "projects" }) {
  const cta = current === "events"
    ? { href: "/member/dashboard/activities", label: "我的报名" }
    : { href: "/member/dashboard/project-submission", label: "提交项目" };
  const links = [
    { href: "/", label: "俱乐部首页" },
    { href: "/events/", label: "活动交流", current: current === "events" },
    { href: "/projects/", label: "项目广场", current: current === "projects" },
    { href: "/member", label: "会员中心" },
  ];

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
        <nav className={styles.nav} aria-label="俱乐部门户导航">
          {links.map(link => <Link key={link.href} className={`${styles.navLink} ${link.href === "/member" ? styles.memberNavLink : ""}`} href={link.href} aria-current={link.current ? "page" : undefined}>{link.label}</Link>)}
          <Link className={styles.navCta} href={cta.href}>{cta.label}</Link>
        </nav>
        <details className={styles.mobileMenu}>
          <summary className={styles.mobileMenuToggle}>
            <Menu className={styles.menuIcon} aria-hidden="true" size={20} />
            <X className={styles.closeIcon} aria-hidden="true" size={20} />
          </summary>
          <nav className={styles.mobileNav} aria-label="移动端俱乐部门户导航">
            {links.map(link => <Link key={link.href} className={styles.mobileNavLink} href={link.href} aria-label={link.label} aria-current={link.current ? "page" : undefined}>{link.label}</Link>)}
            <Link className={styles.mobileNavCta} href={cta.href} aria-label={cta.label}>{cta.label}</Link>
          </nav>
        </details>
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
          <Link href="/events/">活动交流</Link>
          <Link href="/projects/">项目广场</Link>
          <Link href="/member/dashboard/project-submission">提交项目</Link>
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
        <span className={styles.cardCta}>
          {project.publicContact.type === "club" ? "了解项目并联系俱乐部 →" : "查看项目详情 →"}
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
          <Link className={styles.primaryAction} href="/member/dashboard/project-submission">
            提交项目
          </Link>
        </div>
      </div>
    </section>
  );
}

export function PublicContactAction({ contact, projectName }: { contact: PublicContact; projectName: string }) {
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
    <a className={styles.primaryAction} href={`mailto:781728683@qq.com?subject=${encodeURIComponent(`咨询项目：${projectName}`)}`}>
      联系俱乐部
    </a>
  );
}
