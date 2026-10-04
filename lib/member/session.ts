import { timingSafeEqual } from "node:crypto";
import { getLogtoContext, logtoConfig } from "@/lib/logto";

export interface MemberIdentity {
  userIssuer: string;
  userSub: string;
}

export class MemberSessionError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

function equalToken(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export async function memberIdentity(request: Request): Promise<MemberIdentity> {
  // Matches the existing isolated CI harness. Production requests cannot
  // enable this seam: every guard and server-provided per-run secret is needed.
  if (process.env.CI === "true" && process.env.CQAI_CI_AUTH_BYPASS === "enabled-for-smoke-tests") {
    const authorization = request.headers.get("authorization") || "";
    for (const [token, userSub] of [
      [process.env.CQAI_CI_AUTHENTICATED_TOKEN, "ci-member"],
      [process.env.CQAI_CI_EDITOR_TOKEN, "ci-editor"],
      [process.env.CQAI_CI_ADMIN_TOKEN, "ci-super-admin"],
    ] as const) {
      if (token && equalToken(authorization, `Bearer ${token}`)) {
        return { userIssuer: "ci", userSub };
      }
    }
  }

  let context;
  try {
    context = await getLogtoContext();
  } catch {
    throw new MemberSessionError(401, "UNAUTHORIZED", "请先登录会员中心。");
  }
  if (!context.isAuthenticated || typeof context.claims?.sub !== "string" || !context.claims.sub) {
    throw new MemberSessionError(401, "UNAUTHORIZED", "请先登录会员中心。");
  }
  const endpoint = logtoConfig.endpoint.replace(/\/+$/, "");
  return {
    userIssuer: endpoint.endsWith("/oidc") ? endpoint : `${endpoint}/oidc`,
    userSub: context.claims.sub,
  };
}

export function assertMemberOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const allowed = new Set([new URL(request.url).origin]);
  for (const configuredUrl of [process.env.BASE_URL_PROD, process.env.BASE_URL_DEV]) {
    if (!configuredUrl) continue;
    try { allowed.add(new URL(configuredUrl).origin); } catch { /* Runtime validation reports malformed configuration. */ }
  }
  if (!origin || !allowed.has(origin)) {
    throw new MemberSessionError(403, "INVALID_ORIGIN", "请求来源不受信任，请刷新页面后重试。");
  }
}
