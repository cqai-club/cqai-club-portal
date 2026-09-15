import { NextResponse } from "next/server";

import { getPublicProjectBySlug } from "@/lib/project-market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, context: RouteContext): Promise<NextResponse> {
  const { slug } = await context.params;
  try {
    const project = await getPublicProjectBySlug(slug);
    if (!project) return NextResponse.json({ error: "项目不存在或尚未发布。" }, { status: 404 });
    return NextResponse.json(project, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Get public project error:", error);
    return NextResponse.json({ error: "获取项目详情失败。" }, { status: 500 });
  }
}
