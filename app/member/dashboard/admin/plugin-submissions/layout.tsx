import { redirect } from "next/navigation";

import { hasPluginAdminPermission } from "@/lib/member/permissions";

export const dynamic = "force-dynamic";

export default async function PluginSubmissionsLayout({ children }: { children: React.ReactNode }) {
  if (!(await hasPluginAdminPermission())) redirect("/member/dashboard");
  return children;
}
