/**
 * GET /api/admin/collection-submissions
 * Admin list of showcase submissions (type/status/search filters + pagination).
 * The export + per-item detail routes are siblings under this directory.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/site/prisma";
import {
  collectionWhere,
  parsePositiveInteger,
  requireAdminAccess,
  serializeCollectionSubmission,
} from "@/lib/site/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const authorization = request.headers.get("authorization") ?? "";
  const denied = await requireAdminAccess(authorization);
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const page = parsePositiveInteger(searchParams.get("page"), 1, 1_000_000);
    const limit = parsePositiveInteger(searchParams.get("limit"), 20, 100);
    const skip = (page - 1) * limit;

    const query: Record<string, string> = {};
    for (const key of ["type", "status", "search"]) {
      const value = searchParams.get(key);
      if (value !== null) query[key] = value;
    }
    const where = collectionWhere(query);

    const [submissions, total] = await Promise.all([
      prisma.collectionSubmission.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: { assets: true },
      }),
      prisma.collectionSubmission.count({ where }),
    ]);

    return NextResponse.json({
      data: submissions.map(serializeCollectionSubmission),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("List collection submissions error:", error);
    return NextResponse.json({ error: "获取征集资料失败。" }, { status: 500 });
  }
}
