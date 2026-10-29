import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Keep public image APIs crawlable. Member/preview HTML remains crawlable
      // so engines can read its noindex meta tag and X-Robots-Tag header.
      disallow: ["/api/admin/", "/member/api/", "/mcp", "/.well-known/", "/catalog-source.json"],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
