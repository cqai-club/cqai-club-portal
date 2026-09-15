/**
 * Shared helpers for the club official-site API route handlers
 * (member application + content collection + admin dashboard).
 *
 * Semantics mirror the original Express `index.js`; only the transport is
 * Next route-handler native. Rate limiting, admin sessions, sanitization and
 * CSV helpers live here so every `/api/admin/*` and collection route stays
 * consistent.
 */

import { randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";

import { requireMemberAdminPermission } from "@/lib/member/permissions";
import { NextResponse } from "next/server";
import sharp from "sharp";
import xss from "xss";

export const STORAGE_ROOT = process.env.CQAI_STORAGE_ROOT?.trim()
  ? resolve(/* turbopackIgnore: true */ process.cwd(), process.env.CQAI_STORAGE_ROOT.trim())
  : join(process.cwd(), "storage");
export const COLLECTION_UPLOAD_DIR = join(STORAGE_ROOT, "uploads", "collection");
export const PROJECT_UPLOAD_DIR = join(STORAGE_ROOT, "uploads", "projects");
const BUNDLED_PROJECT_COVER_DIR = join(process.cwd(), "site", "images");
export const MAX_PROJECT_COVER_BYTES = 5 * 1024 * 1024;
export const PROJECT_COVER_WIDTH = 1600;
export const PROJECT_COVER_HEIGHT = 1000;
export const MAX_PROJECT_COVER_INPUT_PIXELS = 40_000_000;

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const adminSessions = new Map<string, number>();

const safeEqual = (left: unknown, right: unknown): boolean => {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
};

/** @returns a fresh admin session token, or null when admin is misconfigured. */
export const createAdminSession = (): string | null => {
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) return null;
  const token = randomBytes(32).toString("hex");
  adminSessions.set(token, Date.now() + ADMIN_SESSION_TTL_MS);
  return token;
};

export const adminLoginValid = (username: unknown, password: unknown): boolean =>
  safeEqual(String(username ?? ""), ADMIN_USERNAME) &&
  safeEqual(String(password ?? ""), ADMIN_PASSWORD);

export const isAdminConfigured = (): boolean => Boolean(ADMIN_USERNAME && ADMIN_PASSWORD);

export const isAdminTokenValid = (authorization: string): boolean => {
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return false;
  const expiresAt = adminSessions.get(token);
  if (!expiresAt || expiresAt <= Date.now()) {
    adminSessions.delete(token);
    return false;
  }
  return true;
};

/** True when `authorization` carries a live admin session token. */
export const requireAdminToken = (authorization: string): boolean =>
  isAdminTokenValid(authorization);

/** Resolve the address written by the trusted loopback reverse proxy. */
export const trustedClientIp = (request: Request): string =>
  request.headers.get("x-real-ip")?.trim() ||
  request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ||
  "unknown";

/**
 * Protect an admin API with a permission scope granted on the CQAI API
 * resource. The legacy standalone admin token is not an authorization
 * bypass for these APIs.
 */
export const requireAdminAccess = async (
  authorization: string,
  requiredPermission?: string
): Promise<NextResponse | null> => {
  // The smoke suite exercises the complete admin lifecycle without depending
  // on a long-lived real Logto browser session. This seam is inert unless the
  // child server is explicitly started as CI with fresh per-run tokens.
  if (
    process.env.CI === "true" &&
    process.env.CQAI_CI_AUTH_BYPASS === "enabled-for-smoke-tests"
  ) {
    const adminToken = process.env.CQAI_CI_ADMIN_TOKEN;
    const authenticatedToken = process.env.CQAI_CI_AUTHENTICATED_TOKEN;
    if (adminToken && safeEqual(authorization, `Bearer ${adminToken}`)) {
      return null;
    }
    if (authenticatedToken && safeEqual(authorization, `Bearer ${authenticatedToken}`)) {
      return NextResponse.json(
        { error: `您没有 ${requiredPermission ?? "member:admin"} 权限。` },
        { status: 403 }
      );
    }
  }

  return requireMemberAdminPermission(requiredPermission);
};

// ---------------------------------------------------------------------------
// Sanitization
// ---------------------------------------------------------------------------

/**
 * Escape xss in strings or arrays/objects. Mirrors the original `sanitizeData`.
 * Runs over parsed JSON/form bodies before they are stored or echoed back.
 */
