import { MemberSessionError } from "./session";

export function parseResourceInput(form: FormData, request: Request) {
  const description = String(form.get("description") ?? "").trim();
  if (!description || description.length > 10000) {
    throw new MemberSessionError(400, "INVALID_DESCRIPTION", "请填写详细描述，最多 10000 字。");
  }
  const rawUrl = String(form.get("externalUrl") ?? "").trim();
  const published = form.get("published");
  if (published !== "true" && published !== "false") {
    throw new MemberSessionError(400, "INVALID_STATUS", "请选择发布状态。");
  }
  let url: URL;
  try { url = new URL(rawUrl); } catch {
    throw new MemberSessionError(400, "INVALID_URL", "请填写完整的外部资料链接。");
  }
  if (!/^https?:$/.test(url.protocol) || !url.hostname || url.username || url.password || rawUrl.length > 2048) {
    throw new MemberSessionError(400, "INVALID_URL", "资料链接仅支持完整的 HTTP 或 HTTPS 地址。");
  }
  const systemHosts = new Set(["cqaiclub.asia", "www.cqaiclub.asia", new URL(request.url).hostname]);
  for (const configured of [process.env.BASE_URL_PROD, process.env.BASE_URL_DEV]) {
    if (configured) { try { systemHosts.add(new URL(configured).hostname); } catch { /* Config validated separately. */ } }
  }
  if (systemHosts.has(url.hostname.replace(/\.$/, ""))) {
    throw new MemberSessionError(400, "INTERNAL_URL", "请填写外部资料链接，不能使用本系统地址。");
  }
  return { description, externalUrl: url.href, published: published === "true" };
}
