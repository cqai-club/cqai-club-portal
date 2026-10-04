import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { innovationMemberPageAccess } from "@/lib/member/innovation-access";
import { memberLoginPath } from "@/lib/member/return-to";

export async function innovationPageDenial(pathname: string, deniedContent?: ReactNode) {
  const access = await innovationMemberPageAccess();
  if (access === "unauthorized") redirect(memberLoginPath(pathname));
  if (access === "denied") {
    if (deniedContent !== undefined) return deniedContent;
    redirect("/member/dashboard/plans?application=open");
  }
  if (access === "unavailable") return (
    <div className="space-y-4 rounded-xl border bg-card p-6">
      <p role="alert">会员身份暂时无法验证，请稍后重试或联系管理员。</p>
      <a className="inline-flex min-h-11 items-center rounded-lg border px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href={pathname}>重新验证</a>
    </div>
  );
  return null;
}
