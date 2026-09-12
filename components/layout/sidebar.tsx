"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  adminNavItems,
  mainNavItems,
  isNavItemActive,
  getNavLabel,
} from "@/config/navigation";
import { Home, ExternalLink } from "lucide-react";
import { useTranslations } from "@/lib/i18n/client";

interface SidebarProps {
  canAccessAdmin?: boolean;
  canAccessMemberAdmin?: boolean;
  canAccessPluginAdmin?: boolean;
}

export function Sidebar({ canAccessAdmin = false, canAccessMemberAdmin = false, canAccessPluginAdmin = false }: SidebarProps) {
  const pathname = usePathname();
  const { t, language } = useTranslations();
  const visibleAdminNavItems = adminNavItems.filter(item =>
    item.titleKey === "nav.adminPlugins" ? canAccessPluginAdmin : canAccessMemberAdmin
  );

  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 flex-col border-r bg-card md:flex">
      {/* Header */}
      <div className="flex h-16 items-center border-b px-6">
        <Link href="/member/dashboard" className="flex items-center gap-2 font-semibold">
          <Image
            src="/images/logo-nav.png"
            alt={t("meta.appTitle")}
            width={30}
            height={30}
            className="h-[30px] w-[30px] object-contain"  
          />
          <span>{t("meta.appTitle")}</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 mt-4">
        {mainNavItems.map((item) => {
          const isActive = isNavItemActive(item.href, pathname);
          return (
            <Link key={item.href} href={item.href}>
              <Button
                variant={isActive ? "secondary" : "ghost"}
                className={cn(
                  "w-full justify-start gap-3",
                  isActive && "font-medium"
                )}
              >
                <item.icon className="h-4 w-4" />
                {getNavLabel(item, language)}
              </Button>
            </Link>
          );
        })}
        {canAccessAdmin && visibleAdminNavItems.length > 0 && (
          <>
            <div className="my-3 border-t" />
            {visibleAdminNavItems.map((item) => {
              const isActive = isNavItemActive(item.href, pathname);
              return (
                <Link key={item.href} href={item.href}>
                  <Button
                    variant={isActive ? "secondary" : "ghost"}
                    className={cn(
                      "w-full justify-start gap-3",
                      isActive && "font-medium"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {getNavLabel(item, language)}
                  </Button>
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="border-t p-4">
        <a
          href="/"
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-2 text-center text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <Home className="h-3.5 w-3.5" />
          {t("meta.backToSite")}
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </aside>
  );
}
