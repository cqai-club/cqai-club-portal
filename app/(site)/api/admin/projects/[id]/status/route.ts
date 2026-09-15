import { NextResponse } from "next/server";

import {
  assertFeaturedCapacity,
  assertFeaturedOrderAvailable,
  getPublishValidationError,
  isFeaturedLimitError,
  isFeaturedOrderConflict,
  isPrismaErrorCode,
  nextFeaturedOrder,
  projectStatusSchema,
  serializeAdminProject,
} from "@/lib/project-market";
import { requireAdminAccess } from "@/lib/site/api-helpers";
import { prisma } from "@/lib/site/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  const denied = await requireAdminAccess(request.headers.get("authorization") ?? "");
  if (denied) return denied;
  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求数据无法解析。" }, { status: 400 });
  }
  const status = projectStatusSchema.safeParse((body as { status?: unknown })?.status);
  if (!status.success) return NextResponse.json({ error: "项目状态无效。" }, { status: 400 });

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

    const featured = status.data === "published" ? current.featured : false;
    let featuredOrder = status.data === "published" ? current.featuredOrder : null;
    if (status.data === "published") {
      const publishError = getPublishValidationError(current);
      if (publishError) return NextResponse.json({ error: publishError }, { status: 400 });
      if (featured) {
        await assertFeaturedCapacity(current.id);
        if (featuredOrder === null) featuredOrder = await nextFeaturedOrder(current.id);
        await assertFeaturedOrderAvailable(current.id, featuredOrder);
      }
    }

    const update = await prisma.project.updateMany({
      where: { id, updatedAt: requestedVersion ? new Date(requestedVersion) : current.updatedAt },
      data: {
        status: status.data,
        featured,
        featuredOrder,
        publishedAt:
          status.data === "published"
            ? current.publishedAt ?? new Date()
            : current.publishedAt,
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
    if (isPrismaErrorCode(error, "P2025")) {
      return NextResponse.json({ error: "项目不存在。" }, { status: 404 });
    }
    console.error("Update project status error:", error);
    return NextResponse.json({ error: "更新项目状态失败。" }, { status: 500 });
  }
}
