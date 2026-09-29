import { isLogtoConfigured, logtoConfig, signIn } from "@/lib/logto";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isLogtoConfigured()) redirect("/member/sign-in");
  await signIn(`${logtoConfig.baseUrl}/callback`);
}