export const sanitizeData = <T>(data: T): T => {
  if (typeof data === "string") return xss(data) as T;
  if (Array.isArray(data)) return data.map(sanitizeData) as T;
  if (data !== null && typeof data === "object") {
    const clean: Record<string, unknown> = {};
    for (const key in data as Record<string, unknown>) {
      clean[key] = sanitizeData((data as Record<string, unknown>)[key]);
    }
    return clean as T;
  }
  return data;
};

/**
 * Prevent spreadsheet programs from interpreting user-controlled CSV cells as
 * formulas.
 */
export const sanitizeCsvCell = (value: unknown): unknown => {
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(value)) {
    return `'${value}`;
  }
  return value;
};

// ---------------------------------------------------------------------------
// Collection validation constants + upload helpers
// ---------------------------------------------------------------------------

export const collectionTypes = new Set(["member", "enterprise", "project"]);
export const collectionStatuses = new Set(["new", "reviewing", "approved", "rejected"]);

export const collectionRequiredFields: Record<
  string,
  string[]
> = {
  member: ["name", "identity", "bio"],
  enterprise: ["company", "companyBio", "business", "products", "website", "contact"],
  project: ["projectName", "owner", "oneLine", "stage", "projectFocus", "projectBio", "projectContact"],
};

export interface CollectionUpload {
  /** Sanitized field data, with `type`/`consent` removed. */
  payload: Record<string, string>;
  type: string;
  consent: boolean;
}

/**
 * Parse an uploaded FormData collection submission into the trimmed payload +
 * consent flag the rest of the handler expects. Mirrors
 * `collectionPayloadFromRequest` from the Express app. File parts (avatar /
 * companyLogo) are handled separately and deliberately excluded from the
 * payload object.
 */
export const collectionPayloadFromFormData = (
  formData: FormData
): CollectionUpload => {
  const textFields: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") textFields[key] = value;
  }
  const cleanBody = sanitizeData(textFields);
  const type = cleanBody.type;
  const payload = { ...cleanBody };
  delete payload.type;
  delete payload.consent;
  return {
    type,
    payload,
    consent: cleanBody.consent === "true" || cleanBody.consent === "on",
  };
};

/**
 * Persist uploaded avatar / companyLogo / projectCover images into collection
 * storage and return the asset rows to create. Project covers are normalized;
 * avatars and logos retain their validated original bytes. Fails closed: any
 * invalid upload aborts after cleaning up earlier writes.
 */
export const saveUploadedAssets = async (
  formData: FormData
): Promise<{ kind: string; storageKey: string; originalName: string; mimeType: string; size: number }[]> => {
  await mkdir(COLLECTION_UPLOAD_DIR, { recursive: true });

  const assets: {
    kind: string;
    storageKey: string;
    originalName: string;
    mimeType: string;
    size: number;
  }[] = [];

  const cleanupWritten = (): Promise<void> => removeUploadedAssets(assets);

  for (const [fieldName, kind] of [
    ["avatar", "avatar"],
    ["companyLogo", "companyLogo"],
    ["projectCover", "projectCover"],
  ] as const) {
    const file = formData.get(fieldName);
    if (!file || typeof file === "string") continue;

    const originalName = (file as File).name;
    const mimeType = (file as File).type.toLowerCase();
    if (!["image/jpeg", "image/png"].includes(mimeType)) {
      await cleanupWritten();
      throw new Error("仅支持 JPG 或 PNG 图片。");
    }
    if ((file as File).size > MAX_PROJECT_COVER_BYTES) {
      await cleanupWritten();
      throw new Error("图片大小不能超过 5MB。");
    }

    const buffer: Buffer = Buffer.from(await (file as File).arrayBuffer());
    if (buffer.length > MAX_PROJECT_COVER_BYTES) {
      await cleanupWritten();
      throw new Error("图片大小不能超过 5MB。");
    }
    const detectedMime = detectImageMimeType(buffer);
    if (!buffer.length || detectedMime !== mimeType) {
      await cleanupWritten();
      throw new Error("图片内容与 JPG/PNG 格式不符。");
    }

    let storedBuffer = buffer;
    let storedMime = detectedMime;
    if (kind === "projectCover") {
      try {
        const normalized = await normalizeProjectCover(buffer, detectedMime);
        storedBuffer = normalized.buffer;
        storedMime = normalized.mimeType;
      } catch (error) {
        await cleanupWritten();
        throw error;
      }
    }

    const storageKey = await writeUploadedFile(storedBuffer, storedMime);
    assets.push({
      kind,
      storageKey,
      originalName,
      mimeType: storedMime,
      size: storedBuffer.length,
    });
  }

  return assets;
};

