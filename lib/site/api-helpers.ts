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
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { extname, join } from "node:path";

import { requireMemberAdminPermission } from "@/lib/member/permissions";
import { NextResponse } from "next/server";
import xss from "xss";

export const STORAGE_ROOT = join(process.cwd(), "storage");
export const COLLECTION_UPLOAD_DIR = join(STORAGE_ROOT, "uploads", "collection");

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

/**
 * Protect an admin API with a permission scope granted on the CQAI API
 * resource. The legacy standalone admin token is not an authorization
 * bypass for these APIs.
 */
export const requireAdminAccess = async (
  _authorization: string,
  requiredPermission?: string
): Promise<NextResponse | null> => {
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
 * Manually persist the uploaded image files (avatar / companyLogo) into
 * storage/uploads/collection and return the asset rows to create. Matches the
 * multer filename scheme: `<timestamp>-<random hex><lowercased extension>`.
 * Fails closed: any invalid upload aborts (after cleaning up earlier writes)
 * with the human-facing message.
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
  ] as const) {
    const file = formData.get(fieldName);
    if (!file || typeof file === "string") continue;

    const originalName = (file as File).name;
    const mimeType = (file as File).type;
    if (!["image/jpeg", "image/png"].includes(mimeType)) {
      await cleanupWritten();
      throw new Error("仅支持 JPG 或 PNG 图片。");
    }

    const buffer = Buffer.from(await (file as File).arrayBuffer());
    if (buffer.length > 5 * 1024 * 1024) {
      await cleanupWritten();
      throw new Error("图片大小不能超过 5MB。");
    }

    const storageKey = await writeUploadedFile(buffer, originalName);
    assets.push({
      kind,
      storageKey,
      originalName,
      mimeType,
      size: buffer.length,
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
  };
};

/**
 * Persist an already-loaded uploaded image to disk under a multer-style
 * filename. Returns the storage key used. (Uploaded assets are written via
 * `saveUploadedAssets`; this small helper is the write primitive it uses.)
 */
export const writeUploadedFile = async (
  buffer: Buffer,
  originalName: string
): Promise<string> => {
  await mkdir(COLLECTION_UPLOAD_DIR, { recursive: true });
  const extension = extname(originalName || "").toLowerCase() || ".jpg";
  const storageKey = `${Date.now()}-${randomBytes(8).toString("hex")}${extension}`;
  await writeFile(join(COLLECTION_UPLOAD_DIR, storageKey), buffer);
  return storageKey;
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
  if (rateBuckets.size >= RATE_MAX_BUCKETS) {
    const now = Date.now();
    for (const [key, bucket] of rateBuckets) {
      if (bucket.resetAt <= now) rateBuckets.delete(key);
    }
  }

  const key = `${scope}:${ip}`;
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= max;
};
