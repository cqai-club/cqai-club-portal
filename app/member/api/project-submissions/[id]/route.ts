import { getMemberProjectDetail } from "@/lib/member/project-submission-detail";
import { updateMemberProject } from "@/lib/member/project-submission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return getMemberProjectDetail(request, (await context.params).id);
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return updateMemberProject(request, (await context.params).id);
}
