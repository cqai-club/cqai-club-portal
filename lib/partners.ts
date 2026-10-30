import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { PARTNER_ADMIN_PERMISSION } from "@/lib/member/permissions";
import { assertMemberOrigin, MemberSessionError } from "@/lib/member/session";
import { requireAdminAccess } from "@/lib/site/api-helpers";
import { prisma } from "@/lib/site/prisma";

export type Partner = {
  id: string;
  groupId: string;
  nameZh: string;
  nameEn: string;
  url: string | null;
  sortOrder: number;
  enabled: boolean;
  revision: number;
};

export type PartnerGroup = {
  id: string;
  nameZh: string;
  nameEn: string;
  sortOrder: number;
  enabled: boolean;
  revision: number;
  partners: Partner[];
};

export type PublicPartner = Pick<Partner, "nameZh" | "nameEn" | "url">;
export type PublicPartnerGroup = Pick<PartnerGroup, "nameZh" | "nameEn"> & {
  partners: PublicPartner[];
};

const responseHeaders = { "Cache-Control": "private, no-store" };
const MAX_BODY_BYTES = 16 * 1024;
const orderBy = [{ sortOrder: "asc" }, { id: "asc" }] as const;
const partnerSelect = {
  id: true, groupId: true, nameZh: true, nameEn: true, url: true,
  sortOrder: true, enabled: true, revision: true,
} satisfies Prisma.PartnerSelect;
const groupSelect = {
  id: true, nameZh: true, nameEn: true, sortOrder: true, enabled: true, revision: true,
  partners: { select: partnerSelect, orderBy: [...orderBy] },
} satisfies Prisma.PartnerGroupSelect;

const name = z.string().trim().min(1, "请填写中英文名称。").max(100, "名称不能超过 100 字。");
const revision = z.number().int().nonnegative();
const groupId = z.string().trim().min(1).max(100);
const url = z.string().trim().max(2048, "链接不能超过 2048 字。").refine(value => {
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol) && Boolean(parsed.hostname)
      && !parsed.username && !parsed.password;
  } catch { return false; }
}, "链接仅支持不含账号密码的完整 HTTP 或 HTTPS 地址。").nullable();
const groupFields = { nameZh: name, nameEn: name, sortOrder: z.number().int().min(0).max(10000), enabled: z.boolean() };
const partnerFields = { ...groupFields, groupId, url };
const createGroupSchema = z.object({ ...groupFields, sortOrder: groupFields.sortOrder.default(0), enabled: groupFields.enabled.default(true) }).strict();
const createPartnerSchema = z.object({ ...partnerFields, url: url.default(null), sortOrder: groupFields.sortOrder.default(0), enabled: groupFields.enabled.default(true) }).strict();
const updateGroupSchema = z.object(groupFields).partial().extend({ revision }).strict()
  .refine(value => Object.keys(value).length > 1, "请提供需要修改的字段。");
const updatePartnerSchema = z.object(partnerFields).partial().extend({ revision }).strict()
  .refine(value => Object.keys(value).length > 1, "请提供需要修改的字段。");
const deleteSchema = z.object({ revision }).strict();

class PartnerError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: responseHeaders });
}

function failure(error: unknown): NextResponse {
  if (error instanceof PartnerError || error instanceof MemberSessionError) {
    return json({ error: error.message, code: error.code }, error.status);
  }
  if (error && typeof error === "object" && "code" in error) {
    if (error.code === "P2003") return json({ error: "分组仍有关联条目或已被修改，请刷新后重试。", code: "CONFLICT" }, 409);
    if (["P2034", "P2028", "P1008"].includes(String(error.code))) {
      return json({ error: "合作伙伴资料正在被修改，请刷新后重试。", code: "CONFLICT" }, 409);
    }
  }
  console.error("Partner administration failed:", error);
  return json({ error: "合作伙伴资料暂时无法处理，请稍后重试。" }, 500);
}

async function authorize(request: Request, write = false) {
  // Production checks the resource scope; the isolated CI seam still rejects member:admin editors.
  const denied = await requireAdminAccess(request.headers.get("authorization") ?? "", PARTNER_ADMIN_PERMISSION);
  if (denied) { denied.headers.set("Cache-Control", responseHeaders["Cache-Control"]); return denied; }
  if (write) assertMemberOrigin(request);
  return null;
}

async function readJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? "")) {
    throw new PartnerError(415, "INVALID_CONTENT_TYPE", "请以 JSON 格式提交数据。");
  }
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) {
    throw new PartnerError(413, "TOO_LARGE", "提交内容不能超过 16KB。");
  }
  if (!request.body) throw new PartnerError(400, "INVALID_BODY", "请求数据无法解析。");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new PartnerError(413, "TOO_LARGE", "提交内容不能超过 16KB。");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  let payload: unknown;
  try { payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { throw new PartnerError(400, "INVALID_BODY", "请求数据无法解析。"); }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new PartnerError(400, "INVALID_INPUT", issue?.code === "unrecognized_keys"
      ? "请求包含不支持的字段。" : issue?.message ?? "请检查提交的内容。");
  }
  return parsed.data;
}

function conflict(): never {
  throw new PartnerError(409, "CONFLICT", "资料已被其他管理员修改，请刷新后重试。");
}

