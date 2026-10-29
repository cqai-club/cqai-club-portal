/* eslint-disable @next/next/no-img-element -- activity covers use the validated same-origin image API */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { ActivitySignup } from "@/components/activities/ActivitySignup";
import { MarkdownContent } from "@/components/markdown/MarkdownContent";
import { ActivityError, getPublicActivity } from "@/lib/club-activities";
import { absoluteUrl, breadcrumbJsonLd, createPageMetadata, serializeJsonLd, SITE_NAME } from "@/lib/seo";
import styles from "../activities.module.css";

export const dynamic = "force-dynamic";

const getActivity = cache(async (id: string) => {
  try {
    return await getPublicActivity(id);
  } catch (error) {
    if (error instanceof ActivityError && error.status === 404) notFound();
    throw error;
  }
});

type ActivityDetailProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: ActivityDetailProps): Promise<Metadata> {
  const activity = await getActivity((await params).id);
  return createPageMetadata({
    title: `${activity.title} | 活动交流 | 重庆AI创享俱乐部`,
    description: activity.summary,
    path: `/activities/${encodeURIComponent(activity.id)}/`,
    image: activity.coverUrl ?? undefined,
    type: "article",
    publishedTime: activity.publishedAt ?? undefined,
    modifiedTime: activity.updatedAt,
  });
}

const dateText = (iso: string) => new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", dateStyle: "full", timeStyle: "short",
}).format(new Date(iso));

export default async function ActivityDetailPage({ params }: ActivityDetailProps) {
  const { id } = await params;
  const activity = await getActivity(id);
  const activityPath = `/activities/${encodeURIComponent(activity.id)}/`;
  const onlineUrl = /^https?:\/\//i.test(activity.location) ? activity.location : undefined;
  return (
    <main id="activities-main" className={styles.main}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd([
        breadcrumbJsonLd([
          { name: "俱乐部首页", path: "/" },
          { name: "活动交流", path: "/events/" },
          { name: activity.title, path: activityPath },
        ]),
        {
          "@context": "https://schema.org",
          "@type": "Event",
          name: activity.title,
          description: activity.summary,
          url: absoluteUrl(activityPath),
          startDate: activity.startsAt,
          endDate: activity.endsAt,
          eventStatus: activity.status === "cancelled" ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
          eventAttendanceMode: activity.mode === "online" ? "https://schema.org/OnlineEventAttendanceMode" : "https://schema.org/OfflineEventAttendanceMode",
          location: activity.mode === "online"
            ? { "@type": "VirtualLocation", name: activity.location, ...(onlineUrl ? { url: onlineUrl } : {}) }
            : { "@type": "Place", name: activity.location, address: activity.location },
          organizer: { "@type": "Organization", name: SITE_NAME, url: absoluteUrl("/") },
          ...(activity.coverUrl ? { image: absoluteUrl(activity.coverUrl) } : {}),
        },
      ]) }} />
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
          <img className={styles.detailCover} src={activity.coverUrl} alt={`${activity.title}活动封面`} width="1600" height="1000" />
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
            <MarkdownContent content={activity.content || activity.summary} />
          </section>
        </div>
      </div>
    </main>
  );
}
