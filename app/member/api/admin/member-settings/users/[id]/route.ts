import { managedUserDetail } from "@/lib/member/organization-management";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return managedUserDetail(request, (await context.params).id);
}