async function requireGroup(tx: Prisma.TransactionClient, id: string) {
  const group = await tx.partnerGroup.findUnique({ where: { id }, select: { id: true } });
  if (!group) throw new PartnerError(404, "GROUP_NOT_FOUND", "合作伙伴分组不存在。");
}

/** Public SSR projection deliberately excludes ids, revisions, status and timestamps. */
export async function listPublicPartnerGroups(): Promise<PublicPartnerGroup[]> {
  return prisma.partnerGroup.findMany({
    where: { enabled: true },
    orderBy: [...orderBy],
    select: {
      nameZh: true, nameEn: true,
      partners: { where: { enabled: true }, orderBy: [...orderBy], select: { nameZh: true, nameEn: true, url: true } },
    },
  });
}

export async function getPartnerAdministration(request: Request): Promise<NextResponse> {
  try {
    const denied = await authorize(request); if (denied) return denied;
    const groups: PartnerGroup[] = await prisma.partnerGroup.findMany({ select: groupSelect, orderBy: [...orderBy] });
    return json({ groups });
  } catch (error) { return failure(error); }
}

export async function createPartner(request: Request): Promise<NextResponse> {
  try {
    const denied = await authorize(request, true); if (denied) return denied;
    const input = await readJson(request, createPartnerSchema);
    const partner = await prisma.$transaction(async tx => {
      await requireGroup(tx, input.groupId);
      return tx.partner.create({ data: input, select: partnerSelect });
    });
    return json({ partner }, 201);
  } catch (error) { return failure(error); }
}

export async function updatePartner(request: Request, id: string): Promise<NextResponse> {
  try {
    const denied = await authorize(request, true); if (denied) return denied;
    const { revision, ...input } = await readJson(request, updatePartnerSchema);
    const partner = await prisma.$transaction(async tx => {
      const current = await tx.partner.findUnique({ where: { id }, select: { revision: true } });
      if (!current) throw new PartnerError(404, "PARTNER_NOT_FOUND", "合作伙伴不存在。");
      if (current.revision !== revision) conflict();
      if (input.groupId !== undefined) await requireGroup(tx, input.groupId);
      const changed = await tx.partner.updateMany({ where: { id, revision }, data: { ...input, revision: { increment: 1 } } });
      if (changed.count !== 1) conflict();
      return tx.partner.findUniqueOrThrow({ where: { id }, select: partnerSelect });
    });
    return json({ partner });
  } catch (error) { return failure(error); }
}

export async function deletePartner(request: Request, id: string): Promise<NextResponse> {
  try {
    const denied = await authorize(request, true); if (denied) return denied;
    const { revision } = await readJson(request, deleteSchema);
    await prisma.$transaction(async tx => {
      const current = await tx.partner.findUnique({ where: { id }, select: { revision: true } });
      if (!current) throw new PartnerError(404, "PARTNER_NOT_FOUND", "合作伙伴不存在。");
      if (current.revision !== revision) conflict();
      const deleted = await tx.partner.deleteMany({ where: { id, revision } });
      if (deleted.count !== 1) conflict();
    });
    return json({ ok: true });
  } catch (error) { return failure(error); }
}

export async function createPartnerGroup(request: Request): Promise<NextResponse> {
  try {
    const denied = await authorize(request, true); if (denied) return denied;
    const input = await readJson(request, createGroupSchema);
    const group = await prisma.partnerGroup.create({ data: input, select: groupSelect });
    return json({ group }, 201);
  } catch (error) { return failure(error); }
}

export async function updatePartnerGroup(request: Request, id: string): Promise<NextResponse> {
  try {
    const denied = await authorize(request, true); if (denied) return denied;
    const { revision, ...input } = await readJson(request, updateGroupSchema);
    const group = await prisma.$transaction(async tx => {
      const current = await tx.partnerGroup.findUnique({ where: { id }, select: { revision: true } });
      if (!current) throw new PartnerError(404, "GROUP_NOT_FOUND", "合作伙伴分组不存在。");
      if (current.revision !== revision) conflict();
      const changed = await tx.partnerGroup.updateMany({ where: { id, revision }, data: { ...input, revision: { increment: 1 } } });
      if (changed.count !== 1) conflict();
      return tx.partnerGroup.findUniqueOrThrow({ where: { id }, select: groupSelect });
    });
    return json({ group });
  } catch (error) { return failure(error); }
}

export async function deletePartnerGroup(request: Request, id: string): Promise<NextResponse> {
  try {
    const denied = await authorize(request, true); if (denied) return denied;
    const { revision } = await readJson(request, deleteSchema);
    await prisma.$transaction(async tx => {
      const current = await tx.partnerGroup.findUnique({ where: { id }, select: { revision: true, _count: { select: { partners: true } } } });
      if (!current) throw new PartnerError(404, "GROUP_NOT_FOUND", "合作伙伴分组不存在。");
      if (current.revision !== revision) conflict();
      if (current._count.partners > 0) throw new PartnerError(409, "GROUP_NOT_EMPTY", "请先移走或删除分组内的合作伙伴。");
      const deleted = await tx.partnerGroup.deleteMany({ where: { id, revision, partners: { none: {} } } });
      if (deleted.count !== 1) conflict();
    });
    return json({ ok: true });
  } catch (error) { return failure(error); }
}
