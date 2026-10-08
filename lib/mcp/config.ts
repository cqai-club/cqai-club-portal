import { ActivityError } from "@/lib/club-activities";
import { logtoIssuer } from "@/lib/club-portal-auth";

function configurationError(): ActivityError {
  return new ActivityError(503, "MCP_NOT_CONFIGURED", "MCP 服务地址尚未正确配置。");
}

function configuredUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw configurationError(); }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
    url.username || url.password || /[?#]/.test(value)
  ) throw configurationError();
  return url;
}

/** Canonical audience comes from deployment configuration, never Host headers. */
export function mcpResource(): string {
  const explicit = process.env.CQAI_MCP_RESOURCE?.trim();
  if (explicit) {
    const url = configuredUrl(explicit);
    if (url.pathname !== "/mcp") throw configurationError();
    return url.href;
  }
  const base = process.env.NODE_ENV === "production"
    ? process.env.BASE_URL_PROD?.trim()
    : process.env.BASE_URL_DEV?.trim() || process.env.BASE_URL_PROD?.trim();
  if (!base) throw configurationError();
  const url = configuredUrl(base);
  // Existing Logto Web base URLs may include /member. MCP is always rooted at
  // the configured origin and has an independent OAuth resource identifier.
  return new URL("/mcp", url.origin).href;
}

export function mcpOrigin(): string {
  return new URL(mcpResource()).origin;
}

export function mcpIssuer(): string {
  const issuer = logtoIssuer();
  configuredUrl(issuer);
  return issuer;
}

export function mcpMetadataUrl(): string {
  return new URL("/.well-known/oauth-protected-resource/mcp", mcpResource()).href;
}

/** Browser requests need a trusted Origin; native clients may omit it. */
export function assertMcpOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (origin === null) return;
  const configured = process.env.CQAI_MCP_ALLOWED_ORIGINS?.trim();
  const allowed = configured
    ? configured.split(",").map((entry) => {
      const url = configuredUrl(entry.trim());
      if (url.pathname !== "/") throw configurationError();
      return url.origin;
    })
    : [mcpOrigin()];
  if (!allowed.includes(origin)) {
    throw new ActivityError(403, "INVALID_ORIGIN", "请求来源不受信任。");
  }
}
