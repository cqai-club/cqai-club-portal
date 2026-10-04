import { NextResponse } from "next/server";
import { requireInnovationMember } from "@/lib/member/innovation-access";
import { MemberSessionError } from "@/lib/member/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie, Authorization" };

export async function GET(request: Request) {
  try {
    await requireInnovationMember(request);
    return NextResponse.json({ innovationMember: true }, { headers });
  } catch (error) {
    if (error instanceof MemberSessionError && [401, 403].includes(error.status)) {
      return NextResponse.json({ innovationMember: false }, { headers });
    }
    return NextResponse.json({ error: "会员身份暂时无法验证。" }, { status: 503, headers });
  }
}
