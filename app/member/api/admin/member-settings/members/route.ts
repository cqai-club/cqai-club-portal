import { listManagedUsers, addManagedUsers, removeManagedUser } from "@/lib/member/organization-management";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = (request: Request) => listManagedUsers(request, true);
export const POST = addManagedUsers;
export const DELETE = removeManagedUser;
