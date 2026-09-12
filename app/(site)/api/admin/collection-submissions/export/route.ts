/**
 * GET /api/admin/collection-submissions/export
 * CSV export of submissions (honors the same type/status/search filters the
 * list endpoint accepts). Payload keys are flattened to `field_*` columns;
 * arrays join with ", "; each cell is formula-neutralized and the body is BOM
 * prefixed for Excel.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/site/prisma";
import {
  collectionWhere,
  csvDownloadHeaders,
  csvStringify,
  requireAdminAccess,
  sanitizeCsvCell,
} from "@/lib/site/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const baseFields = [
  "id",
  "type",
  "status",
  "displayName",
  "contact",
  "phone",
  "email",
  "consent",
  "createdAt",
  "updatedAt",
];

export async function GET(request: Request): Promise<NextResponse> {
  const authorization = request.headers.get("authorization") ?? "";
  const denied = await requireAdminAccess(authorization);
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const query: Record<string, string> = {};
    for (const key of ["type", "status", "search"]) {
      const value = searchParams.get(key);
      if (value !== null) query[key] = value;
    }

    const submissions = await prisma.collectionSubmission.findMany({
      where: collectionWhere(query),
      orderBy: { createdAt: "desc" },
    });

    const csvData = submissions.map(submission => {
      let payload: Record<string, unknown> = {};
      try {
        payload = JSON.parse(submission.payloadJson);
      } catch {
        payload = {};
      }
      const row: Record<string, unknown> = {
        id: submission.id,
        type: submission.type,
        status: submission.status,
        displayName: submission.displayName,
        contact: submission.contact,
        phone: submission.phone || "",
        email: submission.email || "",
        consent: submission.consent,
        createdAt: submission.createdAt.toISOString(),
        updatedAt: submission.updatedAt.toISOString(),
      };
      for (const [key, value] of Object.entries(payload)) {
        row[`field_${key}`] = Array.isArray(value) ? value.join(", ") : value;
      }
      return Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key, sanitizeCsvCell(value)])
      );
    });

    const fields = csvData.length
      ? Array.from(new Set(csvData.flatMap(row => Object.keys(row))))
      : baseFields;

    const csv = csvStringify(csvData, fields);
    const csvBody = `﻿${csv}`; // BOM prefix fixes Chinese encoding in Excel
    return new NextResponse(csvBody, {
      headers: csvDownloadHeaders("collection-submissions.csv"),
    });
  } catch (error) {
    console.error("Export collection submissions error:", error);
    return new NextResponse("Export failed", { status: 500 });
  }
}
