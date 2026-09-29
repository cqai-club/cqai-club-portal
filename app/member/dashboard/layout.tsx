import { getLogtoContext, getAccountInfo, signOut, LogtoApiError } from "@/lib/logto";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Navbar } from "@/components/layout/navbar";
import { logger } from "@/lib/logger";
import { hasMemberAdminPermission, hasPluginAdminPermission } from "@/lib/member/permissions";
import { canManageActivities } from "@/lib/club-activity-auth";
import { normalizeLocale, t } from "@/lib/i18n";

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
    if (error instanceof LogtoApiError && error.statusCode === 401) {
      redirect("/member/sign-in");
    }

    if (error instanceof LogtoApiError && error.statusCode === 403) {
      logger.warn("Account API access forbidden; keeping the current member session");
    } else {
      logger.error("Failed to get account info", error);
    }
  }

  const user = {
    name: accountInfo?.name ?? claims?.name ?? undefined,
    username: accountInfo?.username ?? claims?.username ?? undefined,
    email: accountInfo?.primaryEmail ?? claims?.email ?? undefined,
    avatar: accountInfo?.avatar ?? claims?.picture ?? undefined,
  };
  const locale = normalizeLocale(accountInfo?.profile?.locale);
  const [canAccessMemberAdmin, canAccessPluginAdmin, canAccessActivityAdmin] = await Promise.all([
    hasMemberAdminPermission(),
    hasPluginAdminPermission(),
    canManageActivities(),
  ]);
  const canAccessAdmin = canAccessMemberAdmin || canAccessPluginAdmin || canAccessActivityAdmin;

  async function handleSignOut() {
    "use server";
    await signOut();
  }

  return (
    <div className="member-center min-h-dvh bg-background">
      <a
        href="#main-content"
        className="sr-only fixed left-4 top-4 z-[100] rounded-lg bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        {t("nav.skipToContent", locale)}
      </a>
      {/* Desktop Sidebar */}
      <Sidebar canAccessAdmin={canAccessAdmin} canAccessMemberAdmin={canAccessMemberAdmin} canAccessPluginAdmin={canAccessPluginAdmin} canAccessActivityAdmin={canAccessActivityAdmin} />

      {/* Main Content */}
      <div className="min-w-0 md:pl-64">
        <Navbar user={user} onSignOut={handleSignOut} canAccessAdmin={canAccessAdmin} canAccessMemberAdmin={canAccessMemberAdmin} canAccessPluginAdmin={canAccessPluginAdmin} canAccessActivityAdmin={canAccessActivityAdmin} />
        <main id="main-content" tabIndex={-1} className="scroll-mt-20 p-4 outline-none sm:p-6 lg:p-10">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
