/**
 * Static official-site content routes.
 *
 * The club's official website and application form are static HTML files that
 * historically lived under the Express `web/` + `public/` directories. They
 * now live under `site/` in this Next app and are returned here as raw file
 * bytes so the HTML (and its own `<head>`, fonts, inline styles) is served
 * verbatim — never rendered through the React app layout.
 */

import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const CONTENT_TYPE: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
};

// Directory-style URLs (/ , /apply/) resolve to site/<path>/index.html
// and must be served as HTML even though the resolved path carries no ".html"
// extension in the request URL.
const HTML_FALLBACK = "text/html; charset=utf-8";

const MAX_STATIC_AGE = 604800; // 7 days, matches old Express image caching

const LEGACY_ADMIN_REDIRECTS: Record<string, string> = {
  "/admin": "/member/dashboard/admin/members",
  "/admin/": "/member/dashboard/admin/members",
  "/admin.html": "/member/dashboard/admin/members",
  "/admin/collections": "/member/dashboard/admin/collections",
  "/admin/collections/": "/member/dashboard/admin/collections",
  "/collection-admin.html": "/member/dashboard/admin/collections",
};

async function readIfExists(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch {
    return null;
  }
}

function fileExtension(pathname: string): string {
  const queryIndex = pathname.indexOf("?");
  if (queryIndex !== -1) {
    pathname = pathname.slice(0, queryIndex);
  }

  const lastSegment = pathname.split("/").pop() ?? "";
  const dotIndex = lastSegment.lastIndexOf(".");
  return dotIndex === -1 ? "" : lastSegment.slice(dotIndex).toLowerCase();
}

export async function GET(
  request: Request,
  context: { params: Promise<{ path?: string[] }> }
): Promise<NextResponse> {
  const { pathname } = new URL(request.url);

  // Guard: this route group must never intercept the member surface.
  if (pathname.startsWith("/member")) {
    return new NextResponse("Not found", { status: 404 });
  }

  const legacyAdminTarget = LEGACY_ADMIN_REDIRECTS[pathname];
  if (legacyAdminTarget) {
    // Use a relative Location so reverse proxies cannot leak the container's
    // internal hostname and port into the public redirect URL.
    return new NextResponse(null, {
      status: 307,
      headers: { Location: legacyAdminTarget },
    });
  }

  // Directory-style URL (no extension, or the root) maps to
  // site/<path>/index.html; a URL with a concrete file (favicon.ico, *.html,
  // collect assets) is served directly from the matching site/ path.
  const { path: segments = [] } = await context.params;
  const lastSegment = segments[segments.length - 1] ?? "";
  const isDirectoryStyle = !lastSegment.includes(".");
  const resolved = isDirectoryStyle
    ? join(process.cwd(), "site", ...segments, "index.html")
    : join(process.cwd(), "site", ...segments);

  // Only serve files that live under the site root.
  const siteRoot = join(process.cwd(), "site");
  if (!resolved.startsWith(siteRoot)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const buffer = await readIfExists(resolved);
  if (!buffer) {
    return new NextResponse("Not found", { status: 404 });
  }

  const extension = fileExtension(pathname);

  // For images use the long-lived cache the site relied on before; other
  // static content (HTML/CSS/JS) gets no-cache like the old Express config.
  const cacheControl = extension === ".html"
    ? "no-cache"
    : CONTENT_TYPE[extension]
      ? `public, max-age=${MAX_STATIC_AGE}`
      : "no-cache";

  // Directory-style URLs map to an index.html file but the URL has no file
  // extension, so fall back to text/html rather than the generic mime type.
  const resolvedExtension = fileExtension(resolved);
  const contentType =
    CONTENT_TYPE[extension] ||
    (isDirectoryStyle ? HTML_FALLBACK : CONTENT_TYPE[resolvedExtension]) ||
    "application/octet-stream";

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": cacheControl,
    },
  });
}
