import { NextResponse } from "next/server";

import { listPublicProjects } from "@/lib/project-market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function integerParam(value: string | null, fallback: number, maximum: number): number | null {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) return null;
  return parsed;
}

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const page = integerParam(searchParams.get("page"), 1, 1_000_000);
  const limit = integerParam(searchParams.get("limit"), 12, 50);
  if (page === null || limit === null) {
    return NextResponse.json(
      { error: "page 必须是正整数，limit 必须是 1 到 50 之间的整数。" },
      { status: 400 }
    );
  }

  const featuredValue = searchParams.get("featured");
  if (featuredValue !== null && featuredValue !== "true" && featuredValue !== "false") {
    return NextResponse.json({ error: "featured 必须是 true 或 false。" }, { status: 400 });
  }

  try {
    const result = await listPublicProjects({
      page,
      limit,
      ...(featuredValue === null ? {} : { featured: featuredValue === "true" }),
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("List public projects error:", error);
    return NextResponse.json({ error: "获取项目列表失败。" }, { status: 500 });
  }
}
