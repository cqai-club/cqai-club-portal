import { redirect } from "next/navigation";
import { getLogtoContext } from "@/lib/logto";

export const dynamic = "force-dynamic";

// Preserve bookmarked URLs and Account Center returns while rendering the drawer on the dashboard.
export default async function ProfilePage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { isAuthenticated } = await getLogtoContext();
  if (!isAuthenticated) redirect("/member/sign-in");
  const params = new URLSearchParams({ profile: "open" });
  const success = (await searchParams).show_success;
  if (typeof success === "string") params.set("show_success", success);
  redirect(`/member/dashboard?${params}`);
}
