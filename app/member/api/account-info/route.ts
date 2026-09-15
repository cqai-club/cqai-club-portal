import { NextResponse } from "next/server";
import { getAccountInfo, getLogtoContext, LogtoApiError } from "@/lib/logto";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { isAuthenticated } = await getLogtoContext();

    if (!isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const accountInfo = await getAccountInfo();
    return NextResponse.json(accountInfo);
  } catch (error) {
    if (error instanceof LogtoApiError && error.statusCode === 401) {
      logger.warn("Account API rejected the current member session as unauthorized");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof LogtoApiError && error.statusCode === 403) {
      logger.warn("Account API access forbidden for the current member session");
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    logger.error("Failed to get account info:", error);

    return NextResponse.json(
      { error: "Failed to fetch account info" },
      { status: 500 }
    );
  }
}
