import { NextResponse, type NextRequest } from "next/server";
import { MEMBER_APPLICATION_PATH, MEMBER_PROJECT_SUBMISSION_PATH, MEMBER_RETURN_TO_HEADER } from "@/lib/member/return-to";

export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  // Set return targets from the requested route, never a browser-supplied header.
  requestHeaders.delete(MEMBER_RETURN_TO_HEADER);
  const pathname = request.nextUrl.pathname.replace(/\/$/, "");
  if ([MEMBER_APPLICATION_PATH, MEMBER_PROJECT_SUBMISSION_PATH, "/member/dashboard/resources", "/member/dashboard/admin/resources", "/member/dashboard/ai-gateway"].includes(pathname)) {
    requestHeaders.set(MEMBER_RETURN_TO_HEADER, pathname);
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: "/member/dashboard/:path*",
};
