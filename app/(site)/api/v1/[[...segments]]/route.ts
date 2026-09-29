import { NextResponse } from "next/server";

import { activityActor } from "@/lib/club-activity-auth";
import { readActivityCover, removeActivityCover, saveActivityCover } from "@/lib/club-activity-cover";
import { MAX_RECAP_IMAGE_BYTES, MAX_RECAP_IMAGES } from "@/lib/club-activity-recap-config";
import { readRecapImage, removeRecapImage, saveRecapImage, type StoredRecapImage } from "@/lib/club-activity-recap-image";
import {
  ActivityError,
  cancelActivity,
  cancelActivityRegistration,
  createActivity,
  deleteActivity,
  getManagedActivity,
  getManagedActivityRecap,
  getPublicActivity,
  getPublicActivityRecap,
  listActivityRegistrations,
  listManagedActivities,
  listMyActivityRegistrations,
  listPublicActivities,
  managedActivityFilters,
  parseActivityInput,
  parseActivityRecapInput,
  publishActivity,
  registerForActivity,
  updateActivity,
  updateActivityCover,
  saveActivityRecap,
  type ActivityActor,
  type ManagedActivityFilter,
} from "@/lib/club-activities";
import { MAX_PROJECT_COVER_BYTES, rateLimit } from "@/lib/site/api-helpers";
import { prisma } from "@/lib/site/prisma";
import {
  createPluginSubmission,
  listMyPluginSubmissions,
  parsePluginSubmission,
  PluginSubmissionError,
} from "@/lib/plugin-submissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers });
}

function pathOf(request: Request): string[] {
  const pathname = new URL(request.url).pathname;
  if (!pathname.startsWith("/api/v1/")) return [];
  return pathname.slice("/api/v1/".length).split("/").filter(Boolean);
}

async function bodyOf(request: Request): Promise<unknown> {
  const body = await request.text();
  if (body.length > 80_000) throw new ActivityError(413, "BODY_TOO_LARGE", "活动内容过长。");
  try {
    return JSON.parse(body);
  } catch {
    throw new ActivityError(400, "INVALID_JSON", "请求内容不是有效 JSON。");
  }
}

async function pluginBodyOf(request: Request): Promise<unknown> {
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > 32_000) {
    throw new PluginSubmissionError(413, "BODY_TOO_LARGE", "插件资料过长。");
  }
  const body = await request.text();
  if (body.length > 32_000) throw new PluginSubmissionError(413, "BODY_TOO_LARGE", "插件资料过长。");
  try {
    return JSON.parse(body);
  } catch {
    throw new PluginSubmissionError(400, "INVALID_JSON", "请求内容不是有效 JSON。");
  }
}

function limitWrites(actor: ActivityActor): void {
  if (!rateLimit("club-activity-write", `${actor.issuer}:${actor.sub}`, 30, 60_000)) {
    throw new ActivityError(429, "RATE_LIMITED", "操作太频繁，请稍后重试。");
  }
}

