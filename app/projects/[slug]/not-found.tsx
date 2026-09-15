import Link from "next/link";

import styles from "../projects.module.css";

export default function ProjectNotFound() {
  return (
    <main id="projects-main" className={styles.content}>
      <section className={styles.emptyState}>
        <div className={styles.emptyStateInner}>
          <h1>项目暂不可见</h1>
          <p>这个项目可能尚未发布、已经下架，或链接有误。</p>
          <div className={styles.emptyActions}>
            <Link className={styles.primaryAction} href="/projects/">
              返回项目广场
            </Link>
            <Link className={styles.secondaryAction} href="/collect/?type=project">
              提交项目
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
