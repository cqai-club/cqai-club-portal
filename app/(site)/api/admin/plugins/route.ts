import { NextResponse } from "next/server";
import { prisma } from "@/lib/site/prisma";
import { requireAdminAccess } from "@/lib/site/api-helpers";
import { PLUGIN_ADMIN_PERMISSION } from "@/lib/member/permissions";
import {
  PLUGIN_STATUSES,
  pluginInputSchema,
  serializePlugin,
} from "@/lib/plugin-market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unique(values: string[]): string[] {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}

function pluginData(input: ReturnType<typeof pluginInputSchema.parse>) {
  return {
    packageName: input.packageName,
    displayName: input.displayName,
    summary: input.summary,
    description: input.description || null,
    categoriesJson: JSON.stringify(unique(input.categories)),
    keywordsJson: JSON.stringify(unique(input.keywords)),
    repositoryUrl: input.repositoryUrl || null,
    homepageUrl: input.homepageUrl || null,
    iconUrl: input.iconUrl || null,
    compatibilityApiVersion: input.compatibilityApiVersion || null,
    compatibilityHostsJson: JSON.stringify(unique(input.compatibilityHosts)),
  };
}

export async function GET(request: Request): Promise<NextResponse> {
  const denied = await requireAdminAccess(request.headers.get("authorization") ?? "", PLUGIN_ADMIN_PERMISSION);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page") || "1") || 1);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") || "20") || 20));
  const status = searchParams.get("status") || "";
  const search = (searchParams.get("search") || "").trim().toLocaleLowerCase();
  if (status && !PLUGIN_STATUSES.includes(status as (typeof PLUGIN_STATUSES)[number])) {
    return NextResponse.json({ error: "插件状态无效。" }, { status: 400 });
  }

  try {
    const plugins = await prisma.plugin.findMany({
      where: status ? { status } : undefined,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    });
    const filtered = search
      ? plugins.filter(plugin => [
          plugin.packageName,
          plugin.displayName,
          plugin.summary,
          plugin.description || "",
          plugin.categoriesJson,
          plugin.keywordsJson,
        ].some(value => value.toLocaleLowerCase().includes(search)))
      : plugins;
    const total = filtered.length;
    const start = (page - 1) * limit;
    return NextResponse.json({
      data: filtered.slice(start, start + limit).map(serializePlugin),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("List plugins error:", error);
    return NextResponse.json({ error: "获取插件列表失败。" }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const denied = await requireAdminAccess(request.headers.get("authorization") ?? "", PLUGIN_ADMIN_PERMISSION);
  if (denied) return denied;

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
    const plugin = await prisma.plugin.create({ data: pluginData(parsed.data) });
    return NextResponse.json(serializePlugin(plugin), { status: 201 });
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "该 npm 包已经存在。" }, { status: 409 });
    }
    console.error("Create plugin error:", error);
    return NextResponse.json({ error: "创建插件失败。" }, { status: 500 });
  }
}
