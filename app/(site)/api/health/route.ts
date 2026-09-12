/**
 * GET /health
 * Health-check endpoint used by CI and the deploy probes. Mirrors the old
 * Express app.
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export function GET(): NextResponse {
  return NextResponse.json({ status: "ok" });
}
