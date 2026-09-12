import { NextResponse } from "next/server";
import { prisma } from "@/lib/site/prisma";
import { requireAdminAccess } from "@/lib/site/api-helpers";
import { PLUGIN_ADMIN_PERMISSION } from "@/lib/member/permissions";
import { pluginInputSchema, serializePlugin } from "@/lib/plugin-market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  const denied = await requireAdminAccess(request.headers.get("authorization") ?? "", PLUGIN_ADMIN_PERMISSION);
  if (denied) return denied;
  const { id } = await context.params;
  const plugin = await prisma.plugin.findUnique({ where: { id } });
  if (!plugin) return NextResponse.json({ error: "插件不存在。" }, { status: 404 });
  return NextResponse.json(serializePlugin(plugin), { headers: { "Cache-Control": "no-store" } });
}

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
  const parsed = pluginInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "插件信息无效。" }, { status: 400 });
  }

  try {
    const plugin = await prisma.plugin.update({
      where: { id },
      data: {
        packageName: parsed.data.packageName,
        displayName: parsed.data.displayName,
        summary: parsed.data.summary,
        description: parsed.data.description || null,
        categoriesJson: JSON.stringify([...new Set(parsed.data.categories)]),
        keywordsJson: JSON.stringify([...new Set(parsed.data.keywords)]),
        repositoryUrl: parsed.data.repositoryUrl || null,
        homepageUrl: parsed.data.homepageUrl || null,
        iconUrl: parsed.data.iconUrl || null,
        compatibilityApiVersion: parsed.data.compatibilityApiVersion || null,
        compatibilityHostsJson: JSON.stringify([...new Set(parsed.data.compatibilityHosts)]),
      },
    });
    return NextResponse.json(serializePlugin(plugin));
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2025") {
      return NextResponse.json({ error: "插件不存在。" }, { status: 404 });
    }
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "该 npm 包已经存在。" }, { status: 409 });
    }
    console.error("Update plugin error:", error);
    return NextResponse.json({ error: "更新插件失败。" }, { status: 500 });
  }
}
