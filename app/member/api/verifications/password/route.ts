import { NextResponse } from "next/server";
import { getAccessTokenRSC, logtoConfig } from "@/lib/logto";
import { PasswordVerificationSchema } from "@/lib/schemas";
import { logger } from "@/lib/logger";

/**
 * 验证用户密码，获取验证记录 ID
 * POST /api/verifications/password
 * 
 * Body: { password: string }
 * 
 * 返回: { verificationRecordId: string, expiresAt: string }
 * 
 * 注意: 验证记录 ID 有效期为 10 分钟，用于敏感操作前的身份验证
 */
export async function POST(request: Request) {
  try {
    const accessToken = await getAccessTokenRSC();

    if (!accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const parseResult = PasswordVerificationSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json({ error: "缺少或无效的密码参数" }, { status: 400 });
    }

    const { password } = parseResult.data;

    const res = await fetch(
      `${logtoConfig.endpoint}/api/verifications/password`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ password }),
      }
    );

    if (!res.ok) {
      const errorText = await res.text().catch(() => "Unknown error");
      logger.warn("Password verification upstream failed", {
        status: res.status,
        errorText,
      });
      return NextResponse.json(
        { error: "密码验证失败" },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    logger.error("Password verification route error", error);
    return NextResponse.json(
      { error: "密码验证失败" },
      { status: 500 }
    );
  }
}
