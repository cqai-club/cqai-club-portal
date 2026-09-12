import { NextResponse } from "next/server";
import { prisma } from "@/lib/site/prisma";
import {
  decodePluginCursor,
  encodePluginCursor,
  getPublicOrigin,
  toCatalogItem,
} from "@/lib/plugin-market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LIMIT = 50;

function textFields(plugin: { packageName: string; displayName: string; summary: string; description: string | null; keywordsJson: string }): string {
  return [plugin.packageName, plugin.displayName, plugin.summary, plugin.description || "", plugin.keywordsJson]
    .join(" ")
    .toLocaleLowerCase();
}

export async function GET(request: Request): Promise<NextResponse> {
  let origin: string;
  try {
    origin = getPublicOrigin();
  } catch (error) {
    console.error("Plugin catalog origin error:", error);
    return NextResponse.json({ error: "插件目录尚未配置正式 HTTPS 域名。" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const rawLimit = searchParams.get("limit");
  const limit = rawLimit === null ? MAX_LIMIT : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    return NextResponse.json({ error: "limit 必须是 1 到 50 之间的整数。" }, { status: 400 });
  }

  let cursor;
  try {
    cursor = decodePluginCursor(searchParams.get("cursor"));
    if (cursor && Number.isNaN(Date.parse(cursor.updatedAt))) throw new Error("cursor 无效。");
  } catch {
    return NextResponse.json({ error: "cursor 无效。" }, { status: 400 });
  }

  try {
    const q = (searchParams.get("q") || "").trim().toLocaleLowerCase();
    const categories = searchParams.getAll("category").map(value => value.trim()).filter(Boolean);
    const plugins = await prisma.plugin.findMany({
      where: { status: "published" },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    });
    const filtered = plugins.filter(plugin => {
      if (q && !textFields(plugin).includes(q)) return false;
      if (categories.length) {
        let pluginCategories: string[] = [];
        try {
          const parsed: unknown = JSON.parse(plugin.categoriesJson);
          if (Array.isArray(parsed)) pluginCategories = parsed.filter((item): item is string => typeof item === "string");
        } catch {
          pluginCategories = [];
        }
        if (!categories.some(category => pluginCategories.includes(category))) return false;
      }
      if (cursor) {
        const updatedAt = plugin.updatedAt.toISOString();
        if (updatedAt > cursor.updatedAt || (updatedAt === cursor.updatedAt && plugin.id >= cursor.id)) return false;
      }
      return true;
    });

    const hasMore = filtered.length > limit;
    const pageItems = filtered.slice(0, limit);
    const last = pageItems[pageItems.length - 1];
    return NextResponse.json({
      schemaVersion: "1.0.0",
      generatedAt: new Date().toISOString(),
      items: pageItems.map(plugin => toCatalogItem(plugin, origin)),
      page: {
        ...(hasMore && last ? { nextCursor: encodePluginCursor({ updatedAt: last.updatedAt.toISOString(), id: last.id }) } : {}),
        total: filtered.length,
      },
    }, {
      headers: {
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("Read plugin catalog error:", error);
    return NextResponse.json({ error: "读取插件目录失败。" }, { status: 500 });
  }
}
