import { NextResponse } from "next/server";
import { prisma } from "@/lib/site/prisma";
import { requireAdminAccess } from "@/lib/site/api-helpers";
import { assertMemberOrigin, MemberSessionError } from "./session";
import { requireInnovationMember } from "./innovation-access";
import { parseResourceInput } from "./resource-input";
import { readResourceImage, removeResourceImage, saveResourceImage } from "./resource-image";

const headers = { "Cache-Control": "private, no-store" };
const selected = { id: true, description: true, externalUrl: true, published: true, updatedAt: true } as const;
function serialize(item: { id: string; description: string; externalUrl: string; published: boolean; updatedAt: Date }, manage = false) {
  return { ...item, updatedAt: item.updatedAt.toISOString(), imageUrl: `/member/api/${manage ? "admin/" : ""}resources/${item.id}/image?v=${item.updatedAt.getTime()}` };
}
function failure(error: unknown): NextResponse {
  if (error instanceof MemberSessionError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers });
  }
  console.error("Member resource request failed:", error);
  return NextResponse.json({ error: "资料暂时无法处理，请稍后重试。" }, { status: 500, headers });
}
async function admin(request: Request, write = false) {
  const denied = await requireAdminAccess(request.headers.get("authorization") ?? "");
  if (denied) { denied.headers.set("Cache-Control", "private, no-store"); return denied; }
  if (write) assertMemberOrigin(request);
  return null;
}

export async function listResources(request: Request, manage = false) {
  try {
    if (manage) { const denied = await admin(request); if (denied) return denied; }
    else await requireInnovationMember(request);
    const raw = Number(new URL(request.url).searchParams.get("page") || 1);
    const requested = Number.isSafeInteger(raw) && raw > 0 ? Math.min(raw, 1000000) : 1;
    const where = manage ? {} : { published: true };
    const result = await prisma.$transaction(async db => {
      const total = await db.memberResource.count({ where });
      const totalPages = Math.max(1, Math.ceil(total / 12));
      const page = Math.min(requested, totalPages);
      const items = await db.memberResource.findMany({ where, select: selected, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 12, take: 12 });
      return { data: items.map(item => serialize(item, manage)), page, totalPages, total };
    });
    return NextResponse.json(result, { headers });
  } catch (error) { return failure(error); }
}

export async function writeResource(request: Request, id?: string) {
  let newImage: string | undefined;
  try {
    const denied = await admin(request, true); if (denied) return denied;
    const length = Number(request.headers.get("content-length") || 0);
    if (length > 6 * 1024 * 1024) throw new MemberSessionError(413, "TOO_LARGE", "上传内容过大，图片不能超过 5MB。");
    let form: FormData;
    try { form = await request.formData(); } catch { throw new MemberSessionError(400, "INVALID_FORM", "提交数据无法解析。"); }
    const input = parseResourceInput(form, request);
    const current = id ? await prisma.memberResource.findUnique({ where: { id } }) : null;
    if (id && !current) throw new MemberSessionError(404, "NOT_FOUND", "资料不存在。");
    if (current && form.get("updatedAt") !== current.updatedAt.toISOString()) {
      throw new MemberSessionError(409, "CONFLICT", "资料已被修改，请刷新后重试。");
    }
    const image = form.get("image");
    if (image instanceof File && image.size > 0) newImage = await saveResourceImage(image);
    if (!newImage && !current) throw new MemberSessionError(400, "IMAGE_REQUIRED", "请选择资料图片。");
    let item;
    if (current) {
      item = await prisma.$transaction(async db => {
        const changed = await db.memberResource.updateMany({ where: { id: current.id, updatedAt: current.updatedAt }, data: { ...input, imageStorageKey: newImage ?? current.imageStorageKey } });
        if (!changed.count) throw new MemberSessionError(409, "CONFLICT", "资料已被修改，请刷新后重试。");
        return db.memberResource.findUniqueOrThrow({ where: { id: current.id }, select: selected });
      });
    } else {
      item = await prisma.memberResource.create({ data: { ...input, imageStorageKey: newImage! }, select: selected });
    }
    const committedImage = newImage;
    newImage = undefined;
    if (committedImage && current) await removeResourceImage(current.imageStorageKey);
    return NextResponse.json(serialize(item, true), { status: current ? 200 : 201, headers });
  } catch (error) {
    if (newImage) await removeResourceImage(newImage);
    return failure(error);
  }
}

export async function deleteResource(request: Request, id: string) {
  try {
    const denied = await admin(request, true); if (denied) return denied;
    const current = await prisma.memberResource.findUnique({ where: { id } });
    if (!current) throw new MemberSessionError(404, "NOT_FOUND", "资料不存在。");
    let payload;
    try { payload = await request.json(); } catch { throw new MemberSessionError(400, "INVALID_FORM", "提交数据无法解析。"); }
    if (payload?.updatedAt !== current.updatedAt.toISOString()) throw new MemberSessionError(409, "CONFLICT", "资料已被修改，请刷新后重试。");
    const deleted = await prisma.memberResource.deleteMany({ where: { id, updatedAt: current.updatedAt } });
    if (!deleted.count) throw new MemberSessionError(409, "CONFLICT", "资料已被修改，请刷新后重试。");
    await removeResourceImage(current.imageStorageKey);
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) { return failure(error); }
}

export async function resourceImage(request: Request, id: string, manage = false) {
  try {
    if (manage) { const denied = await admin(request); if (denied) return denied; }
    else await requireInnovationMember(request);
    const item = await prisma.memberResource.findUnique({ where: { id } });
    if (!item) throw new MemberSessionError(404, "NOT_FOUND", "图片不存在。");
    if (!manage && !item.published) throw new MemberSessionError(404, "NOT_FOUND", "图片不存在。");
    let bytes: Buffer;
    try { bytes = await readResourceImage(item.imageStorageKey); } catch {
      throw new MemberSessionError(404, "NOT_FOUND", "图片不存在。");
    }
    return new NextResponse(new Uint8Array(bytes), { headers: { ...headers, "Content-Type": "image/jpeg", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return failure(error); }
}
