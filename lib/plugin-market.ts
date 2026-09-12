import { z } from "zod";
import type { Plugin } from "@prisma/client";

export const PLUGIN_STATUSES = ["draft", "published", "unpublished"] as const;
export type PluginStatus = (typeof PLUGIN_STATUSES)[number];

const plainText = z
  .string()
  .trim()
  .refine(value => !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value), "文本包含不支持的控制字符。");

const httpsUrl = z.string().trim().refine(value => {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.hash && (!url.port || url.port === "443");
  } catch {
    return false;
  }
}, "必须使用不带凭据的标准 HTTPS 地址。");

const npmPackageName = z.string().trim().regex(
  /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/,
  "请输入有效的 npm 包名。"
).max(214);

const categoryId = z.string().trim().regex(
  /^[a-z0-9][a-z0-9._:-]*$/,
  "分类只能包含小写字母、数字、点、下划线、冒号和连字符。"
).max(64);

const hostName = z.string().trim().min(1).max(96);

export const pluginInputSchema = z.object({
  packageName: npmPackageName,
  displayName: plainText.min(1).max(120),
  summary: plainText.min(1).max(1000),
  description: plainText.max(5000).optional().default(""),
  categories: z.array(categoryId).max(32).default([]),
  keywords: z.array(plainText.min(1).max(64)).max(64).default([]),
  repositoryUrl: httpsUrl.max(2048).optional().or(z.literal("")),
  homepageUrl: httpsUrl.max(2048).optional().or(z.literal("")),
  iconUrl: httpsUrl.max(2048).optional().or(z.literal("")).refine(value => !value || isSafeIconSource(value), "图标地址不安全。"),
  compatibilityApiVersion: plainText.max(64).optional().default(""),
  compatibilityHosts: z.array(hostName).max(32).default([]),
}).strict();

export type PluginInput = z.infer<typeof pluginInputSchema>;

export const pluginStatusSchema = z.enum(PLUGIN_STATUSES);

function parseJsonArray(value: string, fallback: string[] = []): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every(item => typeof item === "string")
      ? parsed
      : fallback;
  } catch {
    return fallback;
  }
}

export function serializePlugin(plugin: Plugin) {
  return {
    id: plugin.id,
    status: plugin.status,
    packageName: plugin.packageName,
    displayName: plugin.displayName,
    summary: plugin.summary,
    description: plugin.description ?? "",
    categories: parseJsonArray(plugin.categoriesJson),
    keywords: parseJsonArray(plugin.keywordsJson),
    repositoryUrl: plugin.repositoryUrl ?? "",
    homepageUrl: plugin.homepageUrl ?? "",
    iconUrl: plugin.iconUrl ?? "",
    compatibilityApiVersion: plugin.compatibilityApiVersion ?? "",
    compatibilityHosts: parseJsonArray(plugin.compatibilityHostsJson),
    createdAt: plugin.createdAt.toISOString(),
    updatedAt: plugin.updatedAt.toISOString(),
    publishedAt: plugin.publishedAt?.toISOString() ?? null,
  };
}

export function getPublicOrigin(): string {
  const configured = process.env.BASE_URL_PROD?.trim();
  if (!configured) throw new Error("BASE_URL_PROD is required for the public plugin catalog.");

  const url = new URL(configured);
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.search || (url.port && url.port !== "443")) {
    throw new Error("BASE_URL_PROD must be a credential-free HTTPS origin.");
  }

  return url.origin;
}

export function toCatalogItem(plugin: Plugin, origin: string) {
  const categories = parseJsonArray(plugin.categoriesJson);
  const keywords = parseJsonArray(plugin.keywordsJson);
  const hosts = parseJsonArray(plugin.compatibilityHostsJson);
  const item: Record<string, unknown> = {
    id: plugin.id,
    name: plugin.packageName,
    displayName: plugin.displayName,
    summary: plugin.summary,
    package: { registry: "npm", name: plugin.packageName },
    ...(plugin.description ? { description: plugin.description } : {}),
    ...(categories.length ? { categories } : {}),
    ...(keywords.length ? { keywords } : {}),
    ...(plugin.repositoryUrl ? { repository: { url: plugin.repositoryUrl } } : {}),
    ...(plugin.homepageUrl ? { homepage: plugin.homepageUrl } : {}),
    ...(plugin.compatibilityApiVersion || hosts.length
      ? { compatibility: {
          ...(plugin.compatibilityApiVersion ? { apiVersion: plugin.compatibilityApiVersion } : {}),
          ...(hosts.length ? { hosts } : {}),
        } }
      : {}),
    updatedAt: plugin.updatedAt.toISOString(),
  };

  if (plugin.iconUrl) {
    item.media = {
      icon: {
        url: `${origin}/v1/plugins/${encodeURIComponent(plugin.id)}/icon`,
        alt: plugin.displayName,
      },
    };
  }

  return item;
}

type Cursor = { updatedAt: string; id: string };

export function encodePluginCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodePluginCursor(value: string | null): Cursor | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (
      typeof parsed === "object" && parsed !== null &&
      typeof (parsed as Cursor).updatedAt === "string" &&
      typeof (parsed as Cursor).id === "string"
    ) {
      return parsed as Cursor;
    }
  } catch {
    // The caller turns malformed cursors into a client error.
  }
  throw new Error("cursor 无效。");
}

export function isSafeIconSource(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.hash || (url.port && url.port !== "443")) return false;
    const hostname = url.hostname.toLowerCase();
    if (hostname === "localhost" || hostname.endsWith(".local") || hostname === "::1") return false;
    if (/^(10\.|127\.|169\.254\.|192\.168\.)/.test(hostname)) return false;
    const private172 = hostname.match(/^172\.(\d+)\./);
    return !(private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31);
  } catch {
    return false;
  }
}

export async function fetchPluginIcon(urlValue: string): Promise<{ body: Uint8Array; contentType: string }> {
  if (!isSafeIconSource(urlValue)) throw new Error("图标地址不安全。");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(urlValue, { signal: controller.signal, redirect: "manual" });
    if (!response.ok || response.status >= 300 && response.status < 400) throw new Error("图标读取失败。");
    const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.toLowerCase() ?? "";
    if (!/^image\/(png|jpeg|webp|gif|avif)$/.test(contentType)) throw new Error("图标必须是 PNG、JPG、WebP、GIF 或 AVIF 图片。");
    const length = Number(response.headers.get("content-length") ?? "0");
    if (length > 1024 * 1024) throw new Error("图标不能超过 1 MB。");

    const reader = response.body?.getReader();
    if (!reader) throw new Error("图标响应为空。");
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > 1024 * 1024) throw new Error("图标不能超过 1 MB。");
      chunks.push(chunk.value);
    }
    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { body, contentType };
  } finally {
    clearTimeout(timeout);
  }
}
