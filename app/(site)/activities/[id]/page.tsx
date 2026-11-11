/* eslint-disable @next/next/no-img-element -- activity covers use the validated same-origin image API */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { ActivitySignup } from "@/components/activities/ActivitySignup";
import { CopyActivityAddress } from "@/components/activities/CopyActivityAddress";
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

const dateFormatter = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "long" });
const weekdayFormatter = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", weekday: "short" });
const timeFormatter = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

function ActivityDate({ iso }: { iso: string }) {
  const date = new Date(iso);
  return <span className={styles.dateLine}>
    <span>{dateFormatter.format(date)}</span>
    <span className={styles.weekday}>（{weekdayFormatter.format(date)}）</span>
  </span>;
}

function ActivityTimeRange({ startsAt, endsAt }: { startsAt: string; endsAt: string }) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (dateFormatter.format(start) === dateFormatter.format(end)) {
    return <div className={styles.dateTime}>
      <ActivityDate iso={startsAt} />
      <span className={styles.timeRange}>
        <time dateTime={startsAt}>{timeFormatter.format(start)}</time>
        <span className={styles.rangeSeparator}>至</span>
        <time dateTime={endsAt}>{timeFormatter.format(end)}</time>
      </span>
    </div>;
  }
  return <div className={styles.dateTime}>
    {[{ label: "开始", iso: startsAt }, { label: "结束", iso: endsAt }].map(({ label, iso }) => (
      <div key={label} className={styles.dateEndpoint}>
        <span className={styles.endpointLabel}>{label}</span>
        <time dateTime={iso} className={styles.dateTime}>
          <ActivityDate iso={iso} />
          <span className={styles.timeRange}>{timeFormatter.format(new Date(iso))}</span>
        </time>
      </div>
    ))}
  </div>;
}

export default async function ActivityDetailPage({ params }: ActivityDetailProps) {
  const { id } = await params;
  const activity = await getActivity(id);
  const activityPath = `/activities/${encodeURIComponent(activity.id)}/`;
  const onlineUrl = /^https?:\/\//i.test(activity.location) ? activity.location : undefined;
  // Room and building numbers can prevent map searches from finding the venue.
  const mapLocation = activity.location.replace(/\s*(?:[A-Za-z]+\d*|\d+)(?:号楼|[栋幢座楼层室]).*$/u, "").trim() || activity.location;
  const mapUrl = `https://apis.map.qq.com/uri/v1/search?keyword=${encodeURIComponent(mapLocation)}&referer=cqai-club-portal`;
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
                <dt>活动时间（北京时间）</dt>
                <dd><ActivityTimeRange startsAt={activity.startsAt} endsAt={activity.endsAt} /></dd>
              </div>
              <div>
                <dt>活动地点</dt>
                <dd>
                  <div className={styles.locationRow}>
                    {activity.mode === "online" ? <span className={styles.locationAddress}>线上 · {activity.location}</span> : (
                      <a className={styles.locationLink} href={mapUrl} target="_blank" rel="noopener noreferrer">
                        <span className={styles.locationAddress}>线下 · {activity.location}</span>
                        <span className={styles.mapAction}>打开地图导航 <span aria-hidden="true">↗</span></span>
                      </a>
                    )}
                    <CopyActivityAddress address={activity.location} className={styles.copyAddressButton} />
                  </div>
                </dd>
              </div>
              <div>
                <dt>报名截止</dt>
                <dd>
                  <time dateTime={activity.registrationClosesAt} className={styles.dateTime}>
                    <ActivityDate iso={activity.registrationClosesAt} />
                    <span className={styles.deadlineTime}>{timeFormatter.format(new Date(activity.registrationClosesAt))}</span>
                  </time>
                </dd>
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
