/**
 * GET /api/admin/collection-submissions/:id/assets/:assetId
 * Stream a stored avatar / companyLogo / projectCover file back with its recorded mime type.
 */
import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "@/lib/site/prisma";
import {
  COLLECTION_UPLOAD_DIR,
  detectImageMimeType,
  requireAdminAccess,
} from "@/lib/site/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; assetId: string }> }
): Promise<NextResponse> {
  const authorization = request.headers.get("authorization") ?? "";
  const denied = await requireAdminAccess(authorization);
  if (denied) return denied;

  try {
    const { id, assetId } = await context.params;
    const asset = await prisma.submissionAsset.findFirst({
      where: {
        id: assetId,
        submissionId: id,
      },
    });
    if (!asset) {
      return NextResponse.json({ error: "未找到附件。" }, { status: 404 });
    }
    if (
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(asset.storageKey) ||
      (asset.mimeType !== "image/jpeg" && asset.mimeType !== "image/png")
    ) {
      return NextResponse.json({ error: "附件存储信息无效。" }, { status: 422 });
    }

    let buffer: Buffer;
    try {
      buffer = await readFile(join(COLLECTION_UPLOAD_DIR, asset.storageKey));
    } catch {
      return NextResponse.json(
        { error: "附件文件不存在。" },
        { status: 404 }
      );
    }
    if (detectImageMimeType(buffer) !== asset.mimeType) {
      return NextResponse.json({ error: "附件内容格式无效。" }, { status: 422 });
    }

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": asset.mimeType,
        "Content-Length": String(buffer.length),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Get collection asset error:", error);
    return NextResponse.json({ error: "读取附件失败。" }, { status: 500 });
  }
}
