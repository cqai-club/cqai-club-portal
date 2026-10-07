import { Prisma, type ClubActivity, type ClubActivityRecapImage } from "@prisma/client";
import { z } from "zod";

import type { StoredActivityCover } from "@/lib/club-activity-cover";
import { MAX_RECAP_IMAGES } from "@/lib/club-activity-recap-config";
import type { StoredRecapImage } from "@/lib/club-activity-recap-image";
import { prisma } from "@/lib/site/prisma";

export type ActivityActor = {
  issuer: string;
  sub: string;
  displayName?: string;
};

export class ActivityError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ActivityError";
  }
}

export const activityInputSchema = z.object({
  title: z.string().trim().min(2).max(120),
  summary: z.string().trim().min(2).max(300),
  content: z.string().trim().max(20_000).default(""),
  mode: z.enum(["online", "offline"]),
  location: z.string().trim().min(2).max(300),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  registrationOpensAt: z.iso.datetime({ offset: true }),
  registrationClosesAt: z.iso.datetime({ offset: true }),
  capacity: z.number().int().min(1).max(100_000),
}).superRefine((value, context) => {
  const start = Date.parse(value.startsAt);
  const end = Date.parse(value.endsAt);
  const opens = Date.parse(value.registrationOpensAt);
  const closes = Date.parse(value.registrationClosesAt);
  if (end <= start) context.addIssue({ code: "custom", path: ["endsAt"], message: "结束时间必须晚于开始时间。" });
  if (opens >= closes) context.addIssue({ code: "custom", path: ["registrationClosesAt"], message: "报名截止时间必须晚于开放时间。" });
  if (closes > start) context.addIssue({ code: "custom", path: ["registrationClosesAt"], message: "报名须在活动开始前截止。" });
});

export type ActivityInput = z.infer<typeof activityInputSchema>;

/** Join a caller's transaction so MCP deduplication and business audits are atomic. */
function activityTransaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>, tx?: Prisma.TransactionClient): Promise<T> {
  return tx ? operation(tx) : prisma.$transaction(operation);
}

export function parseActivityInput(value: unknown): ActivityInput {
  const parsed = activityInputSchema.safeParse(value);
  if (!parsed.success) {
    throw new ActivityError(400, "INVALID_ACTIVITY", parsed.error.issues[0]?.message ?? "活动信息无效。");
  }
  return parsed.data;
}

function inputData(input: ActivityInput) {
  return {
    title: input.title,
    summary: input.summary,
    content: input.content,
    mode: input.mode,
    location: input.location,
    startsAt: new Date(input.startsAt),
    endsAt: new Date(input.endsAt),
    registrationOpensAt: new Date(input.registrationOpensAt),
    registrationClosesAt: new Date(input.registrationClosesAt),
    capacity: input.capacity,
  };
}

export function serializeActivity(activity: ClubActivity) {
  return {
    id: activity.id,
    title: activity.title,
    summary: activity.summary,
    content: activity.content,
    coverUrl: activity.coverStorageKey
      ? `/api/v1/activities/${encodeURIComponent(activity.id)}/cover?v=${encodeURIComponent(activity.coverStorageKey)}`
      : null,
    mode: activity.mode,
    location: activity.location,
    startsAt: activity.startsAt.toISOString(),
    endsAt: activity.endsAt.toISOString(),
    registrationOpensAt: activity.registrationOpensAt.toISOString(),
    registrationClosesAt: activity.registrationClosesAt.toISOString(),
    capacity: activity.capacity,
    registeredCount: activity.registeredCount,
    status: activity.status,
    publishedAt: activity.publishedAt?.toISOString() ?? null,
    cancelledAt: activity.cancelledAt?.toISOString() ?? null,
    detailsChangedAt: activity.detailsChangedAt?.toISOString() ?? null,
    recapPublishedAt: activity.recapPublishedAt?.toISOString() ?? null,
    deletedAt: activity.deletedAt?.toISOString() ?? null,
    createdAt: activity.createdAt.toISOString(),
    updatedAt: activity.updatedAt.toISOString(),
  };
}

export type ActivityView = ReturnType<typeof serializeActivity>;

const recapInputSchema = z.object({
  title: z.string().trim().max(120).default(""),
  summary: z.string().trim().max(300).default(""),
  content: z.string().trim().max(20_000).default(""),
  keepImageIds: z.array(z.string().uuid()).max(MAX_RECAP_IMAGES).default([]),
});

