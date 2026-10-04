import { getLogtoContext, isLogtoConfigured, logtoConfig, signIn } from "@/lib/logto";
import { normalizeMemberReturnTo } from "@/lib/member/return-to";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const returnTo = normalizeMemberReturnTo(params.get("returnTo"));
  const reauthenticate = params.get("reauth") === "1";
  if (!isLogtoConfigured()) {
    redirect(returnTo
      ? `/member/sign-in?${new URLSearchParams({ returnTo })}`
      : "/member/sign-in");
  }

  const { isAuthenticated } = await getLogtoContext();
  if (isAuthenticated && !reauthenticate) redirect(returnTo ?? "/member/dashboard");

  await signIn(`${logtoConfig.baseUrl}/callback`, returnTo);
}
