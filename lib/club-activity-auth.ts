import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

import { ActivityError, type ActivityActor } from "@/lib/club-activities";
import { getLogtoContext } from "@/lib/logto";
import { CQAI_API_RESOURCE } from "@/lib/logto/config";

export const ACTIVITY_PUBLISH_PERMISSION = "activity:publish";

let remoteKeys: JWTVerifyGetKey | undefined;

function issuer(): string {
  const endpoint = process.env.LOGTO_ENDPOINT?.trim().replace(/\/+$/, "");
  if (!endpoint) throw new ActivityError(503, "AUTH_NOT_CONFIGURED", "登录服务尚未配置。");
  // @logto/next takes the service root; ID tokens and JWKS use its /oidc issuer.
  return endpoint.endsWith("/oidc") ? endpoint : `${endpoint}/oidc`;
}

function keys(): JWTVerifyGetKey {
  remoteKeys ??= createRemoteJWKSet(new URL(`${issuer()}/jwks`));
  return remoteKeys;
}

function scopes(value: unknown): string[] {
  if (typeof value === "string") return value.split(/\s+/).filter(Boolean);
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return [];
}

function displayName(claims: Record<string, unknown>): string | undefined {
  for (const key of ["name", "username", "preferred_username"]) {
    const value = claims[key];
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 100);
  }
  return undefined;
}

async function bearerActor(token: string, manage: boolean): Promise<ActivityActor> {
  const verifier = keys();
  let payload;
  try {
    const verified = await jwtVerify(token, verifier, {
      issuer: issuer(),
      audience: CQAI_API_RESOURCE,
      clockTolerance: 5,
    });
    payload = verified.payload;
  } catch {
    throw new ActivityError(401, "INVALID_TOKEN", "登录已失效，请重新登录。");
  }
  if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp) || typeof payload.sub !== "string" || !payload.sub) {
    throw new ActivityError(401, "INVALID_TOKEN", "登录令牌缺少必要身份信息。");
  }
  if (manage && !scopes(payload.scope).includes(ACTIVITY_PUBLISH_PERMISSION)) {
    throw new ActivityError(403, "ACTIVITY_PERMISSION_REQUIRED", "没有活动管理权限。");
  }
  return { issuer: issuer(), sub: payload.sub, displayName: displayName(payload) };
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) throw new ActivityError(403, "INVALID_ORIGIN", "请求缺少来源信息。");
  const allowed = new Set([new URL(request.url).origin]);
  for (const value of [process.env.BASE_URL_PROD, process.env.BASE_URL_DEV]) {
    if (!value) continue;
    try { allowed.add(new URL(value).origin); } catch { /* Runtime configuration validation reports invalid URLs. */ }
  }
  if (!allowed.has(origin)) throw new ActivityError(403, "INVALID_ORIGIN", "请求来源不受信任。");
}

/** Authenticate either a same-origin Logto browser session or a portal-audience JWT. */
export async function activityActor(
  request: Request,
  options: { manage?: boolean; write?: boolean } = {},
): Promise<ActivityActor> {
  const authorization = request.headers.get("authorization");
  if (authorization !== null) {
    const match = /^Bearer ([^\s]+)$/i.exec(authorization);
    if (!match) throw new ActivityError(401, "INVALID_TOKEN", "登录令牌格式无效。");
    return bearerActor(match[1], options.manage === true);
  }

  if (options.write) assertSameOrigin(request);
  let session;
  try {
    session = await getLogtoContext(options.manage ? CQAI_API_RESOURCE : undefined);
  } catch {
    throw new ActivityError(401, "LOGIN_REQUIRED", "请先登录会员中心。");
  }
  if (!session.isAuthenticated || typeof session.claims?.sub !== "string" || !session.claims.sub) {
    throw new ActivityError(401, "LOGIN_REQUIRED", "请先登录会员中心。");
  }
  if (options.manage && !scopes(session.scopes).includes(ACTIVITY_PUBLISH_PERMISSION)) {
    throw new ActivityError(403, "ACTIVITY_PERMISSION_REQUIRED", "没有活动管理权限。");
  }
  return {
    issuer: issuer(),
    sub: session.claims.sub,
    displayName: displayName(session.claims as Record<string, unknown>),
  };
}

export async function canManageActivities(): Promise<boolean> {
  try {
    const session = await getLogtoContext(CQAI_API_RESOURCE);
    return session.isAuthenticated && scopes(session.scopes).includes(ACTIVITY_PUBLISH_PERMISSION);
  } catch {
    return false;
  }
}
