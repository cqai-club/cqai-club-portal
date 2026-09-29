import Link from "next/link";

import { MyActivities } from "@/components/activities/MyActivities";

export const dynamic = "force-dynamic";

export default function MyActivitiesPage() {
  return <section>
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs font-semibold tracking-[0.14em] text-primary">CQAI CLUB EVENTS</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">我的活动</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">查看报名状态、活动变更和取消信息。</p>
      </div>
      <Link href="/events/" className="inline-flex min-h-11 items-center rounded-lg border bg-card px-4 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">浏览活动</Link>
    </div>
    <MyActivities />
  </section>;
}
