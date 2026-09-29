import { randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  MAX_PROJECT_COVER_BYTES,
  normalizeProjectCover,
  STORAGE_ROOT,
} from "@/lib/site/api-helpers";

const ACTIVITY_COVER_DIR = join(STORAGE_ROOT, "uploads", "activities");
const STORAGE_KEY_PATTERN = /^\d+-[a-f0-9]{16}\.jpg$/;

export type StoredActivityCover = {
  storageKey: string;
  originalName: string;
  mimeType: "image/jpeg";
  size: number;
};

export async function saveActivityCover(file: File): Promise<StoredActivityCover> {
  if (file.size > MAX_PROJECT_COVER_BYTES) throw new Error("图片大小不能超过 5MB。");
  const bytes = Buffer.from(await file.arrayBuffer());
  const normalized = await normalizeProjectCover(bytes, file.type);
  await mkdir(ACTIVITY_COVER_DIR, { recursive: true });
  const storageKey = `${Date.now()}-${randomBytes(8).toString("hex")}.jpg`;
  await writeFile(join(ACTIVITY_COVER_DIR, storageKey), normalized.buffer, { flag: "wx" });
  return {
    storageKey,
    originalName: (file.name || "activity-cover.jpg").slice(0, 255),
    mimeType: normalized.mimeType,
    size: normalized.size,
  };
}

export async function readActivityCover(storageKey: string): Promise<Buffer> {
  if (!STORAGE_KEY_PATTERN.test(storageKey)) throw new Error("封面存储键无效。");
  return readFile(join(ACTIVITY_COVER_DIR, storageKey));
}

export async function removeActivityCover(storageKey: string): Promise<void> {
  if (!STORAGE_KEY_PATTERN.test(storageKey)) return;
  try {
    await unlink(join(ACTIVITY_COVER_DIR, storageKey));
  } catch {
    // A failed database update should not hide its original error.
  }
}
