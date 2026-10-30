import { createPartnerGroup } from "@/lib/partners";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { return createPartnerGroup(request); }
