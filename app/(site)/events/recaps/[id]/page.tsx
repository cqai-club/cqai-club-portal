/* eslint-disable @next/next/no-img-element -- recap images use the validated same-origin image API */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarDays, Images } from "lucide-react";

import { MarkdownContent } from "@/components/markdown/MarkdownContent";
import { ActivityError, getPublicActivityRecap } from "@/lib/club-activities";
import styles from "./recap.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "活动回顾 | 重庆 AI 创享俱乐部",
  description: "查看重庆 AI 创享俱乐部活动的现场图文回顾。",
};

const dateText = (iso: string) => new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", dateStyle: "long", timeStyle: "short",
}).format(new Date(iso));

export default async function ActivityRecapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let recap;
  try {
    recap = await getPublicActivityRecap(id);
  } catch (error) {
    if (error instanceof ActivityError && error.status === 404) notFound();
    throw error;
  }

  const heroImage = recap.images[0]?.url ?? recap.coverUrl;
  const otherImages = recap.images.slice(1);

  return <main id="events-main" className={styles.main}>
    <div className={styles.container}>
      <nav className={styles.breadcrumb} aria-label="面包屑导航">
        <Link href="/">俱乐部首页</Link><span aria-hidden="true">/</span>
        <Link href="/events/#history">历史活动回顾</Link><span aria-hidden="true">/</span>
        <span aria-current="page">{recap.title}</span>
      </nav>

      <header className={styles.header}>
        <span className={styles.eyebrow}>CQAI CLUB · EVENT RECAP</span>
        <h1>{recap.title}</h1>
        <p className={styles.summary}>{recap.summary}</p>
        <div className={styles.meta}>
          <span><CalendarDays aria-hidden="true" size={17} />活动于 {dateText(recap.endsAt)} 结束</span>
          {recap.images.length > 0 && <span><Images aria-hidden="true" size={17} />{recap.images.length} 张现场图片</span>}
        </div>
      </header>

      {heroImage && <figure className={styles.heroImage}>
        <img src={heroImage} alt={recap.images[0]?.originalName || `${recap.activityTitle}活动图片`} width="1600" height="1000" />
      </figure>}

      <div className={styles.bodyGrid}>
        <article className={styles.article} aria-labelledby="recap-body-title">
          <h2 id="recap-body-title">活动现场回顾</h2>
          <MarkdownContent content={recap.content} className={styles.articleText} />
        </article>
        <aside className={styles.aside}>
          <p className={styles.asideLabel}>ABOUT THIS EVENT</p>
          <h2>{recap.activityTitle}</h2>
          <p>了解活动时间、地点与原始介绍。</p>
          <Link href={`/activities/${recap.activityId}/`}>查看活动详情 <ArrowRight aria-hidden="true" size={16} /></Link>
        </aside>
      </div>

      {otherImages.length > 0 && <section className={styles.gallery} aria-labelledby="recap-gallery-title">
        <h2 id="recap-gallery-title">现场图片</h2>
        <div className={styles.galleryGrid}>
          {otherImages.map(image => <figure key={image.id}>
            <img src={image.url} alt={image.originalName} width="720" height="540" loading="lazy" decoding="async" />
          </figure>)}
        </div>
      </section>}

      <Link className={styles.backLink} href="/events/#history"><ArrowLeft aria-hidden="true" size={17} />返回活动交流</Link>
    </div>
  </main>;
}
