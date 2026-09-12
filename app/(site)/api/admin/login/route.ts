/**
 * POST /api/admin/login
 * Admin dashboard login. Credentials come from the ADMIN_USERNAME /
 * ADMIN_PASSWORD environment variables. Issues a random 32-hex session token
 * held in an in-memory Map (expires after 8h, exactly like the Express app).
 */
import { NextResponse } from "next/server";
import {
  adminLoginValid,
  createAdminSession,
  isAdminConfigured,
  rateLimit,
} from "@/lib/site/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX = 10;

function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  const ip = clientIp(request);
  if (!rateLimit("adminLogin", ip, LOGIN_MAX, LOGIN_WINDOW_MS)) {
    return NextResponse.json(
      { error: "登录尝试过于频繁，请稍后再试。" },
      { status: 429 }
    );
  }

  if (!isAdminConfigured()) {
    return NextResponse.json(
      { error: "管理员账号尚未配置。" },
      { status: 503 }
    );
  }

  let body: { username?: unknown; password?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  if (!adminLoginValid(body.username, body.password)) {
    return NextResponse.json({ error: "账号或密码错误！" }, { status: 401 });
  }

  const token = createAdminSession();
  if (!token) {
    return NextResponse.json(
      { error: "管理员账号尚未配置。" },
      { status: 503 }
    );
  }

  const response = NextResponse.json({ token, expiresIn: 8 * 60 * 60 });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
