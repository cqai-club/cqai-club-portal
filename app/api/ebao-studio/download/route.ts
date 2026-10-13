import { resolveEbaoDownload, selectDownloadSource } from "@/lib/ebao-download";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const platform = params.get("platform");
  if (platform !== "windows" && platform !== "macos") {
    return Response.json({ error: "请选择 Windows 或 macOS 下载。" }, { status: 400 });
  }
  const source = selectDownloadSource(request.headers, params.get("source"));
  const url = await resolveEbaoDownload(platform, source);
  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      // The location depends on the visitor and on the newest published release.
      "Cache-Control": "private, no-store",
      "X-Download-Source": source,
    },
  });
}
