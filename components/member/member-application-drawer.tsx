"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { ArrowRight, LoaderCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useTranslations } from "@/lib/i18n/client";
import type { InitialIdentity } from "./member-application-form";

function ApplicationLoading() {
  const { t } = useTranslations();
  return <p role="status" className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground"><LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />{t("application.loading")}</p>;
}
const MemberApplicationForm = dynamic(() => import("./member-application-form"), { loading: ApplicationLoading });

export default function MemberApplicationDrawer({ initialIdentity }: { initialIdentity: InitialIdentity }) {
  const { t } = useTranslations();
  const searchParams = useSearchParams();
  const requested = searchParams.get("application") === "open";
  const [localOpen, setLocalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const open = requested || localOpen;

  function changeOpen(nextOpen: boolean) {
    if (submitting) return;
    setLocalOpen(nextOpen);
    if (!nextOpen && requested) {
      const url = new URL(window.location.href);
      url.searchParams.delete("application");
      // Next.js syncs useSearchParams for external history changes. Passing its
      // internal history flags skips that sync and leaves the drawer open.
      window.history.replaceState(null, "", url);
    }
  }

  return (
    <Sheet open={open} onOpenChange={changeOpen}>
      <SheetTrigger asChild>
        <Button className="h-auto min-h-11 w-full whitespace-normal rounded-lg px-5 py-3">
          {t("plans.chuangxiang.apply")}
          <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="member-center flex h-dvh w-full flex-col gap-0 p-0 text-foreground sm:max-w-3xl [&>button:last-child]:hidden"
        onEscapeKeyDown={event => { if (submitting) event.preventDefault(); }}
        onPointerDownOutside={event => { if (submitting) event.preventDefault(); }}
      >
        <SheetHeader className="relative shrink-0 border-b px-5 py-5 pr-16 text-left sm:px-6 sm:pr-16">
          <SheetTitle className="text-xl">{t("application.title")}</SheetTitle>
          <SheetDescription>{t("application.description")}</SheetDescription>
          <Button variant="ghost" size="icon" className="absolute right-3 top-3 size-11" disabled={submitting} aria-label={t("common.close")} onClick={() => changeOpen(false)}>
            <X aria-hidden="true" className="size-5" />
          </Button>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6">
          {open && <MemberApplicationForm initialIdentity={initialIdentity} onSubmittingChange={setSubmitting} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}
