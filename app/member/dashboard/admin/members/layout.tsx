import { redirect } from "next/navigation";
import { getLogtoContext } from "@/lib/logto";
import { hasMemberAdminPermission } from "@/lib/member/permissions";

export const dynamic = "force-dynamic";

export default async function MemberAdminMembersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated } = await getLogtoContext();

  if (!isAuthenticated) redirect("/member/sign-in");
  if (!(await hasMemberAdminPermission())) redirect("/member/dashboard");

  return children;
}
