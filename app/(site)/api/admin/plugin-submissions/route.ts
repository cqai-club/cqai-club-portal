import { NextResponse } from "next/server";

import { PLUGIN_ADMIN_PERMISSION } from "@/lib/member/permissions";
import { listPluginSubmissions, PLUGIN_SUBMISSION_STATUSES, type PluginSubmissionStatus } from "@/lib/plugin-submissions";
import { requireAdminAccess } from "@/lib/site/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const denied = await requireAdminAccess(request.headers.get("authorization") ?? "", PLUGIN_ADMIN_PERMISSION);
  if (denied) return denied;

  const params = new URL(request.url).searchParams;
  const status = params.get("status") ?? "pending";
  if (status !== "all" && !PLUGIN_SUBMISSION_STATUSES.includes(status as PluginSubmissionStatus)) {
    return NextResponse.json({ error: "投稿状态无效。" }, { status: 400 });
  }
  const page = Number(params.get("page") ?? "1");
  const limit = Number(params.get("limit") ?? "20");
  if (!Number.isSafeInteger(page) || page < 1 || page > 1_000_000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    return NextResponse.json({ error: "分页参数无效。" }, { status: 400 });
  }

  try {
    return NextResponse.json(await listPluginSubmissions(status as PluginSubmissionStatus | "all", page, limit), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("List plugin submissions error:", error);
    return NextResponse.json({ error: "读取插件投稿失败。" }, { status: 500 });
  }
}
