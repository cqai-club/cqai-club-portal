import { mcpAuthError } from "@/lib/mcp/auth";
import { mcpIssuer, mcpResource } from "@/lib/mcp/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const metadataHeaders = {
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Accept",
};

export function GET(): Response {
  try {
    return Response.json({
      resource: mcpResource(),
      authorization_servers: [mcpIssuer()],
      bearer_methods_supported: ["header"],
      scopes_supported: ["activity:publish", "plugin:admin"],
    }, { headers: metadataHeaders });
  } catch (error) {
    const response = mcpAuthError(error);
    for (const [name, value] of Object.entries(metadataHeaders)) response.headers.set(name, value);
    return response;
  }
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: metadataHeaders });
}
