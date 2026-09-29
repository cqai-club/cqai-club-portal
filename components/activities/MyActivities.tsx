/* eslint-disable @next/next/no-img-element -- covers use the validated same-origin activity image API */
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, CalendarDays, MapPin, Ticket } from "lucide-react";

import type { ActivityView } from "@/lib/club-activities";

type Registration = {
  id: string;
  status: string;
  createdAt: string;
  activity: ActivityView;
};

const dateText = (iso: string) => new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", dateStyle: "medium", timeStyle: "short",
}).format(new Date(iso));

export function MyActivities() {
  const [items, setItems] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/v1/me/activity-registrations", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error("报名记录读取失败。");
      const data = await response.json() as { items: Registration[] };
      setItems(data.items);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "报名记录读取失败。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function cancel(id: string) {
    if (cancelingId) return;
    setCancelingId(id);
    setError("");
    try {
      const response = await fetch(`/api/v1/activities/${id}/registration`, { method: "DELETE", credentials: "same-origin" });
      if (!response.ok) {
        const data = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(data?.error || "取消报名失败。");
      }
      setItems(current => current.map(item => item.activity.id === id ? { ...item, status: "cancelled" } : item));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "取消报名失败。");
    } finally {
      setCancelingId(null);
    }
  }

  if (loading) return <div className="mt-8" role="status">
    <span className="sr-only">正在读取报名记录…</span>
    <div aria-hidden="true" className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
      {[1, 2, 3].map(index => <div key={index} className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="aspect-[16/9] bg-muted/80" />
        <div className="space-y-3 p-5"><div className="h-5 w-2/3 rounded bg-muted" /><div className="h-4 w-full rounded bg-muted" /><div className="h-4 w-3/4 rounded bg-muted" /></div>
      </div>)}
    </div>
  </div>;

  return <div className="mt-8 space-y-5">
    {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
      <span>{error}</span>
      <button type="button" onClick={() => { void load(); }} className="min-h-11 rounded-lg border border-destructive/30 px-4 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">重试读取</button>
    </div>}
    {items.length === 0 ? (error ? null : <div className="rounded-2xl border border-dashed bg-card px-6 py-12 text-center">
      <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><Ticket aria-hidden="true" className="size-6" /></span>
      <h2 className="mt-4 text-lg font-semibold">还没有报名活动</h2>
      <p className="mt-2 text-sm text-muted-foreground">发现感兴趣的活动，报名后就能在这里查看进展。</p>
      <Link href="/events/" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">浏览活动 <ArrowRight aria-hidden="true" className="size-4" /></Link>
    </div>) : <>
      <p className="text-sm text-muted-foreground">共 {items.length} 条报名记录</p>
      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        {items.map(item => {
          const activity = item.activity;
          const confirmed = item.status === "confirmed";
          return <article key={item.id} className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-shadow hover:shadow-md">
            <div className="relative aspect-[16/9] overflow-hidden bg-muted">
              {activity.coverUrl ? <img src={activity.coverUrl} alt="" width="1600" height="900" loading="lazy" decoding="async" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.025] motion-reduce:transform-none" /> : <div className="flex size-full items-center justify-center bg-gradient-to-br from-muted via-background to-primary/10 text-primary/70">
                <CalendarDays aria-hidden="true" className="size-12" />
              </div>}
              <span className={"absolute left-4 top-4 inline-flex items-center rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold shadow-sm " + (confirmed ? "text-primary" : "text-muted-foreground")}>{confirmed ? "已报名" : "已取消报名"}</span>
            </div>
            <div className="flex flex-1 flex-col p-5">
              <h2 className="line-clamp-2 break-words text-lg font-semibold leading-7 tracking-tight">{activity.title}</h2>
              {activity.summary && <p className="mt-2 line-clamp-2 break-words text-sm leading-6 text-muted-foreground">{activity.summary}</p>}
              <div className="mt-5 flex-1 space-y-3 border-t pt-4 text-sm">
                <p className="flex items-start gap-3"><CalendarDays aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" /><time dateTime={activity.startsAt}>{dateText(activity.startsAt)}</time></p>
                <p className="flex min-w-0 items-start gap-3"><MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" /><span className="min-w-0 break-words text-muted-foreground">{activity.mode === "online" ? "线上" : "线下"} · {activity.location}</span></p>
                {(activity.status === "cancelled" || activity.deletedAt || activity.detailsChangedAt) && <div className="space-y-2 pt-1 text-xs leading-5">
                  {activity.status === "cancelled" && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">活动已取消，请留意后续通知。</p>}
                  {activity.deletedAt && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">活动已下架。</p>}
                  {activity.detailsChangedAt && <p className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-foreground">活动信息曾更新，请重新核对时间和地点。</p>}
                </div>}
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-2 border-t pt-4">
                {!activity.deletedAt && <Link href={`/activities/${activity.id}/`} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary/10 px-4 text-sm font-medium text-primary hover:bg-primary/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">查看详情 <ArrowRight aria-hidden="true" className="size-4" /></Link>}
                {confirmed && <button type="button" disabled={cancelingId !== null} onClick={() => { void cancel(activity.id); }} className="min-h-11 rounded-lg px-4 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50">{cancelingId === activity.id ? "取消中…" : "取消报名"}</button>}
              </div>
            </div>
          </article>;
        })}
      </div>
    </>}
  </div>;
}
