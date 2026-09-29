/* eslint-disable @next/next/no-img-element -- historical covers are existing static site assets */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarDays, MapPin, UsersRound } from "lucide-react";

import { listPublishedActivityRecaps, listUpcomingPublicActivities, type ActivityRecapView, type ActivityView } from "@/lib/club-activities";
import styles from "./events.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "活动交流 | 重庆 AI 创享俱乐部",
  description: "查看重庆 AI 创享俱乐部即将开始的活动并报名，回顾茶话会、工作坊和项目路演等历史活动。",
};

const highlights = [
  {
    month: "2026-08",
    date: "2026 年 8 月",
    type: "工作坊",
    title: "AI智能体实战工作坊",
    description: "重庆大学副教授主讲，聚焦自动化工作流与Skills体系。",
    image: "/images/tl-6.jpg",
  },
  {
    month: "2026-07",
    date: "2026 年 7 月",
    type: "路演",
    title: "俱乐部首场项目路演",
    description: "智能绿植养护、AI发型设计、清淤机器人等项目亮相。",
    image: "/images/tl-5.jpg",
  },
  {
    month: "2026-07",
    date: "2026 年 7 月",
    type: "茶话会",
    title: "重庆有哪些被低估的AI落地场景？",
    description: "聚焦火锅供应链、摩托车配件质检、旅游文创等本地产业。",
    image: "/images/tl-4.jpg",
  },
  {
    month: "2026-06",
    date: "2026 年 6 月",
    type: "深潜沙龙",
    title: "AI创研项目落地组队攻坚",
    description: "创研圈首场活动，项目、技术、市场三方现场组队。",
    image: "/images/tl-3.jpg",
  },
  {
    month: "2026-06",
    date: "2026 年 6 月",
    type: "茶话会",
    title: "AI时代，程序员会失业还是更值钱？",
    description: "围绕AI编程工具对开发者职业的影响展开深度辩论。",
    image: "/images/tl-2.jpg",
  },
  {
    month: "2026-05",
    date: "2026 年 5 月",
    type: "茶话会",
    title: "具身智能的现状与发展趋势",
    description: "联合七腾机器人、重庆大学等机构代表闭门研讨。",
    image: "/images/tl-1.jpg",
  },
] as const;

const dateText = (iso: string) => new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", dateStyle: "long", timeStyle: "short",
}).format(new Date(iso));
const monthText = (iso: string) => new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "long",
}).format(new Date(iso));

function activityStatus(activity: ActivityView, now: number): { label: string; kind: "primary" | "muted" } {
  if (activity.registeredCount >= activity.capacity) return { label: "名额已满", kind: "muted" };
  if (Date.parse(activity.registrationOpensAt) > now) return { label: "即将开放", kind: "muted" };
  if (Date.parse(activity.registrationClosesAt) <= now) return { label: "报名已截止", kind: "muted" };
  return { label: "开放报名", kind: "primary" };
}

function CurrentActivityCard({ activity, now }: { activity: ActivityView; now: number }) {
  const status = activityStatus(activity, now);
  return (
    <Link className={styles.recordCard} href={`/activities/${activity.id}/`}>
      {activity.coverUrl && <div className={styles.recordCover}>
        <img src={activity.coverUrl} alt="" width="1600" height="1000" loading="lazy" decoding="async" />
      </div>}
      <div className={styles.recordBody}>
        <div className={styles.cardTop}>
          <span className={styles.recordDate}>
            <CalendarDays aria-hidden="true" size={17} />
            <time dateTime={activity.startsAt}>{dateText(activity.startsAt)}</time>
          </span>
          <span className={`${styles.status} ${status.kind === "muted" ? styles.statusMuted : ""}`}>
            {status.label}
          </span>
        </div>
        <h3>{activity.title}</h3>
        <p>{activity.summary}</p>
        <span className={styles.recordLocation}>
          <MapPin aria-hidden="true" size={16} />
          {activity.mode === "online" ? "线上" : "线下"} · {activity.location}
        </span>
        <span className={styles.attendees}>
          <UsersRound aria-hidden="true" size={16} />
          {activity.registeredCount} / {activity.capacity} 人已报名
        </span>
        <span className={styles.recordLink}>查看活动详情 <ArrowRight aria-hidden="true" size={17} /></span>
      </div>
    </Link>
  );
}

