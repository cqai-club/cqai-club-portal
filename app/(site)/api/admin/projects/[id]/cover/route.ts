import { NextResponse } from "next/server";

import { serializeAdminProject } from "@/lib/project-market";
import {
  readProjectCover,
  removeProjectCover,
  requireAdminAccess,
  saveProjectCover,
} from "@/lib/site/api-helpers";
import { prisma } from "@/lib/site/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  const denied = await requireAdminAccess(request.headers.get("authorization") ?? "");
  if (denied) return denied;
  const { id } = await context.params;

  try {
    const project = await prisma.project.findUnique({
      where: { id },
      select: { coverStorageKey: true, coverMimeType: true },
    });
    if (!project?.coverStorageKey || !project.coverMimeType) {
      return new NextResponse("Not found", { status: 404 });
    }
    if (project.coverMimeType !== "image/jpeg" && project.coverMimeType !== "image/png") {
      return new NextResponse("Cover unavailable", { status: 500 });
    }
    const buffer = await readProjectCover(project.coverStorageKey);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": project.coverMimeType,
        "Content-Length": String(buffer.length),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Get admin project cover error:", error);
    return new NextResponse("Cover unavailable", { status: 404 });
  }
}

export async function PUT(request: Request, context: RouteContext): Promise<NextResponse> {
  const denied = await requireAdminAccess(request.headers.get("authorization") ?? "");
  if (denied) return denied;
  const { id } = await context.params;

  const current = await prisma.project.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ error: "项目不存在。" }, { status: 404 });
  const requestedVersion = request.headers.get("if-match");
  if (requestedVersion && requestedVersion !== current.updatedAt.toISOString()) {
    return NextResponse.json(
      { error: "项目已被其他管理员更新，请刷新后重试上传。" },
      { status: 409 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "封面上传数据无法解析。" }, { status: 400 });
  }
  const candidate = formData.get("cover") ?? formData.get("projectCover");
  if (!candidate || typeof candidate === "string") {
    return NextResponse.json({ error: "请选择项目封面。" }, { status: 400 });
  }

  let saved;
  try {
    saved = await saveProjectCover(candidate);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "封面上传失败。" },
      { status: 400 }
    );
  }

  try {
    const update = await prisma.project.updateMany({
      where: { id, updatedAt: requestedVersion ? new Date(requestedVersion) : current.updatedAt },
      data: {
        coverStorageKey: saved.storageKey,
        coverOriginalName: saved.originalName,
        coverMimeType: saved.mimeType,
        coverSize: saved.size,
      },
    });
    if (update.count !== 1) {
      await removeProjectCover(saved.storageKey);
      return NextResponse.json(
        { error: "项目已被其他操作更新，请刷新后重试上传。" },
        { status: 409 }
      );
    }
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      await removeProjectCover(saved.storageKey);
      return NextResponse.json({ error: "项目不存在。" }, { status: 404 });
    }
    // Keep the previous blob while database backups may still reference it.
    // Unreferenced covers can be garbage-collected only after that retention
    // window; deleting here could make an automatic DB rollback lose images.
    return NextResponse.json(serializeAdminProject(project));
  } catch (error) {
    await removeProjectCover(saved.storageKey);
    console.error("Update project cover error:", error);
    return NextResponse.json({ error: "保存项目封面失败。" }, { status: 500 });
  }
}
