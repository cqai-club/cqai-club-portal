import { redirect } from "next/navigation";
import { innovationMemberPageAccess } from "@/lib/member/innovation-access";
import { MEMBER_APPLICATION_PATH, memberLoginPath } from "@/lib/member/return-to";

export const dynamic = "force-dynamic";

// Login returns must recheck membership before opening the application drawer.
export default async function MemberApplicationPage() {
  const access = await innovationMemberPageAccess();
  if (access === "unauthorized") redirect(memberLoginPath(MEMBER_APPLICATION_PATH));
  redirect(access === "denied" ? "/member/dashboard/plans?application=open" : "/member/dashboard/plans");
}
