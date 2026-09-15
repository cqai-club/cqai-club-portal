import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import {
  PROJECT_STATUSES,
  createProjectIdentity,
  isPrismaErrorCode,
  normalizeProjectData,
  projectInputSchema,
  serializeAdminProject,
} from "@/lib/project-market";
import {
  parsePositiveInteger,
  requireAdminAccess,
  sanitizeData,
} from "@/lib/site/api-helpers";
import { prisma } from "@/lib/site/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const denied = await requireAdminAccess(request.headers.get("authorization") ?? "");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const page = parsePositiveInteger(searchParams.get("page"), 1, 1_000_000);
  const limit = parsePositiveInteger(searchParams.get("limit"), 20, 100);
  const status = searchParams.get("status")?.trim() ?? "";
  const search = searchParams.get("search")?.trim() ?? "";
  const featuredValue = searchParams.get("featured");

  if (status && !PROJECT_STATUSES.includes(status as (typeof PROJECT_STATUSES)[number])) {
    return NextResponse.json({ error: "项目状态无效。" }, { status: 400 });
  }
  if (featuredValue !== null && featuredValue !== "true" && featuredValue !== "false") {
    return NextResponse.json({ error: "featured 必须是 true 或 false。" }, { status: 400 });
  }

  const where: Prisma.ProjectWhereInput = {
    ...(status ? { status } : {}),
    ...(featuredValue === null ? {} : { featured: featuredValue === "true" }),
    ...(search
      ? {
          OR: [
            { name: { contains: search } },
            { slug: { contains: search } },
            { ownerName: { contains: search } },
            { summary: { contains: search } },
            { focus: { contains: search } },
          ],
        }
      : {}),
  };

  try {
    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      }),
      prisma.project.count({ where }),
    ]);
    return NextResponse.json(
      {
        data: projects.map(serializeAdminProject),
        total,
        page,
        totalPages: Math.ceil(total / limit),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("List projects error:", error);
    return NextResponse.json({ error: "获取项目列表失败。" }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const denied = await requireAdminAccess(request.headers.get("authorization") ?? "");
  if (denied) return denied;

  let body: unknown;
  try {
    body = sanitizeData(await request.json());
  } catch {
    return NextResponse.json({ error: "请求数据无法解析。" }, { status: 400 });
  }

  const parsed = projectInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "项目信息无效。" },
      { status: 400 }
    );
  }

  const identity = createProjectIdentity();
  try {
    const project = await prisma.project.create({
      data: {
        id: identity.id,
        slug: parsed.data.slug ?? identity.slug,
        status: "draft",
        ...normalizeProjectData(parsed.data),
      },
    });
    return NextResponse.json(serializeAdminProject(project), { status: 201 });
  } catch (error) {
    if (isPrismaErrorCode(error, "P2002")) {
      return NextResponse.json({ error: "该项目 slug 已经存在。" }, { status: 409 });
    }
    console.error("Create project error:", error);
    return NextResponse.json({ error: "创建项目失败。" }, { status: 500 });
  }
}
