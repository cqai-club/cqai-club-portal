import type { ReactNode } from "react";

import { SiteFooter, SiteHeader } from "@/app/projects/_components";
import styles from "@/app/projects/projects.module.css";

export default function ActivitiesLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.siteShell}>
      <a className={styles.skipLink} href="#activities-main">跳到主要内容</a>
      <SiteHeader current="events" />
      {children}
      <SiteFooter />
    </div>
  );
}
