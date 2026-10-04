import { NextResponse } from "next/server";
import { assertMemberOrigin, MemberSessionError } from "@/lib/member/session";
import { requireInnovationMember } from "./innovation-access";
import { prisma } from "@/lib/site/prisma";
import { parseProjectSubmissionInput } from "@/lib/project-market";
import type { MemberProjectSubmission } from "./project-submission-types";
import {
  collectionPayloadFromFormData,
  collectionRequiredFields,
  collectionDisplayFields,
  rateLimit,
  removeUploadedAssets,
  saveUploadedAssets,
  trustedClientIp,
} from "@/lib/site/api-helpers";

const COLLECTION_WINDOW_MS = 15 * 60 * 1000;
const COLLECTION_MAX = 20;

export const memberSubmissionSelect = {
  id: true, type: true, displayName: true, payloadJson: true, status: true,
  createdAt: true, updatedAt: true,
  assets: { where: { kind: "projectCover" }, take: 1, select: { id: true } },
  importedProject: { select: { status: true, slug: true, updatedAt: true } },
} as const;

export function serializeMemberSubmission(submission: {
  id: string; displayName: string; payloadJson: string; status: string;
  createdAt: Date; updatedAt: Date;
  assets: { id: string }[];
  importedProject: { status: string; slug: string; updatedAt: Date } | null;
}): MemberProjectSubmission {
  let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(submission.payloadJson) ?? {}; } catch { /* Display fallback for historical data. */ }
  const text = (key: string) => typeof payload[key] === "string" ? payload[key] as string : "";
  const project = submission.importedProject;
  return {
    id: submission.id,
    name: text("projectName") || submission.displayName,
    summary: text("oneLine"),
    coverUrl: submission.assets.length ? `/member/api/project-submissions/${encodeURIComponent(submission.id)}/cover?v=${submission.updatedAt.getTime()}` : null,
    stage: text("stage"),
    reviewStatus: submission.status,
    editable: submission.status === "new" && !project,
    publicationStatus: project?.status ?? null,
    publicUrl: project?.status === "published" ? `/projects/${encodeURIComponent(project.slug)}/` : null,
    createdAt: submission.createdAt.toISOString(),
    updatedAt: new Date(Math.max(submission.updatedAt.getTime(), project?.updatedAt.getTime() ?? 0)).toISOString(),
  };
}

export async function listMemberProjects(request: Request): Promise<NextResponse> {
  try {
    const identity = await requireInnovationMember(request);
    const submissions = await prisma.collectionSubmission.findMany({
      where: { ...identity, type: "project" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: memberSubmissionSelect,
    });
    return NextResponse.json({ data: submissions.map(serializeMemberSubmission) }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof MemberSessionError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: { "Cache-Control": "private, no-store" } });
    }
    console.error("List member project submissions error:", error);
    return NextResponse.json({ error: "读取项目状态失败，请稍后重试。" }, { status: 500, headers: { "Cache-Control": "private, no-store" } });
  }
}