/**
 * Best-effort remove of uploaded asset files (used when a later DB step fails
 * after files were already written, mirroring the Express `cleanupUploadedFiles`).
 */
export const removeUploadedAssets = async (
  assets: { storageKey: string }[]
): Promise<void> => {
  for (const asset of assets) {
    try {
      await unlink(join(COLLECTION_UPLOAD_DIR, asset.storageKey));
    } catch {
      // Ignore cleanup failures after a rejected submission.
    }
  }
};

// ---------------------------------------------------------------------------
// Serialization / filtering helpers shared with the collection admin routes
// ---------------------------------------------------------------------------

export const collectionDisplayFields: Record<
  string,
  {
    displayName: (payload: Record<string, unknown>) => unknown;
    contact: (payload: Record<string, unknown>) => unknown;
    phone: (payload: Record<string, unknown>) => string | undefined;
    email: (payload: Record<string, unknown>) => unknown;
  }
> = {
  member: {
    displayName: payload => payload.name,
    contact: payload => payload.phone || payload.profileUrl || "未提供",
    phone: payload => (payload.phone as string) || undefined,
    email: payload => payload.email,
  },
  enterprise: {
    displayName: payload => payload.company,
    contact: payload => payload.contact,
    phone: () => undefined,
    email: payload => payload.email,
  },
  project: {
    displayName: payload => payload.projectName,
    contact: payload => payload.projectContact,
    phone: payload =>
      /^1[3-9]\d{9}$/.test((payload.projectContact as string) || "")
        ? (payload.projectContact as string)
        : undefined,
    email: payload => payload.email,
  },
};

export const collectionWhere = (query: Record<string, string>) => {
  const { type, status, search } = query;
  const filters: Record<string, unknown>[] = [];
  if (collectionTypes.has(type)) filters.push({ type });
  if (collectionStatuses.has(status)) filters.push({ status });
  if (typeof search === "string" && search.trim()) {
    const term = search.trim();
    filters.push({
      OR: [
        { displayName: { contains: term } },
        { contact: { contains: term } },
        { phone: { contains: term } },
        { email: { contains: term } },
      ],
    });
  }
  return filters.length ? { AND: filters } : {};
};

export const parsePositiveInteger = (
  value: string | null,
  fallback: number,
  maximum: number
): number => {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
};

/**
 * Serialize a CollectionSubmission row (plus its assets) into the JSON shape
 * the admin UI consumes. Mirrors `serializeCollectionSubmission`.
 */
export const serializeCollectionSubmission = (submission: {
  id: string;
  type: string;
  status: string;
  displayName: string;
  contact: string;
  phone: string | null;
  email: string | null;
  payloadJson: string;
  consent: boolean;
  consentAt: Date | null;
  ipAddress: string | null;
  createdAt: Date;
  updatedAt: Date;
  assets?: {
    id: string;
    kind: string;
    originalName: string;
    mimeType: string;
    size: number;
    createdAt: Date;
  }[];
  importedProject?: {
    id: string;
    slug: string;
    status: string;
    name: string;
    updatedAt: Date;
  } | null;
}) => {
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(submission.payloadJson);
  } catch {
    payload = {};
  }
  return {
    id: submission.id,
    type: submission.type,
    status: submission.status,
    displayName: submission.displayName,
    contact: submission.contact,
    phone: submission.phone,
    email: submission.email,
    payload,
    consent: submission.consent,
    consentAt: submission.consentAt,
    ipAddress: submission.ipAddress,
    createdAt: submission.createdAt,
    updatedAt: submission.updatedAt,
    assets: (submission.assets || []).map(asset => ({
      id: asset.id,
      kind: asset.kind,
      originalName: asset.originalName,
      mimeType: asset.mimeType,
      size: asset.size,
      createdAt: asset.createdAt,
      downloadUrl: `/api/admin/collection-submissions/${submission.id}/assets/${asset.id}`,
    })),
    importedProject: submission.importedProject
      ? {
          id: submission.importedProject.id,
          slug: submission.importedProject.slug,
          status: submission.importedProject.status,
          name: submission.importedProject.name,
          updatedAt: submission.importedProject.updatedAt.toISOString(),
        }
      : null,
  };
};

