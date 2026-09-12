import { NextResponse } from "next/server";
import { updateProfileInfo, getLogtoContext } from "@/lib/logto";
import { ProfileDetailsUpdateSchema } from "@/lib/schemas";
import { logger } from "@/lib/logger";

export async function PATCH(request: Request) {
  try {
    const { isAuthenticated } = await getLogtoContext();

    if (!isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    // Zod 验证
    const parseResult = ProfileDetailsUpdateSchema.safeParse(body);
    if (!parseResult.success) {
      const errors = parseResult.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
      return NextResponse.json({ error: errors }, { status: 400 });
    }

    // 更新详细资料
    const result = await updateProfileInfo(parseResult.data);

    return NextResponse.json(result);
  } catch (error) {
    logger.error("Profile details update error:", error);

    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
