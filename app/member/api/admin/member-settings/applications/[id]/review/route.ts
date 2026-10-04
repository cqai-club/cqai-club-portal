import { reviewMemberApplication } from "@/lib/member/organization-management";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return reviewMemberApplication(request, (await context.params).id);
}
