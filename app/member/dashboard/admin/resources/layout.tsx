import { redirect } from "next/navigation";
import { hasMemberAdminPermission } from "@/lib/member/permissions";
export const dynamic = "force-dynamic";
export default async function ResourcesAdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await hasMemberAdminPermission())) redirect("/member/dashboard");
  return children;
}
