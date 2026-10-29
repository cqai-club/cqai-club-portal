import type { Metadata } from "next";

export const SITE_NAME = "重庆AI创享俱乐部";
export const SITE_DESCRIPTION = "重庆AI创享俱乐部连接产业、学术与资本，汇聚AI开发者、创业者、行业专家与投资人，通过学习交流、项目共创与资源对接，推动AI应用落地。";
export const HOME_TITLE = `${SITE_NAME}官网 | 重庆AI社群、技术交流与项目共创`;
export const DEFAULT_SOCIAL_IMAGE = "/images/hero-hd.webp";

/** Use a configured public origin, never the request Host or a container URL. */
export function getSiteUrl(): string {
  const configured = process.env.SITE_URL?.trim() || process.env.HOME_URL?.trim() || "https://cqaiclub.asia";
  const url = new URL(configured);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("SITE_URL/HOME_URL must be a public HTTP(S) URL without credentials.");
  }
  return url.origin;
}

export function absoluteUrl(path: string): string {
  return new URL(path, `${getSiteUrl()}/`).toString();
}

export function createPageMetadata({
  title, description, path, image = DEFAULT_SOCIAL_IMAGE, type = "website",
  publishedTime, modifiedTime, noIndex = false,
}: {
  title: string;
  description: string;
  path: string;
  image?: string;
  type?: "website" | "article";
  publishedTime?: string;
  modifiedTime?: string;
  noIndex?: boolean;
}): Metadata {
  const url = absoluteUrl(path);
  const imageUrl = absoluteUrl(image);
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    robots: noIndex
      ? { index: false, follow: true }
      : { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
    openGraph: {
      title, description, url, type, siteName: SITE_NAME, locale: "zh_CN",
      images: [{ url: imageUrl, alt: title }],
      ...(type === "article" ? { publishedTime, modifiedTime } : {}),
    },
    twitter: { card: "summary_large_image", title, description, images: [imageUrl] },
  };
}

/** Safe in a script element even when published content contains HTML. */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function breadcrumbJsonLd(items: Array<{ name: string; path: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem", position: index + 1, name: item.name, item: absoluteUrl(item.path),
    })),
  };
}

export function siteVerification(): Metadata["verification"] {
  return {
    google: process.env.GOOGLE_SITE_VERIFICATION?.trim() || undefined,
    other: {
      ...(process.env.BING_SITE_VERIFICATION?.trim() ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION.trim() } : {}),
      ...(process.env.BAIDU_SITE_VERIFICATION?.trim() ? { "baidu-site-verification": process.env.BAIDU_SITE_VERIFICATION.trim() } : {}),
    },
  };
}
