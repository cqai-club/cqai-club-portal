import { redirect } from "next/navigation";
import { getLogtoContext } from "@/lib/logto";
import { hasPartnerAdminPermission } from "@/lib/member/permissions";

export const dynamic = "force-dynamic";

export default async function PartnerAdminLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = await getLogtoContext();
  if (!isAuthenticated) redirect("/member/sign-in");
  if (!(await hasPartnerAdminPermission())) redirect("/member/dashboard");
  return children;
}
