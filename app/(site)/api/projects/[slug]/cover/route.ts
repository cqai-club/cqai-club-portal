import { NextResponse } from "next/server";

import { prisma } from "@/lib/site/prisma";
import { readProjectCover } from "@/lib/site/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, context: RouteContext): Promise<NextResponse> {
  const { slug } = await context.params;
  try {
    const project = await prisma.project.findFirst({
      where: { slug, status: "published" },
      select: { coverStorageKey: true, coverMimeType: true },
    });
    if (!project?.coverStorageKey || !project.coverMimeType) {
      return new NextResponse("Not found", { status: 404 });
    }
    if (project.coverMimeType !== "image/jpeg" && project.coverMimeType !== "image/png") {
      return new NextResponse("Cover unavailable", { status: 500 });
    }
    const buffer = await readProjectCover(project.coverStorageKey);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": project.coverMimeType,
        "Content-Length": String(buffer.length),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Get public project cover error:", error);
    return new NextResponse("Cover unavailable", { status: 404 });
  }
}
