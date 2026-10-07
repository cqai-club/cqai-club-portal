import { ActivityError, type ActivityActor } from "@/lib/club-activities";
import { verifyPortalBearer } from "@/lib/club-portal-auth";
import { assertMcpOrigin, mcpIssuer, mcpMetadataUrl, mcpResource } from "@/lib/mcp/config";

export type McpActor = ActivityActor & { scopes: string[] };

export class McpPermissionError extends ActivityError {
  constructor(readonly requiredScope: string) {
    super(403, "MCP_PERMISSION_REQUIRED", `没有 ${requiredScope} 权限。`);
  }
}

/** MCP only accepts access tokens for its own audience, never browser cookies. */
export async function mcpActor(request: Request): Promise<McpActor> {
  assertMcpOrigin(request);
  const authorization = request.headers.get("authorization");
  if (authorization === null) throw new ActivityError(401, "LOGIN_REQUIRED", "请先通过 MCP 客户端登录。");
  const match = /^Bearer ([^\s]+)$/i.exec(authorization);
  if (!match) throw new ActivityError(401, "INVALID_TOKEN", "登录令牌格式无效。");
  mcpIssuer();
  return verifyPortalBearer(match[1], mcpResource());
}

export function requireMcpPermission(actor: McpActor, permission: string): void {
  if (!actor.scopes.includes(permission)) throw new McpPermissionError(permission);
}

export function mcpAuthError(error: unknown): Response {
  const known = error instanceof ActivityError;
  const status = known ? error.status : 500;
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (status === 401 || status === 403) {
    let metadataUrl: string;
    try { metadataUrl = mcpMetadataUrl(); } catch {
      return Response.json({ code: "MCP_NOT_CONFIGURED", error: "MCP 服务地址尚未正确配置。" }, {
        status: 503,
        headers,
      });
    }
    const challenge = [`Bearer resource_metadata=${JSON.stringify(metadataUrl)}`];
    if (error instanceof McpPermissionError) {
      challenge.push('error="insufficient_scope"', `scope=${JSON.stringify(error.requiredScope)}`);
    } else if (status === 401 && known && error.code === "INVALID_TOKEN") {
      challenge.push('error="invalid_token"');
    }
    headers.set("WWW-Authenticate", challenge.join(", "));
  }
  return Response.json({
    code: known ? error.code : "MCP_INTERNAL_ERROR",
    error: known ? error.message : "MCP 请求失败。",
    ...(error instanceof McpPermissionError ? { requiredScope: error.requiredScope } : {}),
  }, { status, headers });
}
