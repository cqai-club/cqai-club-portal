import { listResources, writeResource } from "@/lib/member/resources";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return listResources(request, true); }
export async function POST(request: Request) { return writeResource(request); }
