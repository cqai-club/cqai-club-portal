// Legacy endpoint retains the same authentication and project-only rules.
import { submitMemberProject } from "@/lib/member/project-submission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = submitMemberProject;
