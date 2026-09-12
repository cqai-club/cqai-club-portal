/**
 * GET /api/admin/members/export
 * CSV export of all member applications, newest first. Every cell is passed
 * through `sanitizeCsvCell` so spreadsheet programs never interpret a
 * user-controlled value (`=...`) as a formula, and the body is prefixed with a
 * UTF-8 BOM so Excel renders the Chinese correctly.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/site/prisma";
import {
  csvDownloadHeaders,
  csvStringify,
  requireAdminAccess,
  sanitizeCsvCell,
} from "@/lib/site/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const authorization = request.headers.get("authorization") ?? "";
  const denied = await requireAdminAccess(authorization);
  if (denied) return denied;

  try {
    const members = await prisma.memberApplication.findMany({
      orderBy: { createdAt: "desc" },
    });

    // Flatten metadata for CSV (arrays stay JSON-encoded, matching json2csv's
    // handling of the stringified columns in the DB).
    const csvData = members.map(member =>
      Object.fromEntries(
        Object.entries(member).map(([key, value]) => [
          key,
          sanitizeCsvCell(value),
        ])
      )
    );

    const csv = csvStringify(csvData);
    const csvBody = `﻿${csv}`; // BOM prefix fixes Chinese encoding in Excel
    return new NextResponse(csvBody, {
      headers: csvDownloadHeaders("members.csv"),
    });
  } catch (error) {
    console.error("Export members error:", error);
    return new NextResponse("Export failed", { status: 500 });
  }
}
