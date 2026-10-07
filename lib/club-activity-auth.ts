import { ActivityError, type ActivityActor } from "@/lib/club-activities";
import { identityDisplayName, logtoIssuer, tokenScopes, verifyPortalBearer } from "@/lib/club-portal-auth";
import { getLogtoContext } from "@/lib/logto";
import { CQAI_API_RESOURCE } from "@/lib/logto/config";

export const ACTIVITY_PUBLISH_PERMISSION = "activity:publish";

async function bearerActor(token: string, manage: boolean): Promise<ActivityActor> {
  const actor = await verifyPortalBearer(token, CQAI_API_RESOURCE);
  if (manage && !actor.scopes.includes(ACTIVITY_PUBLISH_PERMISSION)) {
    throw new ActivityError(403, "ACTIVITY_PERMISSION_REQUIRED", "没有活动管理权限。");
  }
  return { issuer: actor.issuer, sub: actor.sub, displayName: actor.displayName };
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
  if (options.manage && !tokenScopes(session.scopes).includes(ACTIVITY_PUBLISH_PERMISSION)) {
    throw new ActivityError(403, "ACTIVITY_PERMISSION_REQUIRED", "没有活动管理权限。");
  }
  return {
    issuer: logtoIssuer(),
    sub: session.claims.sub,
    displayName: identityDisplayName(session.claims as Record<string, unknown>),
  };
}

export async function canManageActivities(): Promise<boolean> {
  try {
    const session = await getLogtoContext(CQAI_API_RESOURCE);
    return session.isAuthenticated && tokenScopes(session.scopes).includes(ACTIVITY_PUBLISH_PERMISSION);
  } catch {
    return false;
  }
}
