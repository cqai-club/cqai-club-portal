import Link from "next/link";
import { notFound } from "next/navigation";

import { ActivityManager, type ActivityManagerPreviewData } from "@/components/activities/ActivityManager";
import { getManagedActivityRecap, listActivityRegistrations, listManagedActivities } from "@/lib/club-activities";

export const dynamic = "force-dynamic";

const previewCovers: Record<string, string> = {
  "codex-demo-activity-draft": "/images/activity-1.jpg",
  "codex-demo-activity-upcoming": "/images/activity-2.jpg",
  "codex-demo-activity-ongoing": "/images/activity-3.jpg",
  "codex-demo-activity-past": "/images/tl-4.jpg",
  "codex-demo-activity-cancelled": "/images/activity-4.jpg",
};

export default async function ActivityManagerPreviewPage() {
  if (process.env.NODE_ENV !== "development" ||
      process.env.DATABASE_URL !== "file:./club-activities-preview.db" ||
      process.env.CQAI_STORAGE_ROOT) notFound();

  const { items } = await listManagedActivities({ limit: 100 });
  const activities = items
    .filter(item => item.id.startsWith("codex-demo-activity-"))
    .map(item => ({ ...item, coverUrl: previewCovers[item.id] ?? item.coverUrl }));
  const registrations = Object.fromEntries(await Promise.all(activities.map(async activity => [
    activity.id,
    (await listActivityRegistrations(activity.id)).items,
  ]))) as ActivityManagerPreviewData["registrations"];
  const recaps = Object.fromEntries(await Promise.all(activities
    .filter(activity => activity.recapPublishedAt)
    .map(async activity => [activity.id, await getManagedActivityRecap(activity.id)]))) as ActivityManagerPreviewData["recaps"];

  return <main className="member-center min-h-dvh bg-background px-4 py-8 text-foreground sm:px-6 lg:px-10">
    <div className="mx-auto w-full max-w-6xl">
      <div className="mb-7 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
        <p>本地示例预览 · {activities.length} 场活动。可试用筛选、报名名单和回顾抽屉；提交与其他写入操作已停用。</p>
        <Link href="/member/dashboard/admin/activities/" className="inline-flex min-h-11 items-center rounded-lg border bg-card px-4 font-medium text-primary hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">进入真实管理页</Link>
      </div>
      <ActivityManager previewData={{ activities, registrations, recaps }} />
    </div>
  </main>;
}
