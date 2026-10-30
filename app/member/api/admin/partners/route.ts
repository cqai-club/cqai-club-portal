import { createPartner, getPartnerAdministration } from "@/lib/partners";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return getPartnerAdministration(request); }
export async function POST(request: Request) { return createPartner(request); }
