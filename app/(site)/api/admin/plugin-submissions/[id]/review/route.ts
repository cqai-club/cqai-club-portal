import { NextResponse } from "next/server";

import { ActivityError, type ActivityActor } from "@/lib/club-activities";
import { assertSameOrigin } from "@/lib/club-activity-auth";
import { getProjectReviewActor, PLUGIN_ADMIN_PERMISSION } from "@/lib/member/permissions";
import { PluginSubmissionError, reviewPluginSubmission } from "@/lib/plugin-submissions";
import { requireAdminAccess } from "@/lib/site/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  const authorization = request.headers.get("authorization") ?? "";
  const denied = await requireAdminAccess(authorization, PLUGIN_ADMIN_PERMISSION);
  if (denied) return denied;

  try {
    assertSameOrigin(request);
    const reviewerSub = await getProjectReviewActor(authorization);
    if (!reviewerSub) throw new PluginSubmissionError(401, "LOGIN_REQUIRED", "请先登录会员中心。");
    const endpoint = process.env.LOGTO_ENDPOINT?.trim().replace(/\/+$/, "") ?? "";
    const reviewer: ActivityActor = {
      issuer: reviewerSub === "ci-super-admin" ? "ci" : endpoint.endsWith("/oidc") ? endpoint : `${endpoint}/oidc`,
      sub: reviewerSub,
    };

    const bodyText = await request.text();
    if (bodyText.length > 2_000) throw new PluginSubmissionError(413, "BODY_TOO_LARGE", "审核备注过长。");
    let body: unknown;
    try { body = JSON.parse(bodyText); } catch { throw new PluginSubmissionError(400, "INVALID_JSON", "请求内容不是有效 JSON。"); }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new PluginSubmissionError(400, "INVALID_REVIEW", "审核数据无效。");
    }
    const { decision, note } = body as Record<string, unknown>;
    if (decision !== "approve" && decision !== "reject") {
      throw new PluginSubmissionError(400, "INVALID_REVIEW", "审核结果无效。");
    }
    if (note !== undefined && typeof note !== "string") {
      throw new PluginSubmissionError(400, "INVALID_REVIEW", "审核备注无效。");
    }
    const cleanNote = typeof note === "string" ? note.trim() : "";
    if (cleanNote.length > 1_000 || /[\u0000-\u001f\u007f-\u009f]/u.test(cleanNote)) {
      throw new PluginSubmissionError(400, "INVALID_REVIEW", "审核备注包含不支持的字符或超过 1000 字。");
    }
    if (decision === "reject" && !cleanNote) {
      throw new PluginSubmissionError(400, "REVIEW_NOTE_REQUIRED", "退回投稿时请填写原因。");
    }
    const { id } = await context.params;
    return NextResponse.json(await reviewPluginSubmission(id, decision, cleanNote, reviewer), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof PluginSubmissionError || error instanceof ActivityError) {
      return NextResponse.json({ code: error.code, error: error.message }, { status: error.status });
    }
    console.error("Review plugin submission error:", error);
    return NextResponse.json({ error: "审核插件投稿失败。" }, { status: 500 });
  }
}
