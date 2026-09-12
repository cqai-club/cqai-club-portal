import { NextResponse } from "next/server";
import { updateAccountInfo, getLogtoContext } from "@/lib/logto";
import { ProfileUpdateSchema } from "@/lib/schemas";
import { isFeatureEnabled } from "@/config/features";
import { logger } from "@/lib/logger";

export async function PATCH(request: Request) {
  try {
    const { isAuthenticated } = await getLogtoContext();

    if (!isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    // Zod 验证
    const parseResult = ProfileUpdateSchema.safeParse(body);
    if (!parseResult.success) {
      const errors = parseResult.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
      return NextResponse.json({ error: errors }, { status: 400 });
    }

    const data = parseResult.data;

    // 检查功能开关
    if (data.username !== undefined && !isFeatureEnabled("usernameChange")) {
      return NextResponse.json({ error: "用户名修改功能未启用" }, { status: 403 });
    }

    // 更新基础账户信息
    const result = await updateAccountInfo(data);

    return NextResponse.json(result);
  } catch (error) {
    logger.error("Profile update error:", error);

    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