export type ActivityRecapInput = z.infer<typeof recapInputSchema>;

export function parseActivityRecapInput(value: unknown): ActivityRecapInput {
  const parsed = recapInputSchema.safeParse(value);
  if (!parsed.success) {
    throw new ActivityError(400, "INVALID_RECAP", parsed.error.issues[0]?.message ?? "活动回顾内容无效。");
  }
  return parsed.data;
}

type ActivityWithRecapImages = ClubActivity & { recapImages: ClubActivityRecapImage[] };

function serializeRecap(activity: ActivityWithRecapImages) {
  return {
    activityId: activity.id,
    activityTitle: activity.title,
    title: activity.recapTitle || activity.title,
    summary: activity.recapSummary || activity.summary,
    content: activity.recapContent || "",
    startsAt: activity.startsAt.toISOString(),
    endsAt: activity.endsAt.toISOString(),
    publishedAt: activity.recapPublishedAt?.toISOString() ?? null,
    coverUrl: activity.coverStorageKey
      ? `/api/v1/activities/${encodeURIComponent(activity.id)}/cover?v=${encodeURIComponent(activity.coverStorageKey)}`
      : null,
    images: activity.recapImages.map(image => ({
      id: image.id,
      originalName: image.originalName,
      url: `/api/v1/activities/${encodeURIComponent(activity.id)}/recap/images/${encodeURIComponent(image.id)}`,
    })),
  };
}

export type ActivityRecapView = ReturnType<typeof serializeRecap>;

function audit(activityId: string, actor: ActivityActor, action: string, fields?: string[]) {
  return {
    activityId,
    actorIssuer: actor.issuer,
    actorSub: actor.sub,
    action,
    detailsJson: JSON.stringify(fields ? { fields } : {}),
  };
}

function notFound(): never {
  throw new ActivityError(404, "ACTIVITY_NOT_FOUND", "活动不存在。");
}

function assertCanPublish(activity: ClubActivity, now = new Date()) {
  if (activity.status !== "draft" || activity.deletedAt) {
    throw new ActivityError(409, "ACTIVITY_STATE", "只有未删除的草稿可以发布。");
  }
  if (activity.startsAt <= now || activity.registrationClosesAt <= now) {
    throw new ActivityError(409, "ACTIVITY_TIME", "活动开始和报名截止时间必须在未来。");
  }
}

export async function listPublicActivities(limit = 30, includeCancelled = true) {
  const now = new Date();
  const visible = { status: includeCancelled ? { in: ["published", "cancelled"] } : "published", deletedAt: null } as const;
  const current = await prisma.clubActivity.findMany({
    where: { ...visible, endsAt: { gte: now } },
    orderBy: [{ startsAt: "asc" }, { createdAt: "desc" }],
    take: limit,
  });
  const past = current.length < limit ? await prisma.clubActivity.findMany({
    where: { ...visible, endsAt: { lt: now } },
    orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
    take: limit - current.length,
  }) : [];
  return { items: [...current, ...past].map(serializeActivity) };
}

export async function listUpcomingPublicActivities(now = new Date()) {
  const items = await prisma.clubActivity.findMany({
    where: { status: "published", deletedAt: null, startsAt: { gt: now } },
    orderBy: [{ startsAt: "asc" }, { createdAt: "desc" }],
  });
  return { items: items.map(serializeActivity) };
}

export async function listPublishedActivityRecaps(now = new Date()) {
  const items = await prisma.clubActivity.findMany({
    where: { status: "published", deletedAt: null, endsAt: { lte: now }, recapPublishedAt: { not: null } },
    include: { recapImages: { orderBy: { position: "asc" } } },
    orderBy: [{ endsAt: "desc" }, { createdAt: "desc" }],
  });
  return { items: items.map(serializeRecap) };
}

export async function getPublicActivityRecap(id: string, now = new Date()) {
  const activity = await prisma.clubActivity.findFirst({
    where: { id, status: "published", deletedAt: null, endsAt: { lte: now }, recapPublishedAt: { not: null } },
    include: { recapImages: { orderBy: { position: "asc" } } },
  });
  if (!activity?.recapContent?.trim()) notFound();
  return serializeRecap(activity);
}

export async function getManagedActivityRecap(id: string) {
  const activity = await prisma.clubActivity.findFirst({
    where: { id, deletedAt: null },
    include: { recapImages: { orderBy: { position: "asc" } } },
  });
  if (!activity) notFound();
  return serializeRecap(activity);
}

