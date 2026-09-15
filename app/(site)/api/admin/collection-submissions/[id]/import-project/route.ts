import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { NextResponse } from "next/server";

import {
  createProjectIdentity,
  isPrismaErrorCode,
  normalizeProjectData,
  parseProjectSubmissionInput,
  serializeAdminProject,
} from "@/lib/project-market";
import {
  COLLECTION_UPLOAD_DIR,
  persistProjectCover,
  removeProjectCover,
  requireAdminAccess,
} from "@/lib/site/api-helpers";
import { prisma } from "@/lib/site/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  const denied = await requireAdminAccess(request.headers.get("authorization") ?? "");
  if (denied) return denied;
  const { id: submissionId } = await context.params;

  try {
    const submission = await prisma.collectionSubmission.findUnique({
      where: { id: submissionId },
      include: {
        assets: true,
        importedProject: true,
      },
    });
    if (!submission) {
      return NextResponse.json({ error: "未找到这条征集资料。" }, { status: 404 });
    }
    if (submission.importedProject) {
      return NextResponse.json({
        project: serializeAdminProject(submission.importedProject),
        created: false,
      });
    }
    if (submission.type !== "project") {
      return NextResponse.json({ error: "只有 AI 项目征集资料可以导入项目广场。" }, { status: 400 });
    }
    if (submission.status !== "approved") {
      return NextResponse.json({ error: "只有审核通过的项目才能导入项目广场。" }, { status: 409 });
    }

    let payload: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(submission.payloadJson);
      payload = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {};
    } catch {
      return NextResponse.json({ error: "征集资料内容损坏，无法导入。" }, { status: 422 });
    }

    const input = parseProjectSubmissionInput(payload, submission.displayName, submission.contact);
    if (!input.success) {
      return NextResponse.json(
        { error: `征集资料无法导入：${input.error.issues[0]?.message ?? "字段无效。"} 请在项目广场手工新增项目并整理这条历史资料。` },
        { status: 422 }
      );
    }

    const sourceCover = submission.assets.find(asset => asset.kind === "projectCover");
    let copiedCover: Awaited<ReturnType<typeof persistProjectCover>> | null = null;
    if (sourceCover) {
      if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(sourceCover.storageKey)) {
        return NextResponse.json({ error: "征集封面的存储信息无效。" }, { status: 422 });
      }
      try {
        const buffer = await readFile(join(COLLECTION_UPLOAD_DIR, sourceCover.storageKey));
        copiedCover = await persistProjectCover(
          buffer,
          sourceCover.originalName,
          sourceCover.mimeType
        );
      } catch (error) {
        console.error("Copy submission project cover error:", error);
        return NextResponse.json({ error: "读取征集项目封面失败。" }, { status: 500 });
      }
    }

    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const identity = createProjectIdentity();
        try {
          const project = await prisma.project.create({
            data: {
              id: identity.id,
              sourceSubmissionId: submission.id,
              slug: identity.slug,
              status: "draft",
              ...normalizeProjectData(input.data),
              ...(copiedCover
                ? {
                    coverStorageKey: copiedCover.storageKey,
                    coverOriginalName: copiedCover.originalName,
                    coverMimeType: copiedCover.mimeType,
                    coverSize: copiedCover.size,
                  }
                : {}),
            },
          });
          return NextResponse.json(
            { project: serializeAdminProject(project), created: true },
            { status: 201 }
          );
        } catch (error) {
          if (!isPrismaErrorCode(error, "P2002")) throw error;
          const existing = await prisma.project.findUnique({
            where: { sourceSubmissionId: submission.id },
          });
          if (existing) {
            await removeProjectCover(copiedCover?.storageKey);
            return NextResponse.json({
              project: serializeAdminProject(existing),
              created: false,
            });
          }
          if (attempt === 2) throw error;
        }
      }
    } catch (error) {
      await removeProjectCover(copiedCover?.storageKey);
      throw error;
    }

    await removeProjectCover(copiedCover?.storageKey);
    return NextResponse.json({ error: "导入项目失败。" }, { status: 500 });
  } catch (error) {
    console.error("Import collection submission as project error:", error);
    return NextResponse.json({ error: "导入项目失败。" }, { status: 500 });
  }
}
