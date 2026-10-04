/** Legacy clients use the same authenticated application intake. */
import { submitMemberApplication } from "@/lib/member/application";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = submitMemberApplication;
