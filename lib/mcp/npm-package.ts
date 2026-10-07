import { McpBusinessError } from "@/lib/mcp/operations";

function safeRegistryUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new McpBusinessError(503, "NPM_REGISTRY_NOT_CONFIGURED", "npm Registry 配置无效。"); }
  if (url.username || url.password || url.search || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)))) {
    throw new McpBusinessError(503, "NPM_REGISTRY_NOT_CONFIGURED", "npm Registry 必须使用 HTTPS（本地测试可用 loopback HTTP）。");
  }
  return url;
}

export type NpmPackageValidation = { name: string; version: string; tarballUrl: string; integrity: string | null; checkedAt: string };

/** Query a configured public registry, without downloading or executing code. */
export async function validateNpmPackage(packageName: string): Promise<NpmPackageValidation> {
  const registry = safeRegistryUrl(process.env.CQAI_MCP_NPM_REGISTRY_URL?.trim() || "https://registry.npmjs.org/");
  if (!registry.pathname.endsWith("/")) registry.pathname += "/";
  const endpoint = new URL(`${encodeURIComponent(packageName)}/latest`, registry);
  try {
    const response = await fetch(endpoint, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(8_000), headers: { Accept: "application/json" } });
    if (response.status === 404) throw new McpBusinessError(404, "NPM_PACKAGE_NOT_FOUND", "该 npm 包尚未公开发布，不能提交或上架。", { packageName });
    if (!response.ok) throw new McpBusinessError(503, "NPM_REGISTRY_UNAVAILABLE", "暂时无法验证 npm 包，请稍后重试。");
    if (!response.body) throw new McpBusinessError(502, "INVALID_NPM_PACKAGE", "npm 包元数据无效。");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > 256_000) { await reader.cancel(); throw new McpBusinessError(502, "INVALID_NPM_PACKAGE", "npm 包元数据过大。"); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const metadata = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { name?: unknown; version?: unknown; dist?: { tarball?: unknown; integrity?: unknown } };
    if (metadata.name !== packageName || typeof metadata.version !== "string" || !/^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.+-]+)?$/.test(metadata.version) || typeof metadata.dist?.tarball !== "string") {
      throw new McpBusinessError(502, "INVALID_NPM_PACKAGE", "npm 包名称、版本或下载地址无效。");
    }
    const tarball = safeRegistryUrl(metadata.dist.tarball);
    // Do not let package metadata turn this verification into an arbitrary fetch.
    if (tarball.origin !== registry.origin) throw new McpBusinessError(502, "INVALID_NPM_PACKAGE", "npm 下载地址必须来自配置的 Registry。");
    const download = await fetch(tarball, { method: "HEAD", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(8_000) });
    if (!download.ok) throw new McpBusinessError(502, "NPM_PACKAGE_UNAVAILABLE", "npm 包下载地址不可访问。");
    return { name: packageName, version: metadata.version, tarballUrl: tarball.href, integrity: typeof metadata.dist.integrity === "string" ? metadata.dist.integrity : null, checkedAt: new Date().toISOString() };
  } catch (error) {
    if (error instanceof McpBusinessError) throw error;
    throw new McpBusinessError(503, "NPM_REGISTRY_UNAVAILABLE", "暂时无法验证 npm 包，请稍后重试。");
  }
}
