"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  adminNavItems,
  getVisibleMainNavItems,
  isNavItemActive,
  getNavLabel,
} from "@/config/navigation";
import { ArrowUpRight, Home, Sparkles } from "lucide-react";
import { useTranslations } from "@/lib/i18n/client";

interface SidebarProps {
  canAccessAdmin?: boolean;
  canAccessMemberAdmin?: boolean;
  canAccessPluginAdmin?: boolean;
  canAccessActivityAdmin?: boolean;
  canAccessInnovationMember?: boolean;
}

export function Sidebar({ canAccessAdmin = false, canAccessMemberAdmin = false, canAccessPluginAdmin = false, canAccessActivityAdmin = false, canAccessInnovationMember = false }: SidebarProps) {
  const pathname = usePathname();
  const { t, language } = useTranslations();
  const visibleMainNavItems = getVisibleMainNavItems(canAccessInnovationMember);
  const visibleAdminNavItems = adminNavItems.filter(item =>
    item.titleKey === "nav.adminPlugins" ? canAccessPluginAdmin
      : item.titleKey === "nav.adminActivities" ? canAccessActivityAdmin
        : canAccessMemberAdmin
  );

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex h-20 shrink-0 items-center border-b border-sidebar-border px-5">
        <Link href="/member/dashboard" className="flex min-h-11 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Sparkles aria-hidden="true" className="size-5" />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-xs font-semibold tracking-[0.12em] text-muted-foreground">CQAI CLUB</span>
            <span className="mt-0.5 text-base font-semibold">{t("meta.appTitle")}</span>
          </span>
        </Link>
      </div>

      <nav aria-label={t("nav.menu")} className="min-h-0 flex-1 overflow-y-auto px-3 py-5">
        <p className="px-3 pb-2 text-xs font-medium text-muted-foreground">{t("nav.accountSection")}</p>
        {visibleMainNavItems.map((item) => {
          const isActive = isNavItemActive(item.href, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "mb-1 flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                isActive && "bg-sidebar-accent font-semibold text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon aria-hidden="true" className="size-[18px] shrink-0" />
              <span className="flex-1">{getNavLabel(item, language)}</span>
              {isActive && <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />}
            </Link>
          );
        })}
        {canAccessAdmin && visibleAdminNavItems.length > 0 && (
          <>
            <div className="mx-3 my-5 border-t border-sidebar-border" />
            <p className="px-3 pb-2 text-xs font-medium text-muted-foreground">{t("nav.manageSection")}</p>
            {visibleAdminNavItems.map((item) => {
              const isActive = isNavItemActive(item.href, pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  target={item.external ? "_blank" : undefined}
                  rel={item.external ? "noopener noreferrer" : undefined}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "mb-1 flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                    isActive && "bg-sidebar-accent font-semibold text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                >
                  <item.icon aria-hidden="true" className="size-[18px] shrink-0" />
                  <span className="flex-1">{getNavLabel(item, language)}</span>
                  {item.external && <ArrowUpRight aria-hidden="true" className="size-4 shrink-0" />}
                  {isActive && <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      <div className="shrink-0 border-t border-sidebar-border p-3">
        <a
          href="/"
          target="_blank"
          rel="noreferrer"
          className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <Home aria-hidden="true" className="size-[18px]" />
          <span className="flex-1">{t("meta.backToSite")}</span>
          <ArrowUpRight aria-hidden="true" className="size-4" />
        </a>
      </div>
    </aside>
  );
}