export async function saveActivityRecap(
  id: string,
  input: ActivityRecapInput,
  newImages: StoredRecapImage[],
  actor: ActivityActor,
) {
  const { activity, removedKeys } = await prisma.$transaction(async tx => {
    const current = await tx.clubActivity.findFirst({
      where: { id, deletedAt: null },
      include: { recapImages: { orderBy: { position: "asc" } } },
    });
    if (!current) notFound();
    if (current.status !== "published" || current.endsAt > new Date()) {
      throw new ActivityError(409, "ACTIVITY_STATE", "仅能为已结束的已发布活动提交回顾。");
    }
    const keptIds = new Set(input.keepImageIds);
    if (keptIds.size !== input.keepImageIds.length ||
      input.keepImageIds.some(imageId => !current.recapImages.some(image => image.id === imageId))) {
      throw new ActivityError(400, "INVALID_RECAP_IMAGES", "回顾图片列表已变化，请刷新后重试。");
    }
    if (keptIds.size + newImages.length > MAX_RECAP_IMAGES) {
      throw new ActivityError(400, "TOO_MANY_IMAGES", `回顾最多保留 ${MAX_RECAP_IMAGES} 张图片。`);
    }

    const removed = current.recapImages.filter(image => !keptIds.has(image.id));
    if (removed.length) {
      await tx.clubActivityRecapImage.deleteMany({ where: { activityId: id, id: { in: removed.map(image => image.id) } } });
    }
    for (const [position, imageId] of input.keepImageIds.entries()) {
      await tx.clubActivityRecapImage.update({ where: { id: imageId }, data: { position } });
    }
    for (const [index, image] of newImages.entries()) {
      await tx.clubActivityRecapImage.create({
        data: { ...image, activityId: id, position: input.keepImageIds.length + index },
      });
    }

    const updated = await tx.clubActivity.update({
      where: { id },
      data: {
        recapTitle: input.title || current.title,
        recapSummary: input.summary || current.summary,
        recapContent: input.content,
        recapPublishedAt: current.recapPublishedAt ?? new Date(),
        updatedByIssuer: actor.issuer,
        updatedBySub: actor.sub,
      },
      include: { recapImages: { orderBy: { position: "asc" } } },
    });
    await tx.clubActivityAudit.create({
      data: audit(id, actor, current.recapPublishedAt ? "recap_update" : "recap_publish", ["recap", "images"]),
    });
    return { activity: updated, removedKeys: removed.map(image => image.storageKey) };
  });
  return { recap: serializeRecap(activity), removedKeys };
}

export async function getPublicActivity(id: string) {
  const activity = await prisma.clubActivity.findFirst({
    where: { id, status: { in: ["published", "cancelled"] }, deletedAt: null },
  });
  if (!activity) notFound();
  return serializeActivity(activity);
}

export const managedActivityFilters = ["all", "draft", "active", "past", "cancelled"] as const;
export type ManagedActivityFilter = (typeof managedActivityFilters)[number];

