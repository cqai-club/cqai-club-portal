import { NextResponse } from "next/server";
import { prisma } from "@/lib/site/prisma";
import { fetchPluginIcon } from "@/lib/plugin-market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext): Promise<NextResponse> {
  const { id } = await context.params;
  const plugin = await prisma.plugin.findFirst({ where: { id, status: "published" } });
  if (!plugin?.iconUrl) return new NextResponse("Not found", { status: 404 });

  try {
    const icon = await fetchPluginIcon(plugin.iconUrl);
    return new NextResponse(Buffer.from(icon.body), {
      headers: {
        "Content-Type": icon.contentType,
        "Cache-Control": "public, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Read plugin icon error:", error);
    return new NextResponse("Icon unavailable", { status: 502 });
  }
}
