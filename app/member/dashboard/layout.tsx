import { getLogtoContext, getAccountInfo, signOut, LogtoApiError } from "@/lib/logto";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Sidebar } from "@/components/layout/sidebar";
import { Navbar } from "@/components/layout/navbar";
import { ProfileDrawerProvider } from "@/components/member/profile-drawer";
import { logger } from "@/lib/logger";
import { hasMemberAdminPermission, hasPluginAdminPermission } from "@/lib/member/permissions";
import { hasInnovationMemberAccess } from "@/lib/member/innovation-access";
import { canManageActivities } from "@/lib/club-activity-auth";
import { normalizeLocale, t } from "@/lib/i18n";
import {
  normalizeMemberReturnTo,
  MEMBER_RETURN_TO_HEADER,
  memberLoginPath,
} from "@/lib/member/return-to";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, claims } = await getLogtoContext();
  const returnTo = normalizeMemberReturnTo((await headers()).get(MEMBER_RETURN_TO_HEADER));
  const signInPath = returnTo
    ? memberLoginPath(returnTo)
    : "/member/sign-in";

  if (!isAuthenticated) {
    redirect(signInPath);
  }

  let accountInfo = null;
  try {
    accountInfo = await getAccountInfo();
  } catch (error) {
    if (error instanceof LogtoApiError && error.statusCode === 401) {
      // The local ID-token session can still look authenticated after the
      // Account API token is rejected. Restart login instead of looping back.
      redirect(returnTo
        ? memberLoginPath(returnTo, true)
        : "/member/sign-in");
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
  const [canAccessMemberAdmin, canAccessPluginAdmin, canAccessActivityAdmin, canAccessInnovationMember] = await Promise.all([
    hasMemberAdminPermission(),
    hasPluginAdminPermission(),
    canManageActivities(),
    hasInnovationMemberAccess(),
  ]);
  const canAccessAdmin = canAccessMemberAdmin || canAccessPluginAdmin || canAccessActivityAdmin;

  async function handleSignOut() {
    "use server";
    await signOut();
  }

  return (
    <ProfileDrawerProvider>
    <div className="member-center min-h-dvh bg-background">
      <a
        href="#main-content"
        className="sr-only fixed left-4 top-4 z-[100] rounded-lg bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        {t("nav.skipToContent", locale)}
      </a>
      {/* Desktop Sidebar */}
      <Sidebar canAccessAdmin={canAccessAdmin} canAccessMemberAdmin={canAccessMemberAdmin} canAccessPluginAdmin={canAccessPluginAdmin} canAccessActivityAdmin={canAccessActivityAdmin} canAccessInnovationMember={canAccessInnovationMember} />

      {/* Main Content */}
      <div className="min-w-0 md:pl-64">
        <Navbar user={user} onSignOut={handleSignOut} canAccessAdmin={canAccessAdmin} canAccessMemberAdmin={canAccessMemberAdmin} canAccessPluginAdmin={canAccessPluginAdmin} canAccessActivityAdmin={canAccessActivityAdmin} canAccessInnovationMember={canAccessInnovationMember} />
        <main id="main-content" tabIndex={-1} className="scroll-mt-20 p-4 outline-none sm:p-6 lg:p-10">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
    </ProfileDrawerProvider>
  );
}
