import { getLogtoContext, getAccountInfo, signOut, LogtoApiError } from "@/lib/logto";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Navbar } from "@/components/layout/navbar";
import { logger } from "@/lib/logger";
import { hasMemberAdminPermission, hasPluginAdminPermission } from "@/lib/member/permissions";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, claims } = await getLogtoContext();

  if (!isAuthenticated) {
    redirect("/member/sign-in");
  }

  let accountInfo = null;
  try {
    accountInfo = await getAccountInfo();
  } catch (error) {
    if (error instanceof LogtoApiError && (error.statusCode === 401 || error.statusCode === 403)) {
      redirect("/member/sign-in");
    }

    logger.error("Failed to get account info", error);
  }

  const user = {
    name: accountInfo?.name ?? claims?.name ?? undefined,
    username: accountInfo?.username ?? claims?.username ?? undefined,
    email: accountInfo?.primaryEmail ?? claims?.email ?? undefined,
    avatar: accountInfo?.avatar ?? claims?.picture ?? undefined,
  };
  const [canAccessMemberAdmin, canAccessPluginAdmin] = await Promise.all([
    hasMemberAdminPermission(),
    hasPluginAdminPermission(),
  ]);
  const canAccessAdmin = canAccessMemberAdmin || canAccessPluginAdmin;

  async function handleSignOut() {
    "use server";
    await signOut();
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop Sidebar */}
      <Sidebar canAccessAdmin={canAccessAdmin} canAccessMemberAdmin={canAccessMemberAdmin} canAccessPluginAdmin={canAccessPluginAdmin} />

      {/* Main Content */}
      <div className="md:pl-64">
        <Navbar user={user} onSignOut={handleSignOut} canAccessAdmin={canAccessAdmin} canAccessMemberAdmin={canAccessMemberAdmin} canAccessPluginAdmin={canAccessPluginAdmin} />
        <main className="p-4 lg:p-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
