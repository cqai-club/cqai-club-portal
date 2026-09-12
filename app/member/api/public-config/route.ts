import { NextResponse } from "next/server";
import { getPublicRuntimeConfig } from "@/lib/config/runtime-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = getPublicRuntimeConfig();

  return NextResponse.json(config, {
    headers: {
      ETag: `\"${config.configHash}\"`,
      "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
    },
  });
}
