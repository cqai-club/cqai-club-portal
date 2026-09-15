import { randomUUID } from "node:crypto";

import type { Project } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/site/prisma";

export const PROJECT_STATUSES = ["draft", "published", "unpublished"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PUBLIC_CONTACT_TYPES = ["club", "email", "url", "none"] as const;
export type PublicContactType = (typeof PUBLIC_CONTACT_TYPES)[number];

const singleLineText = z
  .string()
  .trim()
  .refine(
    value => !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value),
    "文本包含不支持的控制字符。"
  );

const multilineText = (maxLength: number) => z
  .string()
  .transform(value => value.replace(/\r\n?/gu, "\n").trim())
  .pipe(
    z
      .string()
      .max(maxLength)
      .refine(
        value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value),
        "文本包含不支持的控制字符。"
      )
  );

const slug = z
  .string()
  .trim()
  .min(1, "项目 slug 不能为空。")
  .max(80, "项目 slug 不能超过 80 个字符。")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "项目 slug 只能包含小写字母、数字和连字符。");

const httpsUrl = singleLineText.max(2048).refine(value => {
  if (!value) return true;
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      !parsed.username &&
      !parsed.password &&
      !parsed.hash &&
      (!parsed.port || parsed.port === "443")
    );
  } catch {
    return false;
  }
}, "链接必须是无凭据、无片段的标准 HTTPS 地址。");

export function isValidProjectHttpsUrl(value: string): boolean {
  return httpsUrl.safeParse(value).success;
}

const projectEditableShape = {
  slug: slug.optional(),
  name: singleLineText.min(1, "项目名称不能为空。").max(160),
  ownerName: singleLineText.max(160).optional().default(""),
  summary: singleLineText.max(1000).optional().default(""),
  description: multilineText(20_000).optional().default(""),
  stage: singleLineText.max(100).optional().default(""),
  focus: singleLineText.max(300).optional().default(""),
  collaborationNeeds: multilineText(5000).optional().default(""),
  demoUrl: httpsUrl.optional().default(""),
  internalContact: singleLineText.max(500).optional().default(""),
  publicContactType: z.enum(PUBLIC_CONTACT_TYPES).optional().default("club"),
  publicContactValue: singleLineText.max(2048).optional().default(""),
  featured: z.boolean().optional().default(false),
  featuredOrder: z.number().int().min(1).max(6).nullable().optional().default(null),
};

const validatePublicContact = (
  input: { publicContactType?: PublicContactType; publicContactValue?: string },
  context: z.RefinementCtx
): void => {
  const value = input.publicContactValue?.trim() ?? "";
  if (input.publicContactType === "email") {
    const email = z.string().email().max(320).safeParse(value);
    if (!email.success) {
      context.addIssue({
        code: "custom",
        path: ["publicContactValue"],
        message: "公开联系方式必须是有效邮箱。",
      });
    }
  }
  if (
    input.publicContactType === "url" &&
    (!value || !httpsUrl.safeParse(value).success)
  ) {
    context.addIssue({
      code: "custom",
      path: ["publicContactValue"],
      message: "公开联系链接必须使用 HTTPS。",
    });
  }
};

export const projectInputSchema = z
  .object(projectEditableShape)
  .strict()
  .superRefine(validatePublicContact);

export const projectPatchSchema = z
  .object({
    slug: slug.optional(),
    name: projectEditableShape.name.optional(),
    ownerName: singleLineText.max(160).optional(),
    summary: singleLineText.max(1000).optional(),
    description: multilineText(20_000).optional(),
    stage: singleLineText.max(100).optional(),
    focus: singleLineText.max(300).optional(),
    collaborationNeeds: multilineText(5000).optional(),
    demoUrl: httpsUrl.optional(),
    internalContact: singleLineText.max(500).optional(),
    publicContactType: z.enum(PUBLIC_CONTACT_TYPES).optional(),
    publicContactValue: singleLineText.max(2048).optional(),
    featured: z.boolean().optional(),
    featuredOrder: z.number().int().min(1).max(6).nullable().optional(),
  })
  .strict();

export const projectStatusSchema = z.enum(PROJECT_STATUSES);

export type ProjectInput = z.infer<typeof projectInputSchema>;

