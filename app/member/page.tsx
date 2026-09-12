import { redirect } from "next/navigation";
import { getLogtoContext } from "@/lib/logto";

export const dynamic = "force-dynamic";

export default async function MemberHomePage() {
  const { isAuthenticated } = await getLogtoContext();

  if (!isAuthenticated) {
    redirect("/member/login");
  }

  redirect("/member/dashboard");
}
