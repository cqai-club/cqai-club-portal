import { randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import sharp from "sharp";

import { ActivityError, type ActivityActor } from "@/lib/club-activities";
import { ACTIVITY_CONTENT_IMAGE_TYPES, MAX_ACTIVITY_CONTENT_IMAGE_BYTES } from "@/lib/club-activity-content-image-config";
import { MAX_PROJECT_COVER_INPUT_PIXELS, STORAGE_ROOT } from "@/lib/site/api-helpers";
import { prisma } from "@/lib/site/prisma";

const CONTENT_IMAGE_DIR = join(STORAGE_ROOT, "uploads", "activities", "content");
const STORAGE_KEY_PATTERN = /^\d+-[a-f0-9]{16}\.jpg$/;

export const activityContentImageUrl = (id: string) => `/api/v1/activity-content-images/${encodeURIComponent(id)}`;

export async function createActivityContentImage(file: File, actor: ActivityActor) {
  if (!file.size) throw new ActivityError(400, "INVALID_CONTENT_IMAGE", "图片不能为空。");
  if (file.size > MAX_ACTIVITY_CONTENT_IMAGE_BYTES) {
    throw new ActivityError(413, "BODY_TOO_LARGE", "图片大小不能超过 5MB。");
  }
  if (!(ACTIVITY_CONTENT_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    throw new ActivityError(400, "INVALID_CONTENT_IMAGE", "仅支持 JPG、PNG 或 WebP 图片。");
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  let normalized: Buffer;
  try {
    const image = sharp(bytes, {
      failOn: "warning",
      limitInputPixels: MAX_PROJECT_COVER_INPUT_PIXELS,
      sequentialRead: true,
    });
    const metadata = await image.metadata();
    const decodedMime = metadata.format === "jpeg" ? "image/jpeg"
      : metadata.format === "png" ? "image/png"
        : metadata.format === "webp" ? "image/webp" : null;
    if (decodedMime !== file.type || !metadata.width || !metadata.height || (metadata.pages ?? 1) !== 1) {
      throw new Error("Invalid image format");
    }
    normalized = await image.autoOrient()
      .resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 84, mozjpeg: true })
      .toBuffer();
  } catch {
    throw new ActivityError(400, "INVALID_CONTENT_IMAGE", "图片无法读取，请使用有效的 JPG、PNG 或 WebP 图片。");
  }

  await mkdir(CONTENT_IMAGE_DIR, { recursive: true });
  const storageKey = `${Date.now()}-${randomBytes(8).toString("hex")}.jpg`;
  await writeFile(join(CONTENT_IMAGE_DIR, storageKey), normalized, { flag: "wx" });
  try {
    const image = await prisma.clubActivityContentImage.create({
      data: {
        storageKey,
        originalName: (file.name || "activity-image.jpg").slice(0, 255),
        mimeType: "image/jpeg",
        size: normalized.length,
        createdByIssuer: actor.issuer,
        createdBySub: actor.sub,
      },
    });
    return {
      id: image.id,
      url: activityContentImageUrl(image.id),
      originalName: image.originalName,
      mimeType: image.mimeType,
      size: image.size,
    };
  } catch (error) {
    await unlink(join(CONTENT_IMAGE_DIR, storageKey)).catch(() => undefined);
    throw error;
  }
}

export async function readActivityContentImage(storageKey: string): Promise<Buffer> {
  if (!STORAGE_KEY_PATTERN.test(storageKey)) throw new Error("正文图片存储键无效。");
  return readFile(join(CONTENT_IMAGE_DIR, storageKey));
}

function referencesImage(content: string, path: string, origins: string[]): boolean {
  // Match complete relative URLs and URLs on this site, including Markdown
  // destinations and reference definitions, without accepting an ID prefix.
  return [path, ...origins.map(origin => `${origin}${path}`)].some(url => {
    let position = content.indexOf(url);
    while (position !== -1) {
      const before = content[position - 1];
      const after = content[position + url.length];
      if ((!before || /[\s(<"'=]/.test(before)) && (!after || /[\s)\]>"'?#]/.test(after))) return true;
      position = content.indexOf(url, position + url.length);
    }
    return false;
  });
}

export async function isActivityContentImagePublic(id: string, origins: string[], now = new Date()): Promise<boolean> {
  const path = activityContentImageUrl(id);
  const candidates = await prisma.clubActivity.findMany({
    where: {
      deletedAt: null,
      OR: [
        { status: { in: ["published", "cancelled"] }, content: { contains: path } },
        { status: "published", endsAt: { lte: now }, recapPublishedAt: { not: null }, recapContent: { contains: path } },
      ],
    },
    select: { status: true, content: true, recapContent: true, recapPublishedAt: true, endsAt: true },
  });
  return candidates.some(activity => referencesImage(activity.content, path, origins) || (
    activity.status === "published" && activity.endsAt <= now && activity.recapPublishedAt !== null &&
    referencesImage(activity.recapContent || "", path, origins)
  ));
}
