import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "@/lib/site/prisma";
import { COLLECTION_UPLOAD_DIR, detectImageMimeType } from "@/lib/site/api-helpers";
import { MemberSessionError } from "./session";
import { requireInnovationMember } from "./innovation-access";
import type { MemberProjectSubmissionDetail } from "./project-submission-types";

const privateHeaders = { "Cache-Control": "private, no-store" };

export async function getMemberProjectDetail(request: Request, id: string): Promise<NextResponse> {
  try {
    const identity = await requireInnovationMember(request);
    const submission = await prisma.collectionSubmission.findFirst({
      where: { id, ...identity, type: "project" },
      select: { id: true, status: true, payloadJson: true, consent: true, updatedAt: true,
        importedProject: { select: { id: true } }, assets: { where: { kind: "projectCover" }, take: 1 } },
    });
    if (!submission) return NextResponse.json({ error: "未找到这个项目。" }, { status: 404, headers: privateHeaders });
    if (submission.status !== "new" || submission.importedProject) {
      return NextResponse.json({ error: "仅待审核的项目可以编辑，请刷新项目状态。" }, { status: 409, headers: privateHeaders });
    }
    const payload = JSON.parse(submission.payloadJson) ?? {};
    const keys = ["projectName", "owner", "oneLine", "stage", "projectFocus", "demoUrl", "projectContact", "projectBio", "needs"] as const;
    const cover = submission.assets[0];
    const detail: MemberProjectSubmissionDetail = {
      id: submission.id,
      updatedAt: submission.updatedAt.toISOString(),
      fields: Object.fromEntries(keys.map(key => [key, typeof payload[key] === "string" ? payload[key] : ""])) as MemberProjectSubmissionDetail["fields"],
      consent: submission.consent,
      coverUrl: cover ? `/member/api/project-submissions/${encodeURIComponent(id)}/cover?v=${submission.updatedAt.getTime()}` : null,
      coverName: cover?.originalName ?? null,
    };
    return NextResponse.json(detail, { headers: privateHeaders });
  } catch (error) {
    if (error instanceof MemberSessionError) return NextResponse.json({ error: error.message }, { status: error.status, headers: privateHeaders });
    console.error("Read member project detail error:", error);
    return NextResponse.json({ error: "读取项目资料失败，请稍后重试。" }, { status: 500, headers: privateHeaders });
  }
}

export async function getMemberProjectCover(request: Request, id: string): Promise<NextResponse> {
  try {
    const identity = await requireInnovationMember(request);
    const asset = await prisma.submissionAsset.findFirst({ where: { kind: "projectCover", submission: { id, ...identity, type: "project" } } });
    if (!asset) return NextResponse.json({ error: "未找到项目封面。" }, { status: 404, headers: privateHeaders });
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(asset.storageKey) || !["image/jpeg", "image/png"].includes(asset.mimeType)) {
      return NextResponse.json({ error: "封面存储信息无效。" }, { status: 422, headers: privateHeaders });
    }
    let buffer: Buffer;
    try { buffer = await readFile(join(COLLECTION_UPLOAD_DIR, asset.storageKey)); } catch {
      return NextResponse.json({ error: "未找到项目封面文件。" }, { status: 404, headers: privateHeaders });
    }
    if (detectImageMimeType(buffer) !== asset.mimeType) return NextResponse.json({ error: "封面格式无效。" }, { status: 422, headers: privateHeaders });
    return new NextResponse(new Uint8Array(buffer), { headers: { ...privateHeaders, "Content-Type": asset.mimeType, "Content-Length": String(buffer.length), "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    if (error instanceof MemberSessionError) return NextResponse.json({ error: error.message }, { status: error.status, headers: privateHeaders });
    console.error("Read member project cover error:", error);
    return NextResponse.json({ error: "读取项目封面失败。" }, { status: 500, headers: privateHeaders });
  }
}
