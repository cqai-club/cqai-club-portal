import { NextResponse } from "next/server";
import { getPublicOrigin } from "@/lib/plugin-market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): NextResponse {
  try {
    const origin = getPublicOrigin();
    return NextResponse.json({
      manifestVersion: "1.0.0",
      providerId: "org.cqai.club-portal",
      name: "CQAI Club Plugin Market",
      description: "重庆 AI 创享俱乐部维护的 DSH 插件目录。",
      homepage: `${origin}/`,
      attribution: {
        name: "重庆AI创享俱乐部",
        url: `${origin}/`,
        notice: "插件由各自发布者维护，目录不构成安全审计或兼容性保证。",
      },
      transport: {
        kind: "https-json",
        endpoint: `${origin}/v1/plugins`,
        method: "GET",
      },
      query: {
        supported: ["q", "category", "cursor", "limit"],
        defaultLimit: 50,
        maxLimit: 50,
        sorts: [],
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Build plugin catalog manifest error:", error);
    return NextResponse.json({ error: "插件目录尚未配置正式 HTTPS 域名。" }, { status: 503 });
  }
}
