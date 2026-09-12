import { NextResponse } from "next/server";
import { getUserLoginHistory, getUserActiveSessions, getLogtoContext } from "@/lib/logto";
import { isFeatureEnabled } from "@/config/features";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { isAuthenticated } = await getLogtoContext();

    if (!isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 检查功能是否启用
    if (!isFeatureEnabled("sessions")) {
      return NextResponse.json(
        { error: "会话管理功能未启用" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    // type=active: 返回活跃会话列表（用于会话管理模块）
    if (type === "active") {
      const sessions = await getUserActiveSessions();
      return NextResponse.json(sessions);
    }

    // 默认: 返回用户登录记录
    const sessions = await getUserLoginHistory();
    return NextResponse.json(sessions);
  } catch (error) {
    logger.error("Get sessions error:", error);

    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
