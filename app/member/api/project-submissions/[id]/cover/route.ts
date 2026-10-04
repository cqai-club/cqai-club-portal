import { getMemberProjectCover } from "@/lib/member/project-submission-detail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return getMemberProjectCover(request, (await context.params).id);
}
