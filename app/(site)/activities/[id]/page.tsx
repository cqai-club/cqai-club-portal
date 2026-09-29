/* eslint-disable @next/next/no-img-element -- activity covers use the validated same-origin image API */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActivitySignup } from "@/components/activities/ActivitySignup";
import { ActivityError, getPublicActivity } from "@/lib/club-activities";
import styles from "../activities.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "活动详情 | 重庆 AI 创享俱乐部",
  description: "查看重庆 AI 创享俱乐部的活动时间、地点、介绍与报名信息。",
};

const dateText = (iso: string) => new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", dateStyle: "full", timeStyle: "short",
}).format(new Date(iso));

export default async function ActivityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let activity;
  try {
    activity = await getPublicActivity(id);
  } catch (error) {
    if (error instanceof ActivityError && error.status === 404) notFound();
    throw error;
  }
  return (
    <main id="activities-main" className={styles.main}>
      <div className={`${styles.container} ${styles.detailMain}`}>
        <nav className={styles.breadcrumb} aria-label="面包屑导航">
          <Link href="/">俱乐部首页</Link>
          <span aria-hidden="true">/</span>
          <Link href="/events/">活动交流</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{activity.title}</span>
        </nav>

        {activity.status === "cancelled" && (
          <p className={`${styles.notice} ${styles.noticeWarning}`} role="status">
            此活动已取消，无法继续报名。
          </p>
        )}
        {activity.detailsChangedAt && (
          <p className={styles.notice} role="status">
            活动信息曾更新，请重新核对时间和地点。
          </p>
        )}

        <header className={styles.detailHero}>
          <span className={styles.eyebrow}>CQAI CLUB EVENT</span>
          <h1>{activity.title}</h1>
          <p>{activity.summary}</p>
        </header>

        {activity.coverUrl && (
          <img className={styles.detailCover} src={activity.coverUrl} alt="" width="1600" height="1000" />
        )}

        <div className={styles.detailGrid}>
          <section className={styles.facts} aria-labelledby="activity-facts-title">
            <h2 id="activity-facts-title">活动信息</h2>
            <dl className={styles.factGrid}>
              <div>
                <dt>活动时间</dt>
                <dd>{dateText(activity.startsAt)} 至 {dateText(activity.endsAt)}</dd>
              </div>
              <div>
                <dt>活动地点</dt>
                <dd>{activity.mode === "online" ? "线上" : "线下"} · {activity.location}</dd>
              </div>
              <div>
                <dt>报名截止</dt>
                <dd>{dateText(activity.registrationClosesAt)}</dd>
              </div>
              <div>
                <dt>报名人数</dt>
                <dd>{activity.registeredCount} / {activity.capacity} 人</dd>
              </div>
            </dl>
          </section>

          <aside className={styles.signupSlot}>
            <ActivitySignup activity={activity} />
          </aside>

          <section className={styles.intro} aria-labelledby="activity-intro-title">
            <h2 id="activity-intro-title">活动介绍</h2>
            <p>{activity.content || activity.summary}</p>
          </section>
        </div>
      </div>
    </main>
  );
}
