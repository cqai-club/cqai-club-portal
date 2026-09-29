"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  adminNavItems,
  mainNavItems,
  isNavItemActive,
  getNavLabel,
} from "@/config/navigation";
import {
  Menu,
  Moon,
  Sun,
  LogOut,
  ChevronDown,
  Home,
  ArrowUpRight,
  Sparkles,
  Globe2,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useTranslations } from "@/lib/i18n/client";
import { t as translate } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";

interface NavbarProps {
  canAccessAdmin?: boolean;
  canAccessMemberAdmin?: boolean;
  canAccessPluginAdmin?: boolean;
  canAccessActivityAdmin?: boolean;
  user?: {
    name?: string;
    username?: string;
    email?: string;
    avatar?: string;
  };
  onSignOut?: () => void;
}

export function Navbar({ user, onSignOut, canAccessAdmin = false, canAccessMemberAdmin = false, canAccessPluginAdmin = false, canAccessActivityAdmin = false }: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const { t, language, setLanguage } = useTranslations();
  const { toast } = useToast();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isUpdatingLanguage, setIsUpdatingLanguage] = useState(false);
  const visibleAdminNavItems = adminNavItems.filter(item =>
    item.titleKey === "nav.adminPlugins" ? canAccessPluginAdmin
      : item.titleKey === "nav.adminActivities" ? canAccessActivityAdmin
        : canAccessMemberAdmin
  );
  const currentNavItem = [...mainNavItems, ...visibleAdminNavItems].find(item => isNavItemActive(item.href, pathname));

  const handleLanguageChange = async (value: string) => {
    if (isUpdatingLanguage || (value !== "zh-CN" && value !== "en")) return;

    const nextLanguage = value === "en" ? "en" : "zh";
    if (nextLanguage === language) return;

    setIsUpdatingLanguage(true);
    setLanguage(nextLanguage);

    try {
      const response = await fetch("/member/api/account/profile/details", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: value }),
      });

      if (!response.ok) throw new Error("Failed to update language");

      router.refresh();
      toast({
        title: translate("settings.languageUpdatedTitle", nextLanguage),
        description: translate("settings.languageUpdatedDesc", nextLanguage),
      });
    } catch {
      // Keep the browser preference when the account service is unavailable.
      toast({
        title: translate("settings.languageUpdatedTitle", nextLanguage),
        description: translate("settings.languageUpdatedLocalDesc", nextLanguage),
      });
    } finally {
      setIsUpdatingLanguage(false);
    }
  };

  return (
    <header className="sticky top-0 z-30 w-full border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85">
      <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-10">
        <div className="flex min-w-0 items-center gap-3">
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="size-11 md:hidden" aria-label={t("nav.menu")}>
                <Menu aria-hidden="true" className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="member-center flex h-dvh w-[min(20rem,85vw)] flex-col gap-0 bg-sidebar p-0 text-sidebar-foreground [&>button]:flex [&>button]:size-11 [&>button]:items-center [&>button]:justify-center">
              <SheetTitle className="sr-only">{t("nav.menu")}</SheetTitle>
              <div className="flex h-20 shrink-0 items-center gap-3 border-b border-sidebar-border px-5">
                <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Sparkles aria-hidden="true" className="size-5" />
                </span>
                <span className="flex flex-col leading-tight">
                  <span className="text-xs font-semibold tracking-[0.12em] text-muted-foreground">CQAI CLUB</span>
                  <span className="mt-0.5 text-base font-semibold">{t("meta.appTitle")}</span>
                </span>
              </div>
              <nav aria-label={t("nav.menu")} className="min-h-0 flex-1 overflow-y-auto px-3 py-5">
                <p className="px-3 pb-2 text-xs font-medium text-muted-foreground">{t("nav.accountSection")}</p>
                {mainNavItems.map((item) => {
                  const isActive = isNavItemActive(item.href, pathname);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "mb-1 flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                        isActive && "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
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
                          onClick={() => setMobileMenuOpen(false)}
                          aria-current={isActive ? "page" : undefined}
                          className={cn(
                            "mb-1 flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                            isActive && "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
                          )}
                        >
                          <item.icon aria-hidden="true" className="size-[18px] shrink-0" />
                          <span className="flex-1">{getNavLabel(item, language)}</span>
                          {isActive && <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />}
                        </Link>
                      );
                    })}
                  </>
                )}
              </nav>
              <div className="shrink-0 border-t border-sidebar-border p-3">
                <a href="/" target="_blank" rel="noreferrer" className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
                  <Home aria-hidden="true" className="size-[18px]" />
                  <span className="flex-1">{t("meta.backToSite")}</span>
                  <ArrowUpRight aria-hidden="true" className="size-4" />
                </a>
              </div>
            </SheetContent>
          </Sheet>
          <Link href="/member/dashboard" className="truncate rounded-md text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden">
            {t("meta.appTitle")}
          </Link>
          <span className="hidden truncate text-sm font-medium md:block">{currentNavItem ? getNavLabel(currentNavItem, language) : t("meta.appTitle")}</span>
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="h-11 min-w-11 gap-2 rounded-xl px-2.5"
                aria-label={`${t("settings.interfaceLanguage")}：${language === "en" ? "English" : "简体中文"}`}
                disabled={isUpdatingLanguage}
              >
                <Globe2 aria-hidden="true" className="size-4" />
                <span className="hidden text-xs font-medium sm:inline">{language === "en" ? "EN" : "中文"}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuLabel>{t("settings.interfaceLanguage")}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup value={language === "en" ? "en" : "zh-CN"} onValueChange={(value) => void handleLanguageChange(value)}>
                <DropdownMenuRadioItem value="zh-CN" className="min-h-11">简体中文</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="en" className="min-h-11">English</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="icon"
            className="size-11"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            aria-label={t("common.toggleTheme")}
          >
            <Sun aria-hidden="true" className="size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon aria-hidden="true" className="absolute size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-11 gap-2 rounded-xl pl-1.5 pr-2.5" aria-label={user?.name || user?.username || t("common.user")}>
                <Avatar className="size-8">
                  {user?.avatar && (
                    <AvatarImage src={user.avatar} alt={user?.name || user?.username || t("common.user")} />
                  )}
                  <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
                    {user?.name?.charAt(0) || user?.username?.charAt(0) || t("common.userInitial")}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden max-w-[100px] truncate sm:inline">
                  {user?.name || user?.username || t("common.user")}
                </span>
                <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span>{user?.name || user?.username || t("common.user")}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {user?.email || t("common.emailNotSet")}
                  </span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {mainNavItems.slice(1, 3).map((item) => (
                <DropdownMenuItem key={item.href} asChild>
                  <Link href={item.href}>
                    <item.icon aria-hidden="true" className="mr-2 size-4" />
                    {getNavLabel(item, language)}
                  </Link>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              {onSignOut && (
                <DropdownMenuItem onClick={onSignOut} className="text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  {t("nav.signOut")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
