/**
 * POST /api/collection-submissions
 * Accepts the club's member / enterprise / AI-project showcase submissions
 * (multipart form with optional avatar / companyLogo uploads). Mirrors the
 * original Express handler: type + required-field + consent validation, image
 * type/size checks, Prisma insert with nested asset creation.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/site/prisma";
import {
  collectionPayloadFromFormData,
  collectionRequiredFields,
  collectionDisplayFields,
  collectionTypes,
  rateLimit,
  removeUploadedAssets,
  saveUploadedAssets,
} from "@/lib/site/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLLECTION_WINDOW_MS = 15 * 60 * 1000;
const COLLECTION_MAX = 20;

function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  const ip = clientIp(request);
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
  //   - multipart/form-data (avatar / companyLogo uploads): parse text fields
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

    if (!collectionTypes.has(type)) {
      return NextResponse.json({ error: "请选择有效的征集类型。" }, { status: 400 });
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

    const phone = fields.phone(payload);
    const email = fields.email(payload);

    // Persist any uploaded avatar / companyLogo image(s) to disk first, so we
    // can reference the storage keys in the nested asset create.
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
      submission = await prisma.collectionSubmission.create({
        data: {
          type,
          status: "new",
          displayName,
          contact,
          phone: phone || undefined,
          email: email ? String(email) : undefined,
          payloadJson: JSON.stringify(payload),
          consent: true,
          consentAt: new Date(),
          ipAddress: ip === "unknown" ? undefined : ip,
          assets: savedAssets.length ? { create: savedAssets } : undefined,
        },
        include: { assets: true },
      });
    } catch (dbError) {
      // DB write failed: remove any files we already stored so rejected
      // submissions leave no orphaned uploads behind.
      await removeUploadedAssets(savedAssets);
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
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Collection submission error:", error);
    return NextResponse.json(
      { error: "提交失败，请稍后重试。" },
      { status: 500 }
    );
  }
}
