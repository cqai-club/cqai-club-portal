import { NextResponse } from "next/server";

import {
  assertFeaturedCapacity,
  assertFeaturedOrderAvailable,
  getPublishValidationError,
  isFeaturedLimitError,
  isFeaturedOrderConflict,
  isPrismaErrorCode,
  nextFeaturedOrder,
  normalizeProjectData,
  projectInputSchema,
  projectPatchSchema,
  projectToEditableInput,
  serializeAdminProject,
} from "@/lib/project-market";
import { requireAdminAccess, sanitizeData } from "@/lib/site/api-helpers";
import { prisma } from "@/lib/site/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  const denied = await requireAdminAccess(request.headers.get("authorization") ?? "");
  if (denied) return denied;
  const { id } = await context.params;

  try {
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) return NextResponse.json({ error: "项目不存在。" }, { status: 404 });
    return NextResponse.json(serializeAdminProject(project), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Get project error:", error);
    return NextResponse.json({ error: "获取项目详情失败。" }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  const denied = await requireAdminAccess(request.headers.get("authorization") ?? "");
  if (denied) return denied;
  const { id } = await context.params;

  let body: unknown;
  try {
    body = sanitizeData(await request.json());
  } catch {
    return NextResponse.json({ error: "请求数据无法解析。" }, { status: 400 });
  }
  const patch = projectPatchSchema.safeParse(body);
  if (!patch.success) {
    return NextResponse.json(
      { error: patch.error.issues[0]?.message ?? "项目信息无效。" },
      { status: 400 }
    );
  }

  try {
    const current = await prisma.project.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ error: "项目不存在。" }, { status: 404 });
    const requestedVersion = request.headers.get("if-match");
    if (requestedVersion && requestedVersion !== current.updatedAt.toISOString()) {
      return NextResponse.json(
        { error: "项目已被其他管理员更新，请刷新后重试。" },
        { status: 409 }
      );
    }

    if (current.publishedAt && patch.data.slug && patch.data.slug !== current.slug) {
      return NextResponse.json({ error: "项目首次发布后不能修改 slug。" }, { status: 400 });
    }

    const merged = projectInputSchema.safeParse({
      ...projectToEditableInput(current),
      ...patch.data,
    });
    if (!merged.success) {
      return NextResponse.json(
        { error: merged.error.issues[0]?.message ?? "项目信息无效。" },
        { status: 400 }
      );
    }

    const normalized = normalizeProjectData(merged.data);
    if (current.status === "published") {
      const publishError = getPublishValidationError({
        name: normalized.name,
        summary: normalized.summary,
        description: normalized.description,
        coverStorageKey: current.coverStorageKey,
      });
      if (publishError) return NextResponse.json({ error: publishError }, { status: 400 });
    }

    if (current.status === "published" && normalized.featured) {
      await assertFeaturedCapacity(current.id);
      if (normalized.featuredOrder === null) {
        normalized.featuredOrder = await nextFeaturedOrder(current.id);
      }
      await assertFeaturedOrderAvailable(current.id, normalized.featuredOrder);
    }

    const update = await prisma.project.updateMany({
      where: { id, updatedAt: requestedVersion ? new Date(requestedVersion) : current.updatedAt },
      data: {
        slug: merged.data.slug ?? current.slug,
        ...normalized,
      },
    });
    if (update.count !== 1) {
      return NextResponse.json(
        { error: "项目已被其他操作更新，请刷新后重试。" },
        { status: 409 }
      );
    }
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) return NextResponse.json({ error: "项目不存在。" }, { status: 404 });
    return NextResponse.json(serializeAdminProject(project));
  } catch (error) {
    if (isFeaturedOrderConflict(error)) {
      return NextResponse.json({ error: "该首页推荐顺序已被其他项目占用。" }, { status: 409 });
    }
    if (isFeaturedLimitError(error)) {
      return NextResponse.json({ error: "首页最多推荐 6 个已发布项目。" }, { status: 409 });
    }
    if (isPrismaErrorCode(error, "P2002")) {
      return NextResponse.json({ error: "该项目 slug 已经存在。" }, { status: 409 });
    }
    console.error("Update project error:", error);
    return NextResponse.json({ error: "更新项目失败。" }, { status: 500 });
  }
}
