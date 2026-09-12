import { NextResponse } from "next/server";
import { prisma } from "@/lib/site/prisma";
import { requireAdminAccess } from "@/lib/site/api-helpers";
import { PLUGIN_ADMIN_PERMISSION } from "@/lib/member/permissions";
import { pluginStatusSchema, serializePlugin } from "@/lib/plugin-market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  const denied = await requireAdminAccess(request.headers.get("authorization") ?? "", PLUGIN_ADMIN_PERMISSION);
  if (denied) return denied;
  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求数据无法解析。" }, { status: 400 });
  }
  const status = pluginStatusSchema.safeParse((body as { status?: unknown })?.status);
  if (!status.success) return NextResponse.json({ error: "插件状态无效。" }, { status: 400 });

  try {
    const plugin = await prisma.plugin.update({
      where: { id },
      data: {
        status: status.data,
        publishedAt: status.data === "published" ? new Date() : null,
      },
    });
    return NextResponse.json(serializePlugin(plugin));
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2025") {
      return NextResponse.json({ error: "插件不存在。" }, { status: 404 });
    }
    console.error("Update plugin status error:", error);
    return NextResponse.json({ error: "更新插件状态失败。" }, { status: 500 });
  }
}
