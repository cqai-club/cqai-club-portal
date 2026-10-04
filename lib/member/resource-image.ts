import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { MAX_PROJECT_COVER_BYTES, MAX_PROJECT_COVER_INPUT_PIXELS, STORAGE_ROOT } from "@/lib/site/api-helpers";
import { MemberSessionError } from "./session";

const directory = join(STORAGE_ROOT, "uploads", "resources");
const keyPattern = /^\d+-[a-f0-9]{16}\.jpg$/;

export async function saveResourceImage(file: File): Promise<string> {
  if (!file.size || file.size > MAX_PROJECT_COVER_BYTES) {
    throw new MemberSessionError(400, "INVALID_IMAGE", "请选择不超过 5MB 的 JPG 或 PNG 图片。");
  }
  let buffer: Buffer;
  try {
    const image = sharp(Buffer.from(await file.arrayBuffer()), { failOn: "warning", limitInputPixels: MAX_PROJECT_COVER_INPUT_PIXELS, sequentialRead: true });
    const metadata = await image.metadata();
    const mime = metadata.format === "jpeg" ? "image/jpeg" : metadata.format === "png" ? "image/png" : null;
    if (!mime || mime !== file.type || !metadata.width || !metadata.height || (metadata.pages ?? 1) !== 1) throw new Error("Invalid image");
    buffer = await image.autoOrient().resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
  } catch {
    throw new MemberSessionError(400, "INVALID_IMAGE", "图片无效，请使用 JPG 或 PNG 图片。");
  }
  await mkdir(directory, { recursive: true });
  const key = `${Date.now()}-${randomBytes(8).toString("hex")}.jpg`;
  await writeFile(join(directory, key), buffer, { flag: "wx" });
  return key;
}

export async function readResourceImage(key: string) {
  if (!keyPattern.test(key)) throw new Error("Invalid resource image key");
  return readFile(join(directory, key));
}

export async function removeResourceImage(key: string) {
  if (!keyPattern.test(key)) return;
  try { await unlink(join(directory, key)); } catch { /* Best-effort cleanup after database commit. */ }
}