const submissionText = (payload: Record<string, unknown>, key: string): string => {
  const value = payload[key];
  return typeof value === "string" ? value.trim() : "";
};

export function parseProjectSubmissionInput(
  payload: Record<string, unknown>,
  fallbackName = "",
  fallbackContact = ""
) {
  return projectInputSchema.safeParse({
    name: submissionText(payload, "projectName") || fallbackName.trim(),
    ownerName: submissionText(payload, "owner"),
    summary: submissionText(payload, "oneLine"),
    description: submissionText(payload, "projectBio"),
    stage: submissionText(payload, "stage"),
    focus: submissionText(payload, "projectFocus"),
    collaborationNeeds: submissionText(payload, "needs"),
    demoUrl: submissionText(payload, "demoUrl"),
    internalContact: submissionText(payload, "projectContact") || fallbackContact.trim(),
    publicContactType: "club",
    publicContactValue: "",
    featured: false,
    featuredOrder: null,
  });
}

const nullable = (value: string): string | null => value || null;

export function normalizeProjectData(input: ProjectInput) {
  const hidesContactValue = input.publicContactType === "club" || input.publicContactType === "none";
  return {
    name: input.name,
    ownerName: nullable(input.ownerName),
    summary: input.summary,
    description: input.description,
    stage: nullable(input.stage),
    focus: nullable(input.focus),
    collaborationNeeds: nullable(input.collaborationNeeds),
    demoUrl: nullable(input.demoUrl),
    internalContact: nullable(input.internalContact),
    publicContactType: input.publicContactType,
    publicContactValue: hidesContactValue ? null : nullable(input.publicContactValue),
    featured: input.featured,
    featuredOrder: input.featured ? input.featuredOrder : null,
  };
}

export function projectToEditableInput(project: Project): ProjectInput {
  return {
    slug: project.slug,
    name: project.name,
    ownerName: project.ownerName ?? "",
    summary: project.summary,
    description: project.description,
    stage: project.stage ?? "",
    focus: project.focus ?? "",
    collaborationNeeds: project.collaborationNeeds ?? "",
    demoUrl: project.demoUrl ?? "",
    internalContact: project.internalContact ?? "",
    publicContactType: project.publicContactType as PublicContactType,
    publicContactValue: project.publicContactValue ?? "",
    featured: project.featured,
    featuredOrder: project.featuredOrder,
  };
}

export function createProjectIdentity(): { id: string; slug: string } {
  const id = randomUUID();
  return { id, slug: `project-${id.replaceAll("-", "").slice(0, 8)}` };
}

export function projectCoverUrl(project: Pick<Project, "id" | "slug" | "coverStorageKey">, admin = false): string | null {
  if (!project.coverStorageKey) return null;
  return admin
    ? `/api/admin/projects/${encodeURIComponent(project.id)}/cover`
    : `/api/projects/${encodeURIComponent(project.slug)}/cover`;
}

export function serializeAdminProject(project: Project) {
  return {
    id: project.id,
    sourceSubmissionId: project.sourceSubmissionId,
    slug: project.slug,
    slugLocked: project.publishedAt !== null,
    status: project.status,
    name: project.name,
    ownerName: project.ownerName ?? "",
    summary: project.summary,
    description: project.description,
    stage: project.stage ?? "",
    focus: project.focus ?? "",
    collaborationNeeds: project.collaborationNeeds ?? "",
    demoUrl: project.demoUrl ?? "",
    internalContact: project.internalContact ?? "",
    publicContactType: project.publicContactType,
    publicContactValue: project.publicContactValue ?? "",
    coverUrl: projectCoverUrl(project, true),
    coverOriginalName: project.coverOriginalName,
    coverMimeType: project.coverMimeType,
    coverSize: project.coverSize,
    featured: project.featured,
    featuredOrder: project.featuredOrder,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    publishedAt: project.publishedAt?.toISOString() ?? null,
  };
}

export type PublicProject = ReturnType<typeof serializePublicProject>;

export function serializePublicProject(project: Project) {
  return {
    slug: project.slug,
    name: project.name,
    ownerName: project.ownerName ?? "",
    summary: project.summary,
    description: project.description,
    stage: project.stage ?? "",
    focus: project.focus ?? "",
    collaborationNeeds: project.collaborationNeeds ?? "",
    demoUrl: project.demoUrl ?? "",
    coverUrl: projectCoverUrl(project),
    featured: project.featured,
    publicContact: {
      type: project.publicContactType as PublicContactType,
      value: project.publicContactValue,
    },
    publishedAt: project.publishedAt?.toISOString() ?? null,
    updatedAt: project.updatedAt.toISOString(),
  };
}

