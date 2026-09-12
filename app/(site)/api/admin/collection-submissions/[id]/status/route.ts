/**
 * PATCH /api/admin/collection-submissions/:id/status
 * Advance a submission's review status (new/reviewing/approved/rejected).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/site/prisma";
import {
  collectionStatuses,
  requireAdminAccess,
  serializeCollectionSubmission,
} from "@/lib/site/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const authorization = request.headers.get("authorization") ?? "";
  const denied = await requireAdminAccess(authorization);
  if (denied) return denied;

  const { id } = await context.params;

  let body: { status?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const status = typeof body.status === "string" ? body.status : "";
  if (!collectionStatuses.has(status)) {
    return NextResponse.json({ error: "无效的审核状态。" }, { status: 400 });
  }

  try {
    const submission = await prisma.collectionSubmission.update({
      where: { id },
      data: { status },
      include: { assets: true },
    });
    return NextResponse.json(serializeCollectionSubmission(submission));
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code?: string }).code === "P2025"
    ) {
      return NextResponse.json({ error: "未找到这条征集资料。" }, { status: 404 });
    }
    console.error("Update collection submission status error:", error);
    return NextResponse.json({ error: "更新审核状态失败。" }, { status: 500 });
  }
}
