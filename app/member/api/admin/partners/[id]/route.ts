import { deletePartner, updatePartner } from "@/lib/partners";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, context: Context) {
  return updatePartner(request, (await context.params).id);
}
export async function DELETE(request: Request, context: Context) {
  return deletePartner(request, (await context.params).id);
}
