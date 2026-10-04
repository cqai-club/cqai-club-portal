"use client";

import { createContext, useContext, useRef, useState, type ComponentProps, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { LoaderCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useTranslations } from "@/lib/i18n/client";

function ProfileLoading() {
  const { t } = useTranslations();
  return <p role="status" className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground"><LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />{t("common.loading")}</p>;
}
const ProfileContent = dynamic(() => import("./profile-content"), { loading: ProfileLoading });
const ProfileDrawerContext = createContext<{ open: boolean; openProfile: () => void } | null>(null);

export function useProfileDrawer() {
  const context = useContext(ProfileDrawerContext);
  if (!context) throw new Error("Profile drawer must be used within its provider");
  return context;
}

export function ProfileDrawerProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslations();
  const searchParams = useSearchParams();
  const requested = searchParams.get("profile") === "open";
  const [localOpen, setLocalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const trigger = useRef<HTMLElement | null>(null);
  const open = requested || localOpen;

  function openProfile() {
    trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setLocalOpen(true);
  }
  function changeOpen(nextOpen: boolean) {
    if (saving) return;
    setLocalOpen(nextOpen);
    if (!nextOpen && requested) {
      const url = new URL(window.location.href);
      url.searchParams.delete("profile");
      // Let Next.js preserve its own history state and sync useSearchParams.
      window.history.replaceState(null, "", url);
    }
  }

  return (
    <ProfileDrawerContext.Provider value={{ open, openProfile }}>
      {children}
      <Sheet open={open} onOpenChange={changeOpen}>
        <SheetContent
          side="right"
          className="member-center flex h-dvh w-full flex-col gap-0 p-0 text-foreground sm:max-w-2xl [&>button:last-child]:hidden"
          onEscapeKeyDown={event => { if (saving) event.preventDefault(); }}
          onPointerDownOutside={event => { if (saving) event.preventDefault(); }}
          onCloseAutoFocus={event => {
            event.preventDefault();
            const target = trigger.current?.isConnected ? trigger.current : document.querySelector<HTMLElement>("[data-profile-focus-fallback]");
            target?.focus();
          }}
        >
          <SheetHeader className="relative shrink-0 border-b px-5 py-5 pr-16 text-left sm:px-6 sm:pr-16">
            <SheetTitle className="text-xl">{t("profile.title")}</SheetTitle>
            <SheetDescription>{t("profile.description")}</SheetDescription>
            <Button variant="ghost" size="icon" className="absolute right-3 top-3 size-11" disabled={saving} aria-label={t("common.close")} onClick={() => changeOpen(false)}>
              <X aria-hidden="true" className="size-5" />
            </Button>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6">
            {open && <ProfileContent onSavingChange={setSaving} />}
          </div>
        </SheetContent>
      </Sheet>
    </ProfileDrawerContext.Provider>
  );
}

export function ProfileDrawerButton({ onClick, ...props }: ComponentProps<"button">) {
  const { openProfile } = useProfileDrawer();
  return <button {...props} type="button" aria-haspopup="dialog" onClick={event => {
    onClick?.(event);
    if (!event.defaultPrevented) openProfile();
  }} />;
}
