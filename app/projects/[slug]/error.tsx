"use client";

import { useEffect } from "react";
import Link from "next/link";

import styles from "../projects.module.css";

export default function ProjectDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Project detail failed to render", error);
  }, [error]);

  return (
    <main id="projects-main" className={styles.content}>
      <section className={styles.emptyState} role="alert">
        <div className={styles.emptyStateInner}>
          <h1>项目详情暂时无法加载</h1>
          <p>服务可能正在短暂维护，请稍后重试。</p>
          <div className={styles.emptyActions}>
            <button className={styles.primaryAction} type="button" onClick={reset}>
              重新加载
            </button>
            <Link className={styles.secondaryAction} href="/projects/">
              返回项目广场
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
