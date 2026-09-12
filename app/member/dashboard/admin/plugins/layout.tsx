import { redirect } from "next/navigation";
import { getLogtoContext } from "@/lib/logto";
import { hasPluginAdminPermission } from "@/lib/member/permissions";

export const dynamic = "force-dynamic";

export default async function PluginAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated } = await getLogtoContext();

  if (!isAuthenticated) redirect("/member/sign-in");
  if (!(await hasPluginAdminPermission())) redirect("/member/dashboard");

  return children;
}