export interface PublicProjectListOptions {
  page?: number;
  limit?: number;
  featured?: boolean;
}

export async function listPublicProjects(options: PublicProjectListOptions = {}) {
  const page = Math.max(1, Math.trunc(options.page ?? 1));
  const limit = Math.min(50, Math.max(1, Math.trunc(options.limit ?? 12)));
  const where = {
    status: "published",
    ...(options.featured === undefined ? {} : { featured: options.featured }),
  };
  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: options.featured
        ? [{ featuredOrder: "asc" }, { publishedAt: "desc" }, { id: "asc" }]
        : [{ publishedAt: "desc" }, { id: "asc" }],
    }),
    prisma.project.count({ where }),
  ]);
  return {
    data: projects.map(serializePublicProject),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getPublicProjectBySlug(slugValue: string): Promise<PublicProject | null> {
  const project = await prisma.project.findFirst({
    where: { slug: slugValue, status: "published" },
  });
  return project ? serializePublicProject(project) : null;
}

export function getPublishValidationError(project: Pick<Project, "name" | "summary" | "description" | "coverStorageKey">): string | null {
  const missing: string[] = [];
  if (!project.name.trim()) missing.push("项目名称");
  if (!project.summary.trim()) missing.push("项目简介");
  if (!project.description.trim()) missing.push("项目正文");
  if (!project.coverStorageKey) missing.push("项目封面");
  return missing.length ? `发布前请补充：${missing.join("、")}。` : null;
}

export async function assertFeaturedCapacity(projectId?: string): Promise<void> {
  const count = await prisma.project.count({
    where: {
      status: "published",
      featured: true,
      ...(projectId ? { id: { not: projectId } } : {}),
    },
  });
  if (count >= 6) throw new Error("PROJECT_FEATURED_LIMIT");
}

export async function nextFeaturedOrder(projectId?: string): Promise<number> {
  const featured = await prisma.project.findMany({
    where: {
      status: "published",
      featured: true,
      ...(projectId ? { id: { not: projectId } } : {}),
    },
    select: { featuredOrder: true },
  });
  const occupied = new Set(featured.map(project => project.featuredOrder).filter((value): value is number => value !== null));
  for (let order = 1; order <= 6; order += 1) {
    if (!occupied.has(order)) return order;
  }
  return Math.max(0, ...occupied) + 1;
}

export async function assertFeaturedOrderAvailable(projectId: string, order: number): Promise<void> {
  const conflict = await prisma.project.findFirst({
    where: {
      id: { not: projectId },
      status: "published",
      featured: true,
      featuredOrder: order,
    },
    select: { id: true },
  });
  if (conflict) throw new Error("PROJECT_FEATURED_ORDER_OCCUPIED");
}

export function isFeaturedOrderConflict(error: unknown): boolean {
  if (error instanceof Error && error.message.includes("PROJECT_FEATURED_ORDER_OCCUPIED")) {
    return true;
  }
  if (!isPrismaErrorCode(error, "P2002") || typeof error !== "object" || error === null) {
    return false;
  }
  const target = "meta" in error && typeof error.meta === "object" && error.meta !== null && "target" in error.meta
    ? error.meta.target
    : undefined;
  return Array.isArray(target)
    ? target.some(value => String(value).includes("featuredOrder"))
    : String(target ?? "").includes("featuredOrder");
}

export function isFeaturedLimitError(error: unknown): boolean {
  // Prisma maps SQLite trigger RAISE(ABORT, ...) to P2003 without preserving
  // the custom SQLite message. Project content/status updates do not touch a
  // foreign key, so P2003 on those routes can only be this capacity trigger.
  return isPrismaErrorCode(error, "P2003") || (
    error instanceof Error && (
      error.message.includes("PROJECT_FEATURED_LIMIT") ||
      error.cause instanceof Error && error.cause.message.includes("PROJECT_FEATURED_LIMIT")
    )
  );
}

export function isPrismaErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
