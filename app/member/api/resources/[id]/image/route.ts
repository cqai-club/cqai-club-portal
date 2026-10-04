import { resourceImage } from "@/lib/member/resources";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return resourceImage(request, (await context.params).id);
}
