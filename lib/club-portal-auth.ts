import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

import { ActivityError, type ActivityActor } from "@/lib/club-activities";

export type PortalTokenActor = ActivityActor & { scopes: string[] };

let remoteKeys: { issuer: string; verifier: JWTVerifyGetKey } | undefined;

/** Logto's service root and token issuer are different URLs. */
export function logtoIssuer(): string {
  const endpoint = process.env.LOGTO_ENDPOINT?.trim().replace(/\/+$/, "");
  if (!endpoint) throw new ActivityError(503, "AUTH_NOT_CONFIGURED", "登录服务尚未配置。");
  try {
    const url = new URL(endpoint);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error("Invalid issuer URL");
    }
  } catch {
    throw new ActivityError(503, "AUTH_NOT_CONFIGURED", "登录服务配置无效。");
  }
  return endpoint.endsWith("/oidc") ? endpoint : `${endpoint}/oidc`;
}

function keys(issuer: string): JWTVerifyGetKey {
  if (remoteKeys?.issuer !== issuer) {
    remoteKeys = { issuer, verifier: createRemoteJWKSet(new URL(`${issuer}/jwks`)) };
  }
  return remoteKeys.verifier;
}

export function tokenScopes(value: unknown): string[] {
  if (typeof value === "string") return value.split(/\s+/).filter(Boolean);
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return [];
}

export function identityDisplayName(claims: Record<string, unknown>): string | undefined {
  for (const key of ["name", "username", "preferred_username"]) {
    const value = claims[key];
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 100);
  }
  return undefined;
}

/** Verify an access token for the caller's explicit resource, never an ID token. */
export async function verifyPortalBearer(token: string, audience: string): Promise<PortalTokenActor> {
  const issuer = logtoIssuer();
  const verifier = keys(issuer);
  try {
    const { payload } = await jwtVerify(token, verifier, {
      issuer,
      audience,
      requiredClaims: ["exp", "sub"],
      clockTolerance: 5,
    });
    if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp) || typeof payload.sub !== "string" || !payload.sub) {
      throw new Error("Missing identity claims");
    }
    return {
      issuer,
      sub: payload.sub,
      displayName: identityDisplayName(payload),
      scopes: tokenScopes(payload.scope),
    };
  } catch {
    // Do not expose signature, issuer, key lookup, or individual claim failures.
    throw new ActivityError(401, "INVALID_TOKEN", "登录已失效，请重新登录。");
  }
}
