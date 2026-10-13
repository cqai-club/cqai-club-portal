import { isIP } from "node:net";
import geoip from "geoip-country";
import semver from "semver";

export type DownloadSource = "gitcode" | "github";
export type DownloadPlatform = "windows" | "macos";

const repositories = {
  gitcode: "https://gitcode.com/g-dxw/ebao-studio",
  github: "https://github.com/cqai-club/ebao-studio",
};

export function selectDownloadSource(headers: Headers, override: string | null): DownloadSource {
  if (override === "gitcode" || override === "github") return override;

  // Nginx overwrites X-Real-IP. Match the existing portal's trusted proxy policy:
  // the last forwarded address is used only when X-Real-IP is absent.
  const ip = headers.get("x-real-ip")?.trim()
    || headers.get("x-forwarded-for")?.split(",").at(-1)?.trim()
    || "";
  return isIP(ip) && geoip.lookup(ip)?.country === "CN" ? "gitcode" : "github";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function publishedTime(release: Record<string, unknown>): number {
  const date = release.published_at || release.created_at;
  return typeof date === "string" ? Date.parse(date) || 0 : 0;
}

function compareReleases(a: Record<string, unknown>, b: Record<string, unknown>): number {
  const aVersion = typeof a.tag_name === "string" ? semver.valid(a.tag_name) : null;
  const bVersion = typeof b.tag_name === "string" ? semver.valid(b.tag_name) : null;
  // Mirroring/backfilling an old tag can give it a later created_at timestamp.
  if (aVersion && bVersion) return semver.rcompare(aVersion, bVersion) || publishedTime(b) - publishedTime(a);
  if (aVersion) return -1;
  if (bVersion) return 1;
  return publishedTime(b) - publishedTime(a);
}

function installerUrl(asset: unknown, platform: DownloadPlatform, source: DownloadSource): string | null {
  const entry = asRecord(asset);
  if (!entry || typeof entry.name !== "string" || typeof entry.browser_download_url !== "string") return null;
  if (entry.type === "source" || (entry.state !== undefined && entry.state !== "uploaded")) return null;
  const pattern = platform === "windows"
    ? /^eBao-Studio-.+-x64-Setup\.exe$/i
    : /^eBao-Studio-.+-universal\.dmg$/i;
  if (!pattern.test(entry.name)) return null;

  try {
    const url = new URL(entry.browser_download_url);
    const repository = new URL(repositories[source]);
    // Use the permanent public URL, never an expiring CDN URL or another repo.
    if (url.origin !== repository.origin || url.username || url.password
      || !url.pathname.startsWith(`${repository.pathname}/releases/download/`)
      || url.search || url.hash) return null;
    const parts = url.pathname.slice(`${repository.pathname}/releases/download/`.length).split("/");
    if (parts.length !== 2 || !parts[0] || decodeURIComponent(parts[1]) !== entry.name) return null;
    return url.href;
  } catch {
    return null;
  }
}

export async function resolveEbaoDownload(
  platform: DownloadPlatform,
  source: DownloadSource,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const fallback = `${repositories[source]}/releases`;
  const endpoint = source === "gitcode"
    ? "https://api.gitcode.com/api/v5/repos/g-dxw/ebao-studio/releases?direction=desc&per_page=100"
    : "https://api.github.com/repos/cqai-club/ebao-studio/releases?per_page=100";
  const headers: Record<string, string> = { Accept: "application/json", "User-Agent": "CQAI-Club-Portal" };
  if (source === "github" && process.env.EBAO_RELEASE_GITHUB_TOKEN?.trim()) {
    headers.Authorization = `Bearer ${process.env.EBAO_RELEASE_GITHUB_TOKEN.trim()}`;
  }

  try {
    // Resolve on every click, including today's unsigned test prereleases.
    // GitHub /releases/latest excludes these, so use the published release list.
    const response = await fetcher(endpoint, { headers, cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!response.ok) return fallback;
    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) return fallback;
    const releases = payload.map(asRecord)
      .filter((release): release is Record<string, unknown> => release !== null
        && release.draft !== true && release.release_status !== "draft")
      .sort(compareReleases);
    for (const release of releases) {
      if (!Array.isArray(release.assets)) continue;
      for (const asset of release.assets) {
        const url = installerUrl(asset, platform, source);
        if (url) return url;
      }
    }
  } catch {
    // A rate limit, timeout or upstream error still leaves a usable download page.
  }
  return fallback;
}