function RecapCard({ recap }: { recap: ActivityRecapView }) {
  const hasDetail = Boolean(recap.content.trim());
  const imageUrl = hasDetail
    ? recap.images[0]?.url ?? recap.coverUrl
    : recap.coverUrl ?? recap.images[0]?.url;
  const cardContent = <>
    <div className={styles.cover}>
      {imageUrl ? <img src={imageUrl} alt="" width="720" height="450" loading="lazy" decoding="async" /> : <div className={styles.recapPlaceholder}><CalendarDays aria-hidden="true" size={38} /></div>}
    </div>
    <div className={styles.cardBody}>
      <div className={styles.cardMeta}>
        <time dateTime={recap.endsAt}>{monthText(recap.endsAt)}</time>
        <span className={styles.type}>活动回顾</span>
      </div>
      <h3>{recap.title}</h3>
      <p>{recap.summary}</p>
      {hasDetail && <span className={styles.recapLink}>阅读图文回顾 <ArrowRight aria-hidden="true" size={16} /></span>}
    </div>
  </>;

  return hasDetail
    ? <Link className={`${styles.highlightCard} ${styles.recapCard} ${styles.recapCardLink}`} href={`/events/recaps/${recap.activityId}/`}>{cardContent}</Link>
    : <article className={`${styles.highlightCard} ${styles.recapCard}`}>{cardContent}</article>;
}

export default async function EventsPage() {
  const now = new Date();
  const [{ items: upcoming }, { items: publishedRecaps }] = await Promise.all([
    listUpcomingPublicActivities(now),
    listPublishedActivityRecaps(now),
  ]);
  const nowTimestamp = now.getTime();

  return (
    <main id="events-main" className={styles.main}>
      <section className={styles.hero}>
        <div className={styles.container}>
          <span className={styles.eyebrow}>CQAI CLUB EVENTS</span>
          <h1>活动交流</h1>
          <p>查看即将开始的活动并报名，也在这里回顾俱乐部的茶话会、工作坊与项目路演。</p>
          <div className={styles.heroActions}>
            <a className={styles.primaryAction} href="#upcoming-title">
              查看即将开始的活动 <ArrowRight aria-hidden="true" size={17} />
            </a>
            <a className={styles.secondaryAction} href="#history">回顾历史活动</a>
          </div>
        </div>
      </section>

      <div className={`${styles.container} ${styles.content}`}>
        <section className={styles.section} aria-labelledby="upcoming-title">
          <div className={styles.sectionHead}>
            <div>
              <span className={styles.sectionLabel}>UPCOMING EVENTS</span>
              <h2 id="upcoming-title">即将开始</h2>
              <p>查看活动时间与地点，登录后即可报名。</p>
            </div>
            <Link className={styles.textAction} href="/member/dashboard/activities">
              我的报名 <ArrowRight aria-hidden="true" size={17} />
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}><CalendarDays aria-hidden="true" size={21} /></span>
              <h3>近期活动正在筹备中</h3>
              <p>新的活动发布后会出现在这里，欢迎稍后再来看看。</p>
            </div>
          ) : (
            <div className={styles.recordGrid}>
              {upcoming.map(activity => <CurrentActivityCard key={activity.id} activity={activity} now={nowTimestamp} />)}
            </div>
          )}
        </section>

        <section id="history" className={styles.section} aria-labelledby="history-title">
          <div className={styles.sectionHead}>
            <div>
              <span className={styles.sectionLabel}>PAST EVENTS / HIGHLIGHTS</span>
              <h2 id="history-title">历史活动回顾</h2>
              <p>查看活动结束后发布的回顾，以及官网时间线中的代表性交流主题。</p>
            </div>
            <span className={styles.count}>共 {publishedRecaps.length + highlights.length} 场</span>
          </div>
          <div className={styles.highlightGrid}>
            {publishedRecaps.map(recap => <RecapCard key={recap.activityId} recap={recap} />)}
            {highlights.map((item) => (
              <article className={styles.highlightCard} key={`${item.month}-${item.title}`}>
                <div className={styles.cover}>
                  <img src={item.image} alt="" width="720" height="450" loading="lazy" decoding="async" />
                </div>
                <div className={styles.cardBody}>
                  <div className={styles.cardMeta}>
                    <time dateTime={item.month}>{item.date}</time>
                    <span className={styles.type}>{item.type}</span>
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

      </div>
    </main>
  );
}
