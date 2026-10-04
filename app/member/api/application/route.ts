import { getMemberApplication, submitMemberApplication } from "@/lib/member/application";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = getMemberApplication;
export const POST = submitMemberApplication;
