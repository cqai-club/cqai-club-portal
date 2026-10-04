import { listManagedUsers } from "@/lib/member/organization-management";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = (request: Request) => listManagedUsers(request, false);
