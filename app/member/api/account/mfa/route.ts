import { NextResponse } from "next/server";
import { getMfaVerifications, getLogtoContext } from "@/lib/logto";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * 获取用户 MFA 验证器列表
 * GET /api/account/mfa
 */
export async function GET() {
  try {
    const { isAuthenticated } = await getLogtoContext();

    if (!isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const data = await getMfaVerifications();
    return NextResponse.json(data);
  } catch (error) {
    logger.error("Get MFA verifications error:", error);

    return NextResponse.json(
      { error: "获取 MFA 设置失败" },
      { status: 500 }
    );
  }
}
