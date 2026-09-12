/**
 * GET /api/admin/collection-submissions/:id
 * Single submission detail (payload JSON + nested assets).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/site/prisma";
import {
  requireAdminAccess,
  serializeCollectionSubmission,
} from "@/lib/site/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const authorization = request.headers.get("authorization") ?? "";
  const denied = await requireAdminAccess(authorization);
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const submission = await prisma.collectionSubmission.findUnique({
      where: { id },
      include: { assets: true },
    });
    if (!submission) {
      return NextResponse.json({ error: "未找到这条征集资料。" }, { status: 404 });
    }
    return NextResponse.json(serializeCollectionSubmission(submission));
  } catch (error) {
    console.error("Get collection submission error:", error);
    return NextResponse.json({ error: "获取征集详情失败。" }, { status: 500 });
  }
}
