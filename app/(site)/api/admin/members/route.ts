/**
 * GET /api/admin/members
 * Admin dashboard member list, with orgType / city / isHighValue filters and
 * pagination (page/limit both clamped exactly as in the Express app).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/site/prisma";
import {
  parsePositiveInteger,
  requireAdminAccess,
} from "@/lib/site/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const authorization = request.headers.get("authorization") ?? "";
  const denied = await requireAdminAccess(authorization);
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const orgType = searchParams.get("orgType");
    const city = searchParams.get("city");
    const isHighValue = searchParams.get("isHighValue");
    const page = parsePositiveInteger(searchParams.get("page"), 1, 1_000_000);
    const limit = parsePositiveInteger(searchParams.get("limit"), 10, 100);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (orgType) where.orgType = orgType;
    if (city) where.city = city;
    if (isHighValue === "true") where.isHighValue = true;

    const [members, total] = await Promise.all([
      prisma.memberApplication.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.memberApplication.count({ where }),
    ]);

    return NextResponse.json({
      data: members.map(m => ({
        ...m,
        provideResources: JSON.parse(m.provideResources),
        needResources: JSON.parse(m.needResources),
        expectEvents: JSON.parse(m.expectEvents),
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("List members error:", error);
    return NextResponse.json({ error: "Failed to fetch members" }, { status: 500 });
  }
}
