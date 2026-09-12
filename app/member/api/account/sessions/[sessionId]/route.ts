import { NextResponse } from "next/server";
import { revokeUserSession, getLogtoContext } from "@/lib/logto";
import { isFeatureEnabled } from "@/config/features";
import { logger } from "@/lib/logger";

/**
 * 撤销用户会话
 * DELETE /api/account/sessions/[sessionId]
 *
 * 使用 Logto v1.38+ Management API:
 * DELETE /api/users/{userId}/sessions/{sessionId}
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
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

    const { sessionId } = await params;

    logger.info(`Revoking session: ${sessionId}`);

    await revokeUserSession(sessionId);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    logger.error("Revoke session error:", error);

    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