async function writeMemberProject(request: Request, id?: string): Promise<NextResponse> {
  let identity;
  try {
    identity = await requireInnovationMember(request);
    assertMemberOrigin(request);
  } catch (error) {
    if (error instanceof MemberSessionError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: { "Cache-Control": "private, no-store" } });
    }
    throw error;
  }
  const ip = trustedClientIp(request);
  if (!rateLimit("collection", ip, COLLECTION_MAX, COLLECTION_WINDOW_MS)) {
    return NextResponse.json(
      { error: "提交过于频繁，请稍后再试。" },
      { status: 429 }
    );
  }

  const contentType = request.headers.get("content-type") ?? "";
  const isMultipart = contentType.toLowerCase().includes("multipart/form-data");

  // Two transports are accepted, mirroring the original Express handler that
  // used multer for both file uploads and plain JSON/urlencoded submissions:
  //   - multipart/form-data (projectCover uploads): parse text fields
  //     from FormData and optionally save uploaded files.
  //   - application/json: pure text payload, no files.
  let formData: FormData;
  if (isMultipart) {
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: "提交数据无法解析。" }, { status: 400 });
    }
  } else {
    let json: Record<string, unknown>;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json({ error: "提交数据无法解析。" }, { status: 400 });
    }
    formData = new FormData();
    for (const [key, value] of Object.entries(json)) {
      if (typeof value === "string") formData.append(key, value);
    }
  }

  try {
    const { type, payload, consent } = collectionPayloadFromFormData(formData);
    const removeCover = formData.get("removeCover") === "true";
    delete payload.removeCover;
    delete payload.expectedUpdatedAt;

    const current = id ? await prisma.collectionSubmission.findFirst({
      where: { id, ...identity, type: "project" },
      select: { updatedAt: true, status: true, importedProject: { select: { id: true } } },
    }) : null;
    if (id) {
      if (!current) return NextResponse.json({ error: "未找到这个项目。" }, { status: 404 });
      if (current.status !== "new" || current.importedProject) {
        return NextResponse.json({ error: "仅待审核的项目可以编辑，请关闭抽屉并刷新项目状态。" }, { status: 409 });
      }
      const expectedUpdatedAt = formData.get("expectedUpdatedAt");
      if (typeof expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(expectedUpdatedAt))) {
        return NextResponse.json({ error: "请重新打开项目编辑抽屉后保存。" }, { status: 400 });
      }
      if (current.updatedAt.getTime() !== Date.parse(expectedUpdatedAt)) {
        return NextResponse.json({ error: "项目已被更新，请关闭抽屉后重新打开再编辑。" }, { status: 409 });
      }
    }

    if (type !== "project") {
      return NextResponse.json({ error: "会员中心仅接受 AI 项目征集。" }, { status: 400 });
    }

    const requiredFields = collectionRequiredFields[type] ?? [];
    const missingField = requiredFields.find(
      field => typeof payload[field] !== "string" || !String(payload[field] ?? "").trim()
    );
    if (missingField) {
      return NextResponse.json({ error: "请补充所有必填信息。" }, { status: 400 });
    }

    if (!consent) {
      return NextResponse.json({ error: "请先同意授权说明。" }, { status: 400 });
    }

    const fields = collectionDisplayFields[type];
    const displayName = String(fields.displayName(payload) || "").trim();
    const contact = String(fields.contact(payload) || "").trim();
    if (!displayName || !contact) {
      return NextResponse.json(
        { error: "请补充姓名、企业名称或联系方式。" },
        { status: 400 }
      );
    }

    if (type === "project") {
      const projectInput = parseProjectSubmissionInput(payload, displayName, contact);
      if (!projectInput.success) {
        return NextResponse.json(
          { error: projectInput.error.issues[0]?.message ?? "项目资料字段无效。" },
          { status: 400 }
        );
      }
    }

    const phone = fields.phone(payload);
    const email = fields.email(payload);

    // Only project covers are accepted by this member-facing form.
    formData.delete("avatar");
    formData.delete("companyLogo");
    let savedAssets: Awaited<ReturnType<typeof saveUploadedAssets>>;
    try {
      savedAssets = await saveUploadedAssets(formData);
    } catch (uploadError) {
      const message =
        uploadError instanceof Error ? uploadError.message : "图片上传失败。";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    let submission;
    try {
      const data = {
          displayName,
          contact,
          phone: phone || null,
          email: email ? String(email) : null,
          payloadJson: JSON.stringify({ ...payload, ...identity }),
          consent: true,
          consentAt: new Date(),
      };
      if (id && current) {
        const result = await prisma.$transaction(async tx => {
          // Guard the write itself: a review or another edit may have happened
          // while the cover was being processed.
          const changed = await tx.collectionSubmission.updateMany({
            where: { id, ...identity, type: "project", status: "new", updatedAt: current.updatedAt, importedProject: { is: null } },
            data,
          });
          if (changed.count !== 1) throw new MemberSessionError(409, "PROJECT_CHANGED", "项目已被更新或开始审核，请关闭抽屉刷新状态后重试。");
          const removedAssets = savedAssets.length || removeCover
            ? await tx.submissionAsset.findMany({ where: { submissionId: id, kind: "projectCover" } })
            : [];
          if (removedAssets.length) await tx.submissionAsset.deleteMany({ where: { id: { in: removedAssets.map(asset => asset.id) } } });
          const updated = await tx.collectionSubmission.update({
            where: { id }, data: { assets: savedAssets.length ? { create: savedAssets } : undefined }, select: memberSubmissionSelect,
          });
          return { updated, removedAssets };
        });
        submission = result.updated;
        await removeUploadedAssets(result.removedAssets);
      } else {
        submission = await prisma.collectionSubmission.create({
          data: { ...data, ...identity, type, status: "new", ipAddress: ip === "unknown" ? undefined : ip,
            assets: savedAssets.length ? { create: savedAssets } : undefined },
          select: memberSubmissionSelect,
        });
      }
    } catch (dbError) {
      // DB write failed: remove any files we already stored so rejected
      // submissions leave no orphaned uploads behind.
      await removeUploadedAssets(savedAssets);
      if (dbError instanceof MemberSessionError) {
        return NextResponse.json({ error: dbError.message, code: dbError.code }, { status: dbError.status });
      }
      console.error("Collection submission error:", dbError);
      return NextResponse.json(
        { error: "提交失败，请稍后重试。" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        id: submission.id,
        type: submission.type,
        submission: serializeMemberSubmission(submission),
      },
      { status: id ? 200 : 201, headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    console.error("Collection submission error:", error);
    return NextResponse.json(
      { error: "提交失败，请稍后重试。" },
      { status: 500 }
    );
  }
}

export const submitMemberProject = (request: Request) => writeMemberProject(request);
export const updateMemberProject = (request: Request, id: string) => writeMemberProject(request, id);
