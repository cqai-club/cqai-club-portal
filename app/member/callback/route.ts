import { handleSignIn } from "@/lib/logto";
import { logger } from "@/lib/logger";
import { classifyMemberLoginError, memberLoginErrorRequestId } from "@/lib/member/login-error";
import { redirect } from "next/navigation";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  let destination = "/member/dashboard";
  try {
    await handleSignIn(request.nextUrl.searchParams);
  } catch (error) {
    const failure = classifyMemberLoginError(error);
    if (!failure) throw error;

    const requestId = memberLoginErrorRequestId(error);
    logger.warn("Member sign-in callback failed", {
      code: failure.code,
      name: failure.name,
      ...(requestId ? { requestId } : {}),
    });
    destination = `/member/sign-in?error=${failure.reason}`;
  }
  redirect(destination);
}