async function run(request: Request): Promise<NextResponse> {
  const path = pathOf(request);
  const method = request.method;
  const [first, second, third, fourth, fifth] = path;

  if (method === "GET" && path.length === 1 && first === "activities") {
    const queryLimit = new URL(request.url).searchParams.get("limit");
    const limit = queryLimit === null ? 30 : Number(queryLimit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new ActivityError(400, "INVALID_LIMIT", "limit 必须是 1 到 100 的整数。");
    }
    return json(await listPublicActivities(limit));
  }
  if (method === "GET" && path.length === 2 && first === "activities") {
    return json(await getPublicActivity(second));
  }
  if (method === "GET" && path.length === 3 && first === "activities" && third === "recap") {
    return json(await getPublicActivityRecap(second));
  }
  if (method === "GET" && path.length === 5 && first === "activities" && third === "recap" && fourth === "images") {
    const image = await prisma.clubActivityRecapImage.findFirst({
      where: {
        id: fifth,
        activityId: second,
        activity: { status: "published", deletedAt: null, endsAt: { lte: new Date() }, recapPublishedAt: { not: null } },
      },
    });
    if (!image) throw new ActivityError(404, "RECAP_IMAGE_NOT_FOUND", "回顾图片不存在。");
    try {
      const buffer = await readRecapImage(image.storageKey);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "image/jpeg",
          "Content-Length": String(buffer.length),
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (error) {
      console.error("Club activity recap image unavailable:", error);
      throw new ActivityError(404, "RECAP_IMAGE_NOT_FOUND", "回顾图片不存在。");
    }
  }
  if (method === "GET" && path.length === 3 && first === "activities" && third === "cover") {
    const activity = await prisma.clubActivity.findFirst({
      where: { id: second, deletedAt: null },
      select: { status: true, coverStorageKey: true, coverMimeType: true },
    });
    if (!activity?.coverStorageKey || activity.coverMimeType !== "image/jpeg") {
      throw new ActivityError(404, "COVER_NOT_FOUND", "活动封面不存在。");
    }
    if (activity.status === "draft") {
      try {
        await activityActor(request, { manage: true });
      } catch {
        throw new ActivityError(404, "COVER_NOT_FOUND", "活动封面不存在。");
      }
    }
    try {
      const buffer = await readActivityCover(activity.coverStorageKey);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "image/jpeg",
          "Content-Length": String(buffer.length),
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (error) {
      console.error("Club activity cover unavailable:", error);
      throw new ActivityError(404, "COVER_NOT_FOUND", "活动封面不存在。");
    }
  }
  if (method === "GET" && path.join("/") === "me/activity-registrations") {
    const actor = await activityActor(request);
    return json(await listMyActivityRegistrations(actor));
  }
  if (method === "GET" && path.join("/") === "me/plugin-submissions") {
    const actor = await activityActor(request);
    return json(await listMyPluginSubmissions(actor));
  }
  if (method === "GET" && path.join("/") === "manage/activities") {
    await activityActor(request, { manage: true });
    const params = new URL(request.url).searchParams;
    const page = Number(params.get("page") ?? "1");
    const limit = Number(params.get("limit") ?? "20");
    const filter = params.get("status") ?? "all";
    const search = params.get("search")?.trim() ?? "";
    if (!Number.isSafeInteger(page) || page < 1 || page > 1_000_000) {
      throw new ActivityError(400, "INVALID_PAGE", "page 必须是 1 到 1000000 的整数。");
    }
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new ActivityError(400, "INVALID_LIMIT", "limit 必须是 1 到 100 的整数。");
    }
    if (!managedActivityFilters.includes(filter as ManagedActivityFilter)) {
      throw new ActivityError(400, "INVALID_STATUS", "活动状态筛选条件无效。");
    }
    if (search.length > 200) {
      throw new ActivityError(400, "INVALID_SEARCH", "关键词不能超过 200 个字。");
    }
    return json(await listManagedActivities({ page, limit, filter: filter as ManagedActivityFilter, search }));
  }
  if (method === "GET" && path.length === 3 && first === "manage" && second === "activities") {
    await activityActor(request, { manage: true });
    return json(await getManagedActivity(third));
  }
  if (method === "GET" && path.length === 4 && first === "manage" && second === "activities" && fourth === "recap") {
    await activityActor(request, { manage: true });
    return json(await getManagedActivityRecap(third));
  }
  if (method === "GET" && path.length === 3 && first === "activities" && third === "registrations") {
    await activityActor(request, { manage: true });
    return json(await listActivityRegistrations(second));
  }

  if (method === "POST" && path.length === 1 && first === "activities") {
    const actor = await activityActor(request, { manage: true, write: true });
    limitWrites(actor);
    return json(await createActivity(parseActivityInput(await bodyOf(request)), actor), 201);
  }
  if (method === "POST" && path.length === 1 && first === "plugin-submissions") {
    const actor = await activityActor(request, { write: true });
    if (!rateLimit("plugin-submission", `${actor.issuer}:${actor.sub}`, 5, 60 * 60_000)) {
      throw new PluginSubmissionError(429, "RATE_LIMITED", "投稿太频繁，请稍后重试。");
    }
    return json(await createPluginSubmission(parsePluginSubmission(await pluginBodyOf(request)), actor), 201);
  }
  if (method === "PATCH" && path.length === 2 && first === "activities") {
    const actor = await activityActor(request, { manage: true, write: true });
    limitWrites(actor);
    return json(await updateActivity(second, parseActivityInput(await bodyOf(request)), actor));
  }
  if (method === "PUT" && path.length === 3 && first === "activities" && third === "cover") {
    const actor = await activityActor(request, { manage: true, write: true });
    limitWrites(actor);
    const exists = await prisma.clubActivity.findFirst({ where: { id: second, deletedAt: null }, select: { id: true } });
    if (!exists) throw new ActivityError(404, "ACTIVITY_NOT_FOUND", "活动不存在。");
    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_PROJECT_COVER_BYTES + 64_000) {
      throw new ActivityError(413, "BODY_TOO_LARGE", "图片大小不能超过 5MB。");
    }
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      throw new ActivityError(400, "INVALID_UPLOAD", "封面上传数据无法解析。");
    }
    const candidate = formData.get("cover");
    if (!candidate || typeof candidate === "string") {
      throw new ActivityError(400, "INVALID_UPLOAD", "请选择活动封面。");
    }
    let saved;
    try {
      saved = await saveActivityCover(candidate);
    } catch (error) {
      throw new ActivityError(400, "INVALID_UPLOAD", error instanceof Error ? error.message : "封面上传失败。");
    }
    try {
      return json(await updateActivityCover(second, saved, actor));
    } catch (error) {
      await removeActivityCover(saved.storageKey);
      throw error;
    }
  }
  if (method === "PUT" && path.length === 3 && first === "activities" && third === "recap") {
    const actor = await activityActor(request, { manage: true, write: true });
    limitWrites(actor);
    const activity = await prisma.clubActivity.findFirst({
      where: { id: second, deletedAt: null },
      select: { status: true, endsAt: true },
    });
    if (!activity) throw new ActivityError(404, "ACTIVITY_NOT_FOUND", "活动不存在。");
    if (activity.status !== "published" || activity.endsAt > new Date()) {
      throw new ActivityError(409, "ACTIVITY_STATE", "仅能为已结束的已发布活动提交回顾。");
    }
    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_RECAP_IMAGES * MAX_RECAP_IMAGE_BYTES + 128_000) {
      throw new ActivityError(413, "BODY_TOO_LARGE", "回顾图片总大小超出限制。");
    }
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      throw new ActivityError(400, "INVALID_UPLOAD", "回顾上传数据无法解析。");
    }
    let keepImageIds: unknown;
    try {
      keepImageIds = JSON.parse(String(formData.get("keepImageIds") ?? "[]"));
    } catch {
      throw new ActivityError(400, "INVALID_RECAP_IMAGES", "回顾图片列表无效。");
    }
    const input = parseActivityRecapInput({
      title: formData.get("title"),
      summary: formData.get("summary"),
      content: formData.get("content"),
      keepImageIds,
    });
    const candidates = formData.getAll("images");
    if (candidates.length > MAX_RECAP_IMAGES || candidates.some(candidate => typeof candidate === "string")) {
      throw new ActivityError(400, "INVALID_RECAP_IMAGES", `最多上传 ${MAX_RECAP_IMAGES} 张 JPG 或 PNG 图片。`);
    }
    const files = candidates as File[];
    if (files.some(file => file.size > MAX_RECAP_IMAGE_BYTES) ||
      files.reduce((sum, file) => sum + file.size, 0) > MAX_RECAP_IMAGES * MAX_RECAP_IMAGE_BYTES) {
      throw new ActivityError(413, "BODY_TOO_LARGE", "每张图片不能超过 5MB。");
    }
    const saved: StoredRecapImage[] = [];
    try {
      for (const file of files) saved.push(await saveRecapImage(file));
      const { recap, removedKeys } = await saveActivityRecap(second, input, saved, actor);
      await Promise.all(removedKeys.map(removeRecapImage));
      return json(recap);
    } catch (error) {
      await Promise.all(saved.map(image => removeRecapImage(image.storageKey)));
      if (error instanceof ActivityError) throw error;
      if (error instanceof Error && files.length > saved.length) {
        throw new ActivityError(400, "INVALID_RECAP_IMAGES", error.message);
      }
      throw error;
    }
  }
  if (method === "POST" && path.length === 3 && first === "activities" && third === "publish") {
    const actor = await activityActor(request, { manage: true, write: true });
    limitWrites(actor);
    return json(await publishActivity(second, actor));
  }
  if (method === "POST" && path.length === 3 && first === "activities" && third === "cancel") {
    const actor = await activityActor(request, { manage: true, write: true });
    limitWrites(actor);
    return json(await cancelActivity(second, actor));
  }
  if (method === "DELETE" && path.length === 2 && first === "activities") {
    const actor = await activityActor(request, { manage: true, write: true });
    limitWrites(actor);
    await deleteActivity(second, actor);
    return new NextResponse(null, { status: 204, headers });
  }
  if (method === "POST" && path.length === 3 && first === "activities" && third === "registration") {
    const actor = await activityActor(request, { write: true });
    limitWrites(actor);
    return json(await registerForActivity(second, actor));
  }
  if (method === "DELETE" && path.length === 3 && first === "activities" && third === "registration") {
    const actor = await activityActor(request, { write: true });
    limitWrites(actor);
    return json(await cancelActivityRegistration(second, actor));
  }

  throw new ActivityError(404, "ROUTE_NOT_FOUND", "接口不存在。");
}

async function handle(request: Request): Promise<NextResponse> {
  try {
    return await run(request);
  } catch (error) {
    if (error instanceof ActivityError) return json({ code: error.code, error: error.message }, error.status);
    if (error instanceof PluginSubmissionError) return json({ code: error.code, error: error.message }, error.status);
    console.error("Club activity API failed:", error);
    return json({ code: "INTERNAL_ERROR", error: "服务暂时不可用。" }, 500);
  }
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;
