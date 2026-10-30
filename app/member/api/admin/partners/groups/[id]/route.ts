import { deletePartnerGroup, updatePartnerGroup } from "@/lib/partners";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, context: Context) {
  return updatePartnerGroup(request, (await context.params).id);
}
export async function DELETE(request: Request, context: Context) {
  return deletePartnerGroup(request, (await context.params).id);
}
