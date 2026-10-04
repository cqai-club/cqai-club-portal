import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/site/prisma";
import { requireAdminAccess } from "@/lib/site/api-helpers";
import { logtoConfig } from "@/lib/logto/config";
import { addOrganizationUser, removeOrganizationUser, getOrganization, getOrganizationUser, isOrganizationMember, listOrganizationUsers, OrganizationApiError, userOrganizations } from "@/lib/logto/organization-api";
import { assertMemberOrigin, memberIdentity, MemberSessionError, type MemberIdentity } from "./session";
import type { MemberJoinResult } from "./organization-types";

const headers = { "Cache-Control": "private, no-store" };
const id = z.string().trim().min(1).max(100).regex(/^[\w-]+$/);
const bindingInput = z.object({ id: id.optional(), name: z.string().trim().min(1).max(80), organizationId: id, revision: z.number().int().nonnegative().optional(), confirmChange: z.boolean().optional() }).strict();
export function organizationError(error: unknown) {
  if (error instanceof MemberSessionError || error instanceof OrganizationApiError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers });
  }
  if (error instanceof z.ZodError) return NextResponse.json({ error: "请检查填写内容。", code: "VALIDATION_ERROR" }, { status: 400, headers });
  if (error && typeof error === "object" && "code" in error && error.code === "P2002") return NextResponse.json({ error: "该组织已配置，请刷新列表。" }, { status: 409, headers });
  console.error("Member organization operation failed", error instanceof Error ? error.name : "unknown");
  return NextResponse.json({ error: "会员操作暂时无法完成，请重试。" }, { status: 500, headers });
}
async function input(request: Request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") || "")) throw new MemberSessionError(415, "INVALID_CONTENT_TYPE", "请使用 JSON 提交。");
  const text = await request.text();
  if (Buffer.byteLength(text) > 8192) throw new MemberSessionError(413, "TOO_LARGE", "请求内容过长。");
  try { return JSON.parse(text); } catch { throw new MemberSessionError(400, "INVALID_JSON", "请求内容无效。"); }
}
async function authorize(request: Request, write = false) {
  const denied = await requireAdminAccess(request.headers.get("authorization") || "");
  if (denied) { denied.headers.set("Cache-Control", "private, no-store"); return denied; }
  if (write) assertMemberOrigin(request);
  return null;
}
async function bindingFor(idValue: string, revision?: number) {
  const binding = await prisma.memberOrganizationBinding.findUnique({ where: { id: idValue } });
  if (!binding) throw new MemberSessionError(404, "BINDING_NOT_FOUND", "会员组织配置不存在。");
  if (!binding.validatedAt) throw new MemberSessionError(409, "BINDING_UNVERIFIED", "请先验证并保存组织配置。");
  if (revision !== undefined && binding.revision !== revision) throw new MemberSessionError(409, "CONFIG_CHANGED", "组织配置已改变，请刷新后重新选择成员。");
  return binding;
}
async function recordJoin(organizationId: string, userId: string, actor: MemberIdentity, source: string) {
  return prisma.memberOrganizationJoin.upsert({
    where: { organizationId_userId: { organizationId, userId } },
    create: { organizationId, userId, actorIssuer: actor.userIssuer, actorSub: actor.userSub, source },
    update: { confirmedAt: new Date(), actorIssuer: actor.userIssuer, actorSub: actor.userSub, source },
  });
}
export async function joinAndConfirm(organizationId: string, userId: string, actor: MemberIdentity, source: string): Promise<MemberJoinResult> {
  try {
    if (await isOrganizationMember(organizationId, userId)) return { userId, state: "joined" };
  } catch (error) {
    return { userId, state: "failed", error: error instanceof Error ? error.message : "成员关系无法读取。" };
  }
  let writeFailed = false;
  try { await addOrganizationUser(organizationId, userId); } catch { writeFailed = true; }
  try {
    if (await isOrganizationMember(organizationId, userId)) {
      await recordJoin(organizationId, userId, actor, source);
      return { userId, state: "joined" };
    }
    return { userId, state: "failed", error: writeFailed ? "加入组织失败，请重试。" : "组织成员关系尚未生效，请重试。" };
  } catch {
    return { userId, state: "unknown", error: "加入结果待确认，请重新确认成员关系。" };
  }
}
export async function manageBindings(request: Request): Promise<NextResponse> {
  try {
    const denied = await authorize(request, request.method !== "GET"); if (denied) return denied;
    if (request.method === "GET") return NextResponse.json({ data: await prisma.memberOrganizationBinding.findMany({ orderBy: { createdAt: "asc" } }) }, { headers });
    const data = bindingInput.parse(await input(request));
    const org = await getOrganization(data.organizationId);
    if (request.method === "POST") {
      const binding = await prisma.memberOrganizationBinding.create({ data: { name: data.name, organizationId: org.id, organizationName: org.name, validatedAt: new Date() } });
      return NextResponse.json({ binding }, { status: 201, headers });
    }
    if (!data.id || data.revision === undefined) throw new MemberSessionError(400, "INVALID_CONFIG", "缺少配置版本。");
    const existing = await prisma.memberOrganizationBinding.findUnique({ where: { id: data.id } });
    if (!existing) throw new MemberSessionError(404, "BINDING_NOT_FOUND", "组织配置不存在。");
    if (existing.organizationId !== org.id && !data.confirmChange) throw new MemberSessionError(409, "CONFIRM_REQUIRED", "请确认更换组织，已有成员不会自动迁移。");
    const changed = await prisma.memberOrganizationBinding.updateMany({ where: { id: data.id, revision: data.revision }, data: { name: data.name, organizationId: org.id, organizationName: org.name, validatedAt: new Date(), revision: { increment: 1 } } });
    if (!changed.count) throw new MemberSessionError(409, "CONFIG_CHANGED", "配置已被修改，请刷新后重试。");
    return NextResponse.json({ success: true }, { headers });
  } catch (error) { return organizationError(error); }
}
export async function verifyBinding(request: Request) {
  try {
    const denied = await authorize(request, true); if (denied) return denied;
    const data = z.object({ organizationId: id }).strict().parse(await input(request));
    return NextResponse.json({ organization: await getOrganization(data.organizationId) }, { headers });
  } catch (error) { return organizationError(error); }
}
export async function listManagedUsers(request: Request, members: boolean) {
  try {
    const denied = await authorize(request); if (denied) return denied;
    const params = new URL(request.url).searchParams;
    const binding = await bindingFor(id.parse(params.get("bindingId")));
    const page = z.coerce.number().int().min(1).max(100000).parse(params.get("page") || 1);
    const q = z.string().max(100).parse(params.get("q") || "").trim();
    const result = await listOrganizationUsers(page, q, members ? binding.organizationId : undefined);
    const recorded = await prisma.memberOrganizationJoin.findMany({ where: { organizationId: binding.organizationId, userId: { in: result.data.map(row => row.id) } } });
    const dates = new Map(recorded.map(row => [row.userId, row.confirmedAt.toISOString()]));
    const data = await Promise.all(result.data.map(async row => ({ ...row, inOrganization: members || await isOrganizationMember(binding.organizationId, row.id), joinedAt: dates.get(row.id) || null })));
    return NextResponse.json({ ...result, data, revision: binding.revision, synchronizedAt: new Date().toISOString() }, { headers });
  } catch (error) { return organizationError(error); }
}
export async function managedUserDetail(request: Request, userId: string) {
  try {
    const denied = await authorize(request); if (denied) return denied;
    const binding = await bindingFor(id.parse(new URL(request.url).searchParams.get("bindingId")));
    const [user, orgs, bindings] = await Promise.all([getOrganizationUser(id.parse(userId)), userOrganizations(userId), prisma.memberOrganizationBinding.findMany({ where: { validatedAt: { not: null } } })]);
    if (!orgs.some(org => org.id === binding.organizationId)) throw new MemberSessionError(404, "MEMBER_NOT_FOUND", "该用户不属于当前组织。");
    return NextResponse.json({ user, bindings: bindings.filter(item => orgs.some(org => org.id === item.organizationId)) }, { headers });
  } catch (error) { return organizationError(error); }
}
export async function addManagedUsers(request: Request) {
  try {
    const denied = await authorize(request, true); if (denied) return denied;
    const data = z.object({ bindingId: id, revision: z.number().int().nonnegative(), userIds: z.array(id).min(1).max(20).refine(values => new Set(values).size === values.length) }).strict().parse(await input(request));
    const binding = await bindingFor(data.bindingId, data.revision);
    const actor = await memberIdentity(request);
    await getOrganization(binding.organizationId);
    const results: MemberJoinResult[] = [];
    for (const userId of data.userIds) {
      try {
        await getOrganizationUser(userId);
        await bindingFor(data.bindingId, data.revision);
        results.push(await joinAndConfirm(binding.organizationId, userId, actor, "manual"));
      } catch (error) { results.push({ userId, state: "failed", error: error instanceof Error ? error.message : "添加失败。" }); }
    }
    return NextResponse.json({ results }, { headers });
  } catch (error) { return organizationError(error); }
}
export async function removeManagedUser(request: Request) {
  try {
    const denied = await authorize(request, true); if (denied) return denied;
    const data = z.object({ bindingId: id, revision: z.number().int().nonnegative(), userId: id }).strict().parse(await input(request));
    const binding = await bindingFor(data.bindingId, data.revision);
    await getOrganization(binding.organizationId);
    await getOrganizationUser(data.userId);
    const member = await isOrganizationMember(binding.organizationId, data.userId);
    await bindingFor(data.bindingId, data.revision);
    if (member) {
      // A lost response may follow a successful removal; membership readback decides the result.
      try { await removeOrganizationUser(binding.organizationId, data.userId); } catch { /* Verify below. */ }
    }
    let remains: boolean;
    try { remains = await isOrganizationMember(binding.organizationId, data.userId); }
    catch { throw new MemberSessionError(503, "REMOVAL_UNKNOWN", "移除结果待确认，请刷新或重试。"); }
    if (remains) throw new MemberSessionError(503, "REMOVAL_FAILED", "移除未完成，请重试。");
    return NextResponse.json({ success: true }, { headers });
  } catch (error) { return organizationError(error); }
}
function expectedIssuer() {
  const endpoint = logtoConfig.endpoint.replace(/\/+$/, "");
  return endpoint.endsWith("/oidc") ? endpoint : `${endpoint}/oidc`;
}
export async function reviewMemberApplication(request: Request, applicationId: string) {
  try {
    const denied = await authorize(request, true); if (denied) return denied;
    const data = z.object({ action: z.enum(["approve", "reject", "retry"]), reviewNote: z.string().trim().max(500).default(""), confirmOrganizationChange: z.boolean().default(false), bindingRevision: z.number().int().nonnegative().optional(), bindingOrganizationId: id.optional() }).strict().parse(await input(request));
    const actor = await memberIdentity(request);
    const application = await prisma.memberApplication.findUnique({ where: { id: id.parse(applicationId) } });
    if (!application) throw new MemberSessionError(404, "APPLICATION_NOT_FOUND", "申请不存在。");
    if (data.action === "reject") {
      const changed = await prisma.memberApplication.updateMany({ where: { id: application.id, reviewStatus: "pending" }, data: { reviewStatus: "rejected", reviewNote: data.reviewNote, reviewedAt: new Date(), reviewedByIssuer: actor.userIssuer, reviewedBySub: actor.userSub } });
      if (!changed.count) throw new MemberSessionError(409, "ALREADY_REVIEWED", "申请已处理，请刷新。");
      return NextResponse.json({ success: true }, { headers });
    }
    const ciIdentity = process.env.CI === "true" && process.env.CQAI_CI_AUTH_BYPASS === "enabled-for-smoke-tests" && application.userIssuer === "ci";
    if (!application.userSub || (!ciIdentity && application.userIssuer !== expectedIssuer())) throw new MemberSessionError(409, "UNBOUND_ACCOUNT", "申请未绑定当前 Logto 账户，不能自动授权。");
    if (data.action === "approve" && application.reviewStatus !== "pending") throw new MemberSessionError(409, "ALREADY_REVIEWED", "申请已处理，请使用重试加入。");
    if (data.action === "retry" && application.reviewStatus !== "approved") throw new MemberSessionError(409, "NOT_APPROVED", "请先审核申请。");
    if (data.bindingRevision === undefined || !data.bindingOrganizationId) throw new MemberSessionError(400, "INVALID_CONFIG", "请刷新并核对审核目标组织。");
    const binding = await bindingFor("innovation", data.bindingRevision);
    if (binding.organizationId !== data.bindingOrganizationId) throw new MemberSessionError(409, "CONFIG_CHANGED", "组织配置已改变，请刷新并核对审核目标。");
    if (application.membershipOrganizationId && application.membershipOrganizationId !== binding.organizationId && !data.confirmOrganizationChange) {
      throw new MemberSessionError(409, "ORGANIZATION_CHANGED", "创享会员组织配置已改变，请核对新组织后确认重试。");
    }
    if (application.membershipState === "processing" && application.membershipStartedAt && Date.now() - application.membershipStartedAt.getTime() < 120000) {
      throw new MemberSessionError(409, "PROCESSING", "正在加入组织，请稍后刷新或重试。");
    }
    await getOrganization(binding.organizationId);
    await getOrganizationUser(application.userSub);
    await bindingFor(binding.id, binding.revision);
    const attempt = randomUUID();
    const startedAt = new Date();
    const changed = await prisma.memberApplication.updateMany({
      where: { id: application.id, reviewStatus: application.reviewStatus, membershipAttemptId: application.membershipAttemptId, membershipState: application.membershipState },
      data: { reviewStatus: "approved", ...(data.action === "approve" ? { reviewNote: data.reviewNote, reviewedAt: startedAt, reviewedByIssuer: actor.userIssuer, reviewedBySub: actor.userSub } : {}), membershipState: "processing", membershipOrganizationId: binding.organizationId, membershipAttemptId: attempt, membershipStartedAt: startedAt, membershipError: null },
    });
    if (!changed.count) throw new MemberSessionError(409, "CONCURRENT_REVIEW", "申请已由其他操作处理，请刷新。");
    const result = await joinAndConfirm(binding.organizationId, application.userSub, actor, "application");
    await prisma.memberApplication.updateMany({ where: { id: application.id, membershipAttemptId: attempt }, data: { membershipState: result.state, membershipError: result.error || null } });
    return NextResponse.json({ result }, { headers });
  } catch (error) { return organizationError(error); }
}
