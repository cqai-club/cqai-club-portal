import { randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import sharp from "sharp";

import { MAX_RECAP_IMAGE_BYTES } from "@/lib/club-activity-recap-config";
import { MAX_PROJECT_COVER_INPUT_PIXELS, STORAGE_ROOT } from "@/lib/site/api-helpers";

const RECAP_IMAGE_DIR = join(STORAGE_ROOT, "uploads", "activities", "recaps");
const STORAGE_KEY_PATTERN = /^\d+-[a-f0-9]{16}\.jpg$/;

export type StoredRecapImage = {
  storageKey: string;
  originalName: string;
  mimeType: "image/jpeg";
  size: number;
};

export async function saveRecapImage(file: File): Promise<StoredRecapImage> {
  if (!file.size || file.size > MAX_RECAP_IMAGE_BYTES) throw new Error("每张图片须小于 5MB。");
  if (file.type !== "image/jpeg" && file.type !== "image/png") throw new Error("仅支持 JPG 或 PNG 图片。");

  const bytes = Buffer.from(await file.arrayBuffer());
  let normalized: Buffer;
  try {
    const image = sharp(bytes, {
      failOn: "warning",
      limitInputPixels: MAX_PROJECT_COVER_INPUT_PIXELS,
      sequentialRead: true,
    });
    const metadata = await image.metadata();
    const decodedMime = metadata.format === "jpeg" ? "image/jpeg" : metadata.format === "png" ? "image/png" : null;
    if (decodedMime !== file.type || !metadata.width || !metadata.height || (metadata.pages ?? 1) !== 1) {
      throw new Error("图片格式无效。");
    }
    normalized = await image
      .autoOrient()
      .resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 84, mozjpeg: true })
      .toBuffer();
  } catch {
    throw new Error("图片无法读取，请使用有效的 JPG 或 PNG 图片。");
  }

  await mkdir(RECAP_IMAGE_DIR, { recursive: true });
  const storageKey = `${Date.now()}-${randomBytes(8).toString("hex")}.jpg`;
  await writeFile(join(RECAP_IMAGE_DIR, storageKey), normalized, { flag: "wx" });
  return {
    storageKey,
    originalName: (file.name || "activity-recap.jpg").slice(0, 255),
    mimeType: "image/jpeg",
    size: normalized.length,
  };
}

export async function readRecapImage(storageKey: string): Promise<Buffer> {
  if (!STORAGE_KEY_PATTERN.test(storageKey)) throw new Error("回顾图片存储键无效。");
  return readFile(join(RECAP_IMAGE_DIR, storageKey));
}

export async function removeRecapImage(storageKey: string): Promise<void> {
  if (!STORAGE_KEY_PATTERN.test(storageKey)) return;
  try {
    await unlink(join(RECAP_IMAGE_DIR, storageKey));
  } catch {
    // Keep the database error as the primary failure; orphaned files can be cleaned separately.
  }
}
