import { listMemberProjects, submitMemberProject } from "@/lib/member/project-submission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = submitMemberProject;
export const GET = listMemberProjects;
