import { NextResponse } from "next/server";
import { getAccessTokenRSC, logtoConfig } from "@/lib/logto";
import {
  MfaVerificationHeaderSchema,
  MfaVerificationPathSchema,
  MfaVerificationRenameSchema,
} from "@/lib/schemas";
import { logger } from "@/lib/logger";

/**
 * 删除 MFA 验证器
 * DELETE /api/account/mfa/[verificationId]
 * 
 * Headers: logto-verification-id (通过密码验证获取)
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ verificationId: string }> }
) {
  try {
    const accessToken = await getAccessTokenRSC();

    if (!accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const pathResult = MfaVerificationPathSchema.safeParse(await params);
    const headerResult = MfaVerificationHeaderSchema.safeParse({
      verificationRecordId: request.headers.get("logto-verification-id"),
    });

    if (!pathResult.success || !headerResult.success) {
      return NextResponse.json({ error: "缺少或无效的验证参数" }, { status: 400 });
    }

    const { verificationId } = pathResult.data;
    const { verificationRecordId } = headerResult.data;

    const res = await fetch(
      `${logtoConfig.endpoint}/api/my-account/mfa-verifications/${verificationId}`,
      {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "logto-verification-id": verificationRecordId,
        },
      }
    );

    if (!res.ok) {
      const errorText = await res.text().catch(() => "Unknown error");
      logger.warn("Delete MFA verification upstream failed", {
        status: res.status,
        errorText,
      });
      return NextResponse.json(
        { error: `删除 MFA 验证器失败: ${res.status}` },
        { status: res.status }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Delete MFA verification route error", error);
    return NextResponse.json(
      { error: "删除 MFA 验证器失败" },
      { status: 500 }
    );
  }
}

/**
 * 更新 MFA 验证器名称（仅 WebAuthn）
 * PATCH /api/account/mfa/[verificationId]
 * 
 * Body: { name: string }
 * Headers: logto-verification-id
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ verificationId: string }> }
) {
  try {
    const accessToken = await getAccessTokenRSC();

    if (!accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const pathResult = MfaVerificationPathSchema.safeParse(await params);
    const headerResult = MfaVerificationHeaderSchema.safeParse({
      verificationRecordId: request.headers.get("logto-verification-id"),
    });
    const bodyResult = MfaVerificationRenameSchema.safeParse(await request.json().catch(() => ({})));

    if (!pathResult.success || !headerResult.success || !bodyResult.success) {
      return NextResponse.json({ error: "缺少或无效的请求参数" }, { status: 400 });
    }

    const { verificationId } = pathResult.data;
    const { verificationRecordId } = headerResult.data;
    const { name } = bodyResult.data;

    const res = await fetch(
      `${logtoConfig.endpoint}/api/my-account/mfa-verifications/${verificationId}/name`,
      {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "logto-verification-id": verificationRecordId,
          "content-type": "application/json",
        },
        body: JSON.stringify({ name }),
      }
    );

    if (!res.ok) {
      const errorText = await res.text().catch(() => "Unknown error");
      logger.warn("Update MFA name upstream failed", {
        status: res.status,
        errorText,
      });
      return NextResponse.json(
        { error: `更新名称失败: ${res.status}` },
        { status: res.status }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Update MFA name route error", error);
    return NextResponse.json(
      { error: "更新名称失败" },
      { status: 500 }
    );
  }
}