export async function listManagedActivities({
  page = 1,
  limit = 20,
  filter = "all",
  search = "",
}: {
  page?: number;
  limit?: number;
  filter?: ManagedActivityFilter;
  search?: string;
} = {}) {
  const now = new Date();
  const where: Prisma.ClubActivityWhereInput = {
    deletedAt: null,
    ...(filter === "draft" ? { status: "draft" } : {}),
    ...(filter === "cancelled" ? { status: "cancelled" } : {}),
    ...(filter === "active" ? { status: "published", endsAt: { gt: now } } : {}),
    ...(filter === "past" ? { status: "published", endsAt: { lte: now } } : {}),
    ...(search ? { OR: [
      { title: { contains: search } },
      { summary: { contains: search } },
      { location: { contains: search } },
    ] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.clubActivity.findMany({
      where,
      orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.clubActivity.count({ where }),
  ]);
  return { items: items.map(serializeActivity), total, page, totalPages: Math.ceil(total / limit) };
}

export async function getManagedActivity(id: string) {
  const activity = await prisma.clubActivity.findFirst({ where: { id, deletedAt: null } });
  if (!activity) notFound();
  return serializeActivity(activity);
}

export async function createActivity(input: ActivityInput, actor: ActivityActor, transaction?: Prisma.TransactionClient) {
  const activity = await activityTransaction(async (tx) => {
    const created = await tx.clubActivity.create({
      data: {
        ...inputData(input),
        createdByIssuer: actor.issuer,
        createdBySub: actor.sub,
      },
    });
    await tx.clubActivityAudit.create({ data: audit(created.id, actor, "create") });
    return created;
  }, transaction);
  return serializeActivity(activity);
}

export async function updateActivity(id: string, input: ActivityInput, actor: ActivityActor, transaction?: Prisma.TransactionClient) {
  const activity = await activityTransaction(async (tx) => {
    const current = await tx.clubActivity.findFirst({ where: { id, deletedAt: null } });
    if (!current) notFound();
    if (current.status === "cancelled") {
      throw new ActivityError(409, "ACTIVITY_STATE", "已取消的活动不可编辑。");
    }
    if (input.capacity < current.registeredCount) {
      throw new ActivityError(409, "ACTIVITY_CAPACITY", "人数上限不能低于已报名人数。");
    }
    if (current.status === "published" && new Date(input.startsAt) <= new Date()) {
      throw new ActivityError(409, "ACTIVITY_TIME", "已发布活动的开始时间必须在未来。");
    }
    const updated = await tx.clubActivity.update({
      where: { id },
      data: {
        ...inputData(input),
        updatedByIssuer: actor.issuer,
        updatedBySub: actor.sub,
        ...(current.status === "published" ? { detailsChangedAt: new Date() } : {}),
      },
    });
    await tx.clubActivityAudit.create({
      data: audit(id, actor, "update", Object.keys(input)),
    });
    return updated;
  }, transaction);
  return serializeActivity(activity);
}

export async function updateActivityCover(id: string, cover: StoredActivityCover, actor: ActivityActor) {
  const activity = await prisma.$transaction(async (tx) => {
    const current = await tx.clubActivity.findFirst({ where: { id, deletedAt: null } });
    if (!current) notFound();
    const updated = await tx.clubActivity.update({
      where: { id },
      data: {
        coverStorageKey: cover.storageKey,
        coverOriginalName: cover.originalName,
        coverMimeType: cover.mimeType,
        coverSize: cover.size,
        updatedByIssuer: actor.issuer,
        updatedBySub: actor.sub,
      },
    });
    await tx.clubActivityAudit.create({ data: audit(id, actor, "cover_update", ["cover"]) });
    return updated;
  });
  return serializeActivity(activity);
}

export async function publishActivity(id: string, actor: ActivityActor, transaction?: Prisma.TransactionClient) {
  const activity = await activityTransaction(async (tx) => {
    const current = await tx.clubActivity.findFirst({ where: { id, deletedAt: null } });
    if (!current) notFound();
    assertCanPublish(current);
    const updated = await tx.clubActivity.update({
      where: { id },
      data: { status: "published", publishedAt: new Date(), updatedByIssuer: actor.issuer, updatedBySub: actor.sub },
    });
    await tx.clubActivityAudit.create({ data: audit(id, actor, "publish") });
    return updated;
  }, transaction);
  return serializeActivity(activity);
}

export async function cancelActivity(id: string, actor: ActivityActor) {
  const activity = await prisma.$transaction(async (tx) => {
    const current = await tx.clubActivity.findFirst({ where: { id, deletedAt: null } });
    if (!current) notFound();
    if (current.status !== "published") {
      throw new ActivityError(409, "ACTIVITY_STATE", "只有已发布活动可以取消。");
    }
    const updated = await tx.clubActivity.update({
      where: { id },
      data: { status: "cancelled", cancelledAt: new Date(), updatedByIssuer: actor.issuer, updatedBySub: actor.sub },
    });
    await tx.clubActivityAudit.create({ data: audit(id, actor, "cancel") });
    return updated;
  });
  return serializeActivity(activity);
}

export async function deleteActivity(id: string, actor: ActivityActor) {
  await prisma.$transaction(async (tx) => {
    const current = await tx.clubActivity.findUnique({ where: { id } });
    if (!current || current.deletedAt) return;
    await tx.clubActivity.update({
      where: { id },
      data: { deletedAt: new Date(), updatedByIssuer: actor.issuer, updatedBySub: actor.sub },
    });
    await tx.clubActivityAudit.create({ data: audit(id, actor, "delete") });
  });
}

export async function listMyActivityRegistrations(actor: ActivityActor) {
  const items = await prisma.clubActivityRegistration.findMany({
    where: { userIssuer: actor.issuer, userSub: actor.sub },
    include: { activity: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return {
    items: items.map(({ activity, ...registration }) => ({
      id: registration.id,
      status: registration.status,
      createdAt: registration.createdAt.toISOString(),
      cancelledAt: registration.cancelledAt?.toISOString() ?? null,
      activity: serializeActivity(activity),
    })),
  };
}

export async function listActivityRegistrations(id: string) {
  const activity = await prisma.clubActivity.findFirst({ where: { id, deletedAt: null } });
  if (!activity) notFound();
  const items = await prisma.clubActivityRegistration.findMany({
    where: { activityId: id, status: "confirmed" },
    orderBy: { createdAt: "asc" },
    take: 100_000,
  });
  return {
    items: items.map((item) => ({
      id: item.id,
      displayName: item.displayName || item.userSub,
      registeredAt: item.createdAt.toISOString(),
    })),
  };
}

function assertCanRegister(activity: ClubActivity, now = new Date()) {
  if (activity.status !== "published" || activity.deletedAt) notFound();
  if (activity.registrationOpensAt > now || activity.registrationClosesAt <= now || activity.startsAt <= now) {
    throw new ActivityError(409, "REGISTRATION_CLOSED", "当前不在报名时间内。");
  }
}

async function withWriteRetry<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
        if (attempt < 2) continue;
        throw new ActivityError(503, "REGISTRATION_BUSY", "报名暂时繁忙，请稍后重试。");
      }
      throw error;
    }
  }
  throw new ActivityError(503, "REGISTRATION_BUSY", "报名暂时繁忙，请稍后重试。");
}

export async function registerForActivity(id: string, actor: ActivityActor, transaction?: Prisma.TransactionClient) {
  try {
    const operation = () => activityTransaction(async (tx) => {
    const activity = await tx.clubActivity.findUnique({ where: { id } });
    if (!activity) notFound();
    const existing = await tx.clubActivityRegistration.findUnique({
      where: { activityId_userIssuer_userSub: { activityId: id, userIssuer: actor.issuer, userSub: actor.sub } },
    });
    if (existing?.status === "confirmed") return { registered: true, alreadyRegistered: true };
    assertCanRegister(activity);

    const reserved = await tx.clubActivity.updateMany({
      where: {
        id,
        status: "published",
        deletedAt: null,
        registeredCount: { lt: activity.capacity },
        registrationOpensAt: { lte: new Date() },
        registrationClosesAt: { gt: new Date() },
        startsAt: { gt: new Date() },
      },
      data: { registeredCount: { increment: 1 } },
    });
    if (reserved.count !== 1) throw new ActivityError(409, "ACTIVITY_FULL_OR_CLOSED", "活动已满员或报名已截止。");

    if (existing) {
      await tx.clubActivityRegistration.update({
        where: { id: existing.id },
        data: { status: "confirmed", cancelledAt: null, displayName: actor.displayName ?? existing.displayName },
      });
    } else {
      await tx.clubActivityRegistration.create({
        data: {
          activityId: id,
          userIssuer: actor.issuer,
          userSub: actor.sub,
          displayName: actor.displayName,
        },
      });
    }
    return { registered: true, alreadyRegistered: false };
    }, transaction);
    return await (transaction ? operation() : withWriteRetry(operation));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await (transaction ?? prisma).clubActivityRegistration.findUnique({
        where: { activityId_userIssuer_userSub: { activityId: id, userIssuer: actor.issuer, userSub: actor.sub } },
      });
      if (existing?.status === "confirmed") return { registered: true, alreadyRegistered: true };
    }
    throw error;
  }
}

export async function cancelActivityRegistration(id: string, actor: ActivityActor, transaction?: Prisma.TransactionClient) {
  const operation = () => activityTransaction(async (tx) => {
    const existing = await tx.clubActivityRegistration.findUnique({
      where: { activityId_userIssuer_userSub: { activityId: id, userIssuer: actor.issuer, userSub: actor.sub } },
    });
    if (!existing || existing.status === "cancelled") return { registered: false };
    await tx.clubActivityRegistration.update({
      where: { id: existing.id },
      data: { status: "cancelled", cancelledAt: new Date() },
    });
    await tx.clubActivity.update({ where: { id }, data: { registeredCount: { decrement: 1 } } });
    return { registered: false };
  }, transaction);
  return transaction ? operation() : withWriteRetry(operation);
}
