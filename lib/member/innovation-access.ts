import "server-only";
import { cache } from "react";
import { getLogtoContext } from "@/lib/logto";
import { isOrganizationMember } from "@/lib/logto/organization-api";
import { prisma } from "@/lib/site/prisma";
import { memberIdentity, MemberSessionError, type MemberIdentity } from "./session";

async function assertInnovationMembership(identity: Pick<MemberIdentity, "userSub">): Promise<void> {
  const binding = await prisma.memberOrganizationBinding.findUnique({ where: { id: "innovation" } });
  if (!binding?.validatedAt) throw new MemberSessionError(503, "MEMBERSHIP_UNAVAILABLE", "创新会员组织配置尚未完成，请联系管理员。");
  let member: boolean;
  try { member = await isOrganizationMember(binding.organizationId, identity.userSub); }
  catch { throw new MemberSessionError(503, "MEMBERSHIP_UNAVAILABLE", "会员身份暂时无法验证，请稍后重试。"); }
  if (!member) throw new MemberSessionError(403, "INNOVATION_MEMBERSHIP_REQUIRED", "仅创新会员可使用此功能，请先申请加入。");
}

// Every API request rechecks Logto; no process/session cache can retain revoked access.
export async function requireInnovationMember(request: Request): Promise<MemberIdentity> {
  const identity = await memberIdentity(request);
  await assertInnovationMembership(identity);
  return identity;
}

// React cache only deduplicates layout/page/navigation checks within one render.
export const innovationMemberPageAccess = cache(async (): Promise<"allowed" | "denied" | "unauthorized" | "unavailable"> => {
  const context = await getLogtoContext();
  if (!context.isAuthenticated || typeof context.claims?.sub !== "string") return "unauthorized";
  try {
    await assertInnovationMembership({ userSub: context.claims.sub });
    return "allowed";
  } catch (error) {
    if (error instanceof MemberSessionError && error.status === 403) return "denied";
    return "unavailable";
  }
});

export async function hasInnovationMemberAccess(): Promise<boolean> {
  return (await innovationMemberPageAccess()) === "allowed";
}
