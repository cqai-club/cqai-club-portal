"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import type { ActivityView } from "@/lib/club-activities";

type MyRegistration = { status: string; activity: ActivityView };

export function ActivitySignup({ activity }: { activity: ActivityView }) {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [registered, setRegistered] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"success" | "error">("success");

  const refresh = useCallback(async () => {
    const response = await fetch("/api/v1/me/activity-registrations", { cache: "no-store" });
    if (response.status === 401) { setSignedIn(false); return; }
    if (!response.ok) { setMessageKind("error"); setMessage("报名状态读取失败，请稍后刷新。"); return; }
    const data = await response.json() as { items: MyRegistration[] };
    setSignedIn(true);
    setRegistered(data.items.some(item => item.activity.id === activity.id && item.status === "confirmed"));
  }, [activity.id]);

  useEffect(() => { void refresh(); }, [refresh]);

  const now = Date.now();
  const closed = activity.status !== "published" || Date.parse(activity.registrationOpensAt) > now || Date.parse(activity.registrationClosesAt) <= now || Date.parse(activity.startsAt) <= now;
  const full = activity.registeredCount >= activity.capacity;

  async function changeRegistration() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/v1/activities/${activity.id}/registration`, {
        method: registered ? "DELETE" : "POST",
        credentials: "same-origin",
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "操作失败，请稍后重试。");
      setRegistered(!registered);
      setMessageKind("success");
      setMessage(registered ? "已取消报名。" : "报名成功，已为你确认名额。");
      router.refresh();
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : "操作失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  return <section className="rounded-2xl border border-border bg-card p-6 shadow-sm" aria-labelledby="activity-signup-title">
    <p className="text-xs font-semibold tracking-[0.14em] text-primary">REGISTRATION</p>
    <h2 id="activity-signup-title" className="mt-2 text-xl font-semibold text-foreground">活动报名</h2>
    <p className="mt-2 text-sm leading-6 text-muted-foreground">登录即可免费报名，无需正式会员审核。</p>
    <div className="mt-5 rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
      已报名 {activity.registeredCount} / {activity.capacity} 人
    </div>
    {signedIn === false ? <Link href="/member/sign-in" className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-5 font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">登录后报名</Link>
      : <button type="button" disabled={busy || signedIn === null || (!registered && (closed || full))} onClick={() => { void changeRegistration(); }} className={registered
        ? "mt-5 min-h-11 w-full rounded-lg border border-border bg-card px-5 font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        : "mt-5 min-h-11 w-full rounded-lg bg-primary px-5 font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"}>
        {busy ? "处理中…" : signedIn === null ? "正在检查报名状态…" : registered ? "取消报名" : closed ? "报名未开放或已截止" : full ? "名额已满" : "立即报名"}
      </button>}
    {message && <p className={messageKind === "error" ? "mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800" : "mt-4 rounded-lg bg-primary/5 p-3 text-sm text-foreground"} role={messageKind === "error" ? "alert" : "status"}>{message}</p>}
  </section>;
}