/**
 * Persist an already-loaded uploaded image to disk under a multer-style
 * filename. Returns the storage key used. (Uploaded assets are written via
 * `saveUploadedAssets`; this small helper is the write primitive it uses.)
 */
export const writeUploadedFile = async (
  buffer: Buffer,
  mimeType: "image/jpeg" | "image/png"
): Promise<string> => {
  await mkdir(COLLECTION_UPLOAD_DIR, { recursive: true });
  const extension = mimeType === "image/png" ? ".png" : ".jpg";
  const storageKey = `${Date.now()}-${randomBytes(8).toString("hex")}${extension}`;
  await writeFile(join(COLLECTION_UPLOAD_DIR, storageKey), buffer);
  return storageKey;
};

export interface StoredProjectCover {
  storageKey: string;
  originalName: string;
  mimeType: "image/jpeg" | "image/png";
  size: number;
}

interface NormalizedProjectCover {
  buffer: Buffer;
  mimeType: "image/jpeg";
  size: number;
}

/** Detect the image type from its signature instead of trusting browser MIME. */
export const detectImageMimeType = (
  buffer: Uint8Array
): StoredProjectCover["mimeType"] | null => {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "image/jpeg";
  }
  return null;
};

/**
 * Fully decode and normalize an untrusted project cover before it reaches
 * project storage. Re-encoding also removes EXIF/GPS and ancillary metadata.
 */
export const normalizeProjectCover = async (
  buffer: Buffer,
  declaredMime?: string
): Promise<NormalizedProjectCover> => {
  if (!buffer.length) throw new Error("封面图片内容为空。");
  if (buffer.length > MAX_PROJECT_COVER_BYTES) {
    throw new Error("图片大小不能超过 5MB。");
  }

  const detectedMime = detectImageMimeType(buffer);
  if (
    !detectedMime ||
    (declaredMime && declaredMime.toLowerCase() !== detectedMime)
  ) {
    throw new Error("仅支持内容有效的 JPG 或 PNG 图片。");
  }

  let output: Buffer;
  try {
    const image = sharp(buffer, {
      failOn: "warning",
      limitInputPixels: MAX_PROJECT_COVER_INPUT_PIXELS,
      sequentialRead: true,
    });
    const metadata = await image.metadata();
    const decodedMime = metadata.format === "jpeg"
      ? "image/jpeg"
      : metadata.format === "png"
        ? "image/png"
        : null;
    if (
      decodedMime !== detectedMime ||
      !metadata.width ||
      !metadata.height ||
      (metadata.pages ?? 1) !== 1
    ) {
      throw new Error("invalid project cover metadata");
    }

    output = await image
      .autoOrient()
      .resize(PROJECT_COVER_WIDTH, PROJECT_COVER_HEIGHT, {
        fit: "cover",
        position: "centre",
      })
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .jpeg({
        quality: 82,
        progressive: true,
        mozjpeg: true,
      })
      .toBuffer();
  } catch {
    throw new Error("封面图片无法完整解码，请重新导出 JPG 或 PNG 后上传。");
  }

  if (!output.length || output.length > MAX_PROJECT_COVER_BYTES) {
    throw new Error("压缩后的封面图片不能超过 5MB。");
  }

  // Fail closed if a future Sharp/configuration change stops honoring the
  // canonical output contract.
  try {
    const metadata = await sharp(output, {
      failOn: "warning",
      limitInputPixels: MAX_PROJECT_COVER_INPUT_PIXELS,
    }).metadata();
    if (
      metadata.format !== "jpeg" ||
      metadata.width !== PROJECT_COVER_WIDTH ||
      metadata.height !== PROJECT_COVER_HEIGHT
    ) {
      throw new Error("invalid normalized project cover");
    }
  } catch {
    throw new Error("封面图片处理失败，请稍后重试。");
  }

  return {
    buffer: output,
    mimeType: "image/jpeg",
    size: output.length,
  };
};

