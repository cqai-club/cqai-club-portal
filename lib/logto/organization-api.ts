import "server-only";
import { managementAPIConfig } from "./config";
import type { OrganizationUser, OrganizationUserPage } from "@/lib/member/organization-types";

export class OrganizationApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
let cached: { key: string; value: string; expiresAt: number } | undefined;
let tokenRequest: { key: string; promise: Promise<string> } | undefined;
const timeout = () => AbortSignal.timeout(15_000);

async function managementToken(): Promise<string> {
  const { clientId, clientSecret, logtoEndpoint } = managementAPIConfig;
  if (!clientId || !clientSecret || !logtoEndpoint) {
    throw new OrganizationApiError(503, "MANAGEMENT_UNAVAILABLE", "Logto Management API 尚未配置。");
  }
  const key = JSON.stringify([logtoEndpoint, clientId, clientSecret]);
  if (cached?.key === key && cached.expiresAt > Date.now()) return cached.value;
  if (tokenRequest?.key === key) return tokenRequest.promise;
  const promise = (async () => {
    try {
      const response = await fetch(`${logtoEndpoint.replace(/\/+$/, "")}/oidc/token`, {
        method: "POST", cache: "no-store", signal: timeout(),
        headers: { "Content-Type": "application/x-www-form-urlencoded", authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}` },
        body: new URLSearchParams({ grant_type: "client_credentials", resource: "https://default.logto.app/api", scope: "all" }),
      });
      if (!response.ok) throw new Error("token rejected");
      const token = await response.json();
      if (typeof token.access_token !== "string") throw new Error("token missing");
      cached = { key, value: token.access_token, expiresAt: Date.now() + Math.max(0, Math.min(Number(token.expires_in) || 0, 3600) - 30) * 1000 };
      return cached.value;
    } catch {
      throw new OrganizationApiError(503, "MANAGEMENT_UNAVAILABLE", "Logto 管理认证失败，请检查 M2M 凭据及管理权限。");
    }
  })();
  tokenRequest = { key, promise };
  try { return await promise; } finally { if (tokenRequest?.promise === promise) tokenRequest = undefined; }
}

async function api(path: string, body?: unknown, method: "GET" | "POST" | "DELETE" = body === undefined ? "GET" : "POST"): Promise<Response> {
  const token = await managementToken();
  let response: Response;
  try {
    response = await fetch(`${managementAPIConfig.logtoEndpoint.replace(/\/+$/, "")}${path}`, {
      method, cache: "no-store", signal: timeout(),
      headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new OrganizationApiError(503, "LOGTO_UNAVAILABLE", "Logto 暂时无法连接，请重试。");
  }
  if (!response.ok) {
    if (response.status === 401) cached = undefined;
    if (response.status === 404) throw new OrganizationApiError(404, "LOGTO_NOT_FOUND", "Logto 组织或用户不存在。");
    throw new OrganizationApiError(503, "LOGTO_REJECTED", "Logto 操作失败，请检查管理权限后重试。");
  }
  return response;
}
const part = (value: string) => encodeURIComponent(value);
function user(value: unknown): OrganizationUser {
  if (!value || typeof value !== "object" || !("id" in value) || typeof value.id !== "string") {
    throw new OrganizationApiError(503, "INVALID_LOGTO_RESPONSE", "Logto 用户数据无法读取。");
  }
  const row = value as Record<string, unknown>;
  const text = (key: string) => typeof row[key] === "string" ? row[key] as string : null;
  return { id: value.id, name: text("name"), username: text("username"), primaryEmail: text("primaryEmail"), primaryPhone: text("primaryPhone") };
}
export async function getOrganization(id: string): Promise<{ id: string; name: string }> {
  const value = await (await api(`/api/organizations/${part(id)}`)).json();
  if (value.id !== id || typeof value.name !== "string") throw new OrganizationApiError(503, "INVALID_LOGTO_RESPONSE", "Logto 组织数据无法读取。");
  return { id: value.id, name: value.name };
}
export async function getOrganizationUser(id: string): Promise<OrganizationUser> {
  const result = user(await (await api(`/api/users/${part(id)}`)).json());
  if (result.id !== id) throw new OrganizationApiError(503, "INVALID_LOGTO_RESPONSE", "Logto 用户数据不匹配。");
  return result;
}
export async function userOrganizations(id: string): Promise<{ id: string; name: string }[]> {
  const value = await (await api(`/api/users/${part(id)}/organizations`)).json();
  if (!Array.isArray(value) || value.some(item => !item || typeof item.id !== "string" || typeof item.name !== "string")) {
    throw new OrganizationApiError(503, "INVALID_LOGTO_RESPONSE", "Logto 组织成员关系无法读取。");
  }
  return value.map(item => ({ id: item.id, name: item.name }));
}
export async function isOrganizationMember(organizationId: string, userId: string): Promise<boolean> {
  return (await userOrganizations(userId)).some(org => org.id === organizationId);
}
export async function listOrganizationUsers(page: number, query: string, organizationId?: string): Promise<OrganizationUserPage> {
  const params = new URLSearchParams({ page: String(page), page_size: "20" });
  if (query) params.set(organizationId ? "q" : "search", organizationId ? query : `%${query}%`);
  const response = await api(`${organizationId ? `/api/organizations/${part(organizationId)}/users` : "/api/users"}?${params}`);
  const value: unknown = await response.json();
  if (!Array.isArray(value)) throw new OrganizationApiError(503, "INVALID_LOGTO_RESPONSE", "Logto 用户列表无法读取。");
  const count = response.headers.get("total-number");
  const parsed = count === null ? NaN : Number(count);
  const total = Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
  const data = value.map(user);
  return { data, page, total, hasNext: total === null ? data.length === 20 : page * 20 < total };
}
export async function addOrganizationUser(organizationId: string, userId: string): Promise<void> {
  // POST adds membership; PUT would replace every existing member.
  await api(`/api/organizations/${part(organizationId)}/users`, { userIds: [userId] });
}
export async function removeOrganizationUser(organizationId: string, userId: string): Promise<void> {
  await api(`/api/organizations/${part(organizationId)}/users/${part(userId)}`, undefined, "DELETE");
}
