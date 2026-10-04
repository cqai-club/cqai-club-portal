import { listResources } from "@/lib/member/resources";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return listResources(request); }
