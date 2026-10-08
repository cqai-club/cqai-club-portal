import { randomUUID } from "node:crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { ActivityError } from "@/lib/club-activities";
import { mcpActor, mcpAuthError, requireMcpPermission } from "@/lib/mcp/auth";
import { createClubMcpServer, requiredToolPermission } from "@/lib/mcp/tools";
import { rateLimit } from "@/lib/site/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 96_000;

async function bodyOf(request: Request): Promise<unknown> {
  const size = Number(request.headers.get("content-length"));
  if (Number.isFinite(size) && size > MAX_BODY_BYTES) throw new ActivityError(413, "BODY_TOO_LARGE", "MCP 请求内容过长。");
  if (!request.body) return undefined;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new ActivityError(413, "BODY_TOO_LARGE", "MCP 请求内容过长。");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new ActivityError(400, "INVALID_JSON", "MCP 请求不是有效 JSON。"); }
}

export async function POST(request: Request): Promise<Response> {
  const requestId = randomUUID();
  let method: string | undefined;
  let tool: string | undefined;
  try {
    const actor = await mcpActor(request);
    if (!rateLimit("club-mcp", `${actor.issuer}:${actor.sub}`, 120, 60_000)) {
      throw new ActivityError(429, "RATE_LIMITED", "调用过于频繁，请稍后重试。");
    }
    const body = await bodyOf(request);
    if (body !== null && typeof body === "object" && !Array.isArray(body)) {
      const message = body as { method?: unknown; params?: { name?: unknown } };
      method = typeof message.method === "string" ? message.method.slice(0, 64) : undefined;
      tool = typeof message.params?.name === "string" ? message.params.name.slice(0, 128) : undefined;
      if (message.method === "tools/call" && typeof message.params?.name === "string") {
        const permission = requiredToolPermission(message.params.name, actor);
        if (permission) requireMcpPermission(actor, permission);
      }
    }
    const server = createClubMcpServer(actor);
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    try {
      const response = await transport.handleRequest(request, { parsedBody: body });
      response.headers.set("Cache-Control", "no-store");
      response.headers.set("X-Request-Id", requestId);
      console.info("CQAI MCP request", { requestId, method, tool, status: response.status });
      return response;
    } finally { await server.close(); }
  } catch (error) {
    const response = mcpAuthError(error);
    response.headers.set("X-Request-Id", requestId);
    console.info("CQAI MCP request", { requestId, method, tool, status: response.status, code: error instanceof ActivityError ? error.code : "MCP_INTERNAL_ERROR" });
    return response;
  }
}

/** No long-lived transport sessions: clients only need POST, with fresh auth. */
async function unsupported(request: Request): Promise<Response> {
  try { await mcpActor(request); } catch (error) { return mcpAuthError(error); }
  return Response.json({ error: "此 MCP 服务采用无会话 Streamable HTTP，请使用 POST。" }, { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } });
}

export const GET = unsupported;
export const DELETE = unsupported;