/** Validate and persist an admin/imported project cover. */
export const saveProjectCover = async (file: File): Promise<StoredProjectCover> => {
  if (file.size > MAX_PROJECT_COVER_BYTES) {
    throw new Error("图片大小不能超过 5MB。");
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  if (!buffer.length) throw new Error("请选择有效的封面图片。");
  if (buffer.length > MAX_PROJECT_COVER_BYTES) {
    throw new Error("图片大小不能超过 5MB。");
  }

  const detectedMime = detectImageMimeType(buffer);
  const declaredMime = file.type.toLowerCase();
  if (!detectedMime || detectedMime !== declaredMime) {
    throw new Error("仅支持内容有效的 JPG 或 PNG 图片。");
  }

  return persistProjectCover(buffer, file.name || `cover.${detectedMime === "image/png" ? "png" : "jpg"}`, detectedMime);
};

/** Persist validated bytes into the dedicated project-cover directory. */
export const persistProjectCover = async (
  buffer: Buffer,
  originalName: string,
  declaredMime?: string
): Promise<StoredProjectCover> => {
  const normalized = await normalizeProjectCover(buffer, declaredMime);

  await mkdir(PROJECT_UPLOAD_DIR, { recursive: true });
  const storageKey = `${Date.now()}-${randomBytes(8).toString("hex")}.jpg`;
  await writeFile(join(PROJECT_UPLOAD_DIR, storageKey), normalized.buffer);
  return {
    storageKey,
    originalName,
    mimeType: normalized.mimeType,
    size: normalized.size,
  };
};

/** Read a project cover from persistent uploads or from the six bundled seeds. */
export const readProjectCover = async (storageKey: string): Promise<Buffer> => {
  if (storageKey.startsWith("bundled:")) {
    const filename = storageKey.slice("bundled:".length);
    if (!/^project-[1-6]\.jpg$/.test(filename)) throw new Error("封面存储键无效。");
    return readFile(join(BUNDLED_PROJECT_COVER_DIR, filename));
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(storageKey)) {
    throw new Error("封面存储键无效。");
  }
  return readFile(join(PROJECT_UPLOAD_DIR, storageKey));
};

/** Remove an uploaded project cover, while preserving bundled seed images. */
export const removeProjectCover = async (storageKey: string | null | undefined): Promise<void> => {
  if (!storageKey || storageKey.startsWith("bundled:")) return;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(storageKey)) return;
  try {
    await unlink(join(PROJECT_UPLOAD_DIR, storageKey));
  } catch {
    // Replacements are already committed at this point; stale-file cleanup is best effort.
  }
};

// ---------------------------------------------------------------------------
// CSV output
// ---------------------------------------------------------------------------

const csvEscapeCell = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

/**
 * Minimal CSV stringifier (replaces the dropped json2csv dependency). When
 * `fields` is omitted the column set is the union of each row's keys in
 * appearance order, matching json2csv's default behavior.
 */
export const csvStringify = (
  rows: Record<string, unknown>[],
  fields?: string[]
): string => {
  const columns =
    fields ?? Array.from(new Set(rows.flatMap(row => Object.keys(row))));
  const header = columns.map(csvEscapeCell).join(",");
  const lines = rows.map(row =>
    columns.map(column => csvEscapeCell(row[column])).join(",")
  );
  return [header, ...lines].join("\r\n");
};

/**
 * Build a `Response`-compatible headers object for a CSV export download
 * (BOM prefix handled by the caller so streaming stays simple).
 */
export const csvDownloadHeaders = (filename: string): HeadersInit => {
  return {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
  };
};// ---------------------------------------------------------------------------
// In-memory rate limiter
// ---------------------------------------------------------------------------

interface RateBucket {
  count: number;
  resetAt: number;
}

/** LRU-ish Map keyed by `scope:ip`; bounded so it cannot grow unboundedly. */
const rateBuckets = new Map<string, RateBucket>();
const RATE_MAX_BUCKETS = 10_000;

/**
 * Simple sliding-window-free fixed-window limiter mirroring the original
 * express-rate-limit semantics: each IP may make `max` requests per
 * `windowMs`. Pure in-memory (like the Express version), resets on restart.
 */
export const rateLimit = (
  scope: string,
  ip: string,
  max: number,
  windowMs: number
): boolean => {
  const key = `${scope}:${ip}`;
  const now = Date.now();
  const existing = rateBuckets.get(key);
  if (existing && existing.resetAt > now) {
    existing.count += 1;
    return existing.count <= max;
  }
  if (existing) rateBuckets.delete(key);

  if (rateBuckets.size >= RATE_MAX_BUCKETS) {
    for (const [bucketKey, bucket] of rateBuckets) {
      if (bucket.resetAt <= now) rateBuckets.delete(bucketKey);
    }
  }
  if (rateBuckets.size >= RATE_MAX_BUCKETS) {
    const oldestKey = rateBuckets.keys().next().value;
    if (typeof oldestKey === "string") rateBuckets.delete(oldestKey);
  }

  rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
  return true;
};
