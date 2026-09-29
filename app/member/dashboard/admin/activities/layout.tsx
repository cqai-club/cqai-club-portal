import { redirect } from "next/navigation";

import { canManageActivities } from "@/lib/club-activity-auth";

export const dynamic = "force-dynamic";

export default async function ActivitiesAdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await canManageActivities())) redirect("/member/dashboard");
  return children;
}
