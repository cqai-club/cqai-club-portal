import { getLogtoContext, getAccountInfo, getMfaVerifications, type AccountInfo } from "@/lib/logto";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Link from "next/link";
import {
  ArrowRight, CalendarDays, KeyRound, Mail, ShieldCheck,
  Smartphone, UserRound, type LucideIcon,
} from "lucide-react";
import { normalizeLocale, t as translate } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { isAuthenticated, claims } = await getLogtoContext();
  let accountInfo: AccountInfo | { error: string } | null = null;
  let mfaVerifications: { type?: string }[] = [];

  if (isAuthenticated) {
    try {
      [accountInfo, mfaVerifications] = await Promise.all([
        getAccountInfo(),
        getMfaVerifications().catch(() => []),
      ]);
    } catch {
      accountInfo = { error: "Account information unavailable" };
    }
  }

  const displayInfo = accountInfo && !("error" in accountInfo) ? accountInfo : null;
  const locale = normalizeLocale(displayInfo?.profile?.locale);
  const tt = (key: string, params?: Record<string, string>) => translate(key, locale, params);
  const displayName = displayInfo?.name || claims?.name || displayInfo?.username || claims?.username || tt("common.user");

  const formatDate = (date: string | number | Date, includeTime = false): string =>
    new Date(date).toLocaleString(locale === "en" ? "en-US" : "zh-CN", {
      year: "numeric", month: "long", day: "numeric",
      ...(includeTime ? { hour: "2-digit" as const, minute: "2-digit" as const } : {}),
    });

  const accountDetails: { label: string; value: string; icon: LucideIcon }[] = [
    { label: tt("dashboard.email"), value: displayInfo?.primaryEmail || tt("profile.notSet"), icon: Mail },
    { label: tt("dashboard.phone"), value: displayInfo?.primaryPhone || tt("profile.notSet"), icon: Smartphone },
    { label: tt("dashboard.password"), value: displayInfo?.hasPassword ? tt("dashboard.passwordSet") : tt("dashboard.passwordNotSet"), icon: KeyRound },
    { label: tt("dashboard.registerTime"), value: displayInfo?.createdAt ? formatDate(displayInfo.createdAt) : tt("profile.notSet"), icon: CalendarDays },
  ];

  const quickActions: { href: string; title: string; description: string; icon: LucideIcon }[] = [
    { href: "/member/dashboard/profile", title: tt("dashboard.quickActions.profile"), description: tt("dashboard.quickActions.profileDesc"), icon: UserRound },
    { href: "/member/dashboard/security", title: tt("dashboard.quickActions.security"), description: tt("dashboard.quickActions.securityDesc"), icon: ShieldCheck },
  ];

  const securityItems: { href: string; label: string; status: string; active: boolean; icon: LucideIcon }[] = [
    {
      href: "/member/dashboard/security", label: tt("dashboard.securityStatus.loginPassword"),
      status: displayInfo?.hasPassword ? tt("dashboard.passwordSet") : tt("dashboard.passwordNotSet"),
      active: Boolean(displayInfo?.hasPassword), icon: KeyRound,
    },
    {
      href: "/member/dashboard/security", label: tt("dashboard.securityStatus.mfa"),
      status: mfaVerifications.length > 0
        ? tt("security.mfa.mfaSetCount", { count: String(mfaVerifications.length) })
        : tt("dashboard.passwordNotSet"),
      active: mfaVerifications.length > 0, icon: ShieldCheck,
    },
  ];

  return (
    <div className="space-y-7 lg:space-y-8">
      <header>
        <p className="text-xs font-semibold tracking-[0.14em] text-primary">CQAI CLUB</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{tt("dashboard.title")}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">{tt("dashboard.description")}</p>
      </header>

      {accountInfo && "error" in accountInfo && (
        <p role="status" className="rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
          {tt("dashboard.accountUnavailable")}
        </p>
      )}

      <section aria-label={tt("dashboard.accountSummary")}>
        <Card className="gap-0 overflow-hidden border-t-2 border-t-primary py-0 shadow-sm">
          <div className="flex flex-col gap-5 px-5 py-7 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-8">
            <div className="flex min-w-0 items-center gap-4 sm:gap-5">
              <Avatar className="size-16 shrink-0 border-4 border-background shadow-sm sm:size-[72px]">
                {(displayInfo?.avatar || claims?.picture) && (
                  <AvatarImage src={displayInfo?.avatar || claims?.picture || ""} alt={displayName} />
                )}
                <AvatarFallback className="bg-primary/10 text-xl font-semibold text-primary">
                  {displayName.charAt(0) || tt("common.userInitial")}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-xs font-medium text-primary">{tt("dashboard.accountSummary")}</p>
                <h2 className="mt-1 break-words text-xl font-semibold tracking-tight sm:text-2xl">
                  {tt("dashboard.welcome")}{locale === "en" ? ", " : "，"}{displayName}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {tt("dashboard.lastSignIn")}{locale === "en" ? ": " : "："}{displayInfo?.lastSignInAt ? formatDate(displayInfo.lastSignInAt, true) : tt("service.status.unknown")}
                </p>
              </div>
            </div>
            <Button asChild className="h-11 shrink-0 rounded-lg px-5 sm:self-center">
              <Link href="/member/dashboard/profile">
                {tt("dashboard.viewProfile")}
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </Button>
          </div>
          <div className="grid gap-px border-t bg-border sm:grid-cols-2 xl:grid-cols-4">
            {accountDetails.map(({ label, value, icon: Icon }) => (
              <div key={label} className="flex min-w-0 items-start gap-3 bg-card px-5 py-5 sm:px-6">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 break-all text-sm font-medium leading-5">{value}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.82fr)]">
        <section aria-labelledby="quick-actions-title">
          <Card className="h-full gap-0 overflow-hidden py-0 shadow-sm">
            <div className="px-5 py-5 sm:px-6">
              <h2 id="quick-actions-title" className="text-lg font-semibold tracking-tight">{tt("dashboard.quickActions.title")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{tt("dashboard.quickActions.description")}</p>
            </div>
            <div className="border-t">
              {quickActions.map(({ href, title, description, icon: Icon }) => (
                <Link key={href} href={href} className="group flex min-h-20 items-center gap-4 border-b px-5 py-4 transition-colors last:border-b-0 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-6">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{title}</span>
                    <span className="mt-1 block text-sm leading-5 text-muted-foreground">{description}</span>
                  </span>
                  <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                </Link>
              ))}
            </div>
          </Card>
        </section>

        <section aria-labelledby="security-status-title">
          <Card className="h-full gap-0 overflow-hidden py-0 shadow-sm">
            <div className="px-5 py-5 sm:px-6">
              <h2 id="security-status-title" className="text-lg font-semibold tracking-tight">{tt("dashboard.securityStatus.title")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{tt("dashboard.securityStatus.description")}</p>
            </div>
            <div className="border-t px-5 sm:px-6">
              {securityItems.map(({ href, label, status, active, icon: Icon }) => (
                <Link key={label} href={href} className="flex min-h-20 flex-wrap items-center gap-3 border-b py-4 transition-colors last:border-b-0 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:flex-nowrap">
                  <Icon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 text-sm font-medium">{label}</span>
                  <span className={active
                    ? "rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                    : "rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"}
                  >
                    {status}
                  </span>
                  <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              ))}
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}
