import { redirect } from "next/navigation";
import { getLogtoContext } from "@/lib/logto";

export const dynamic = "force-dynamic";

export default async function MemberAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated } = await getLogtoContext();

  if (!isAuthenticated) {
    redirect("/member/sign-in");
  }

  return children;
}
