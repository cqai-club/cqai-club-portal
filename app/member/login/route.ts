import { logtoConfig, signIn } from "@/lib/logto";

export const dynamic = "force-dynamic";

export async function GET() {
  await signIn(`${logtoConfig.baseUrl}/callback`);
}
