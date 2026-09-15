import type { ReactNode } from "react";

import { SiteFooter, SiteHeader } from "./_components";
import styles from "./projects.module.css";

export default function ProjectsLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.siteShell}>
      <a className={styles.skipLink} href="#projects-main">
        跳到主要内容
      </a>
      <SiteHeader />
      {children}
      <SiteFooter />
    </div>
  );
}
