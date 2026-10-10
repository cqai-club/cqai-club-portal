"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { CheckCircle2, LockKeyhole, Mail, MapPin, MessageCircle, Sparkles, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useTranslations } from "@/lib/i18n/client";
import MemberApplicationDrawer from "@/components/member/member-application-drawer";
import type { InitialIdentity } from "@/components/member/member-application-form";

const basicBenefits = ["activities", "community", "venue"] as const;
const innovationBenefits = ["resources", "projects", "aiGateway"] as const;

const contactEmail = "781728683@qq.com";

export default function MembershipTypes({ initialIdentity, currentMembership }: { initialIdentity: InitialIdentity; currentMembership: "ordinary" | "chuangxiang" | null }) {
  const { t } = useTranslations();
  const router = useRouter();
  const [verifying, startVerification] = useTransition();
  const [contactOpen, setContactOpen] = useState(false);
  const CurrentIcon = currentMembership === "chuangxiang" ? Sparkles : UserRound;
  const activeBenefits = currentMembership === "chuangxiang" ? [...basicBenefits, ...innovationBenefits] : basicBenefits;

  return (
    <div className="space-y-7 lg:space-y-8">
      <header>
        <p className="text-xs font-semibold tracking-[0.14em] text-primary">CQAI CLUB</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{t("plans.title")}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">{t("plans.description")}</p>
      </header>

      <section aria-label={t("plans.currentMembership")}>
        {currentMembership ? <Card className="gap-0 border-t-2 border-t-primary px-5 py-6 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><CurrentIcon aria-hidden="true" className="size-6" /></span>
              <div><p className="text-sm text-muted-foreground">{t("plans.currentMembership")}</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">{t(`plans.${currentMembership}.name`)}</h2></div>
            </div>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">{t("plans.active")}</span>
          </div>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">{t(`plans.${currentMembership}.currentDescription`)}</p>
          <p className="mt-2 text-sm font-medium">{t(`plans.${currentMembership}.price`)}</p>
          <div className="mt-6 border-t pt-5">
            <h3 className="font-semibold">{t("plans.activeBenefits")}</h3>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">{activeBenefits.map(benefit => <li key={benefit} className="flex items-start gap-2 text-sm leading-6"><CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" /><span>{t(`plans.benefits.${benefit}`)}</span></li>)}</ul>
          </div>
        </Card> : <Card className="items-start gap-4 px-5 py-6 sm:px-6">
          <h2 className="text-lg font-semibold">{t("plans.currentMembership")}</h2>
          <p role="alert" className="text-sm leading-6 text-muted-foreground">{t("plans.membershipUnavailable")}</p>
          <Button variant="outline" className="min-h-11" disabled={verifying} onClick={() => startVerification(() => router.refresh())}>{t(verifying ? "common.loading" : "plans.retryMembership")}</Button>
        </Card>}
      </section>

      {currentMembership === "ordinary" ? <section aria-labelledby="unopened-benefits-title" className="space-y-4">
        <div><h2 id="unopened-benefits-title" className="text-lg font-semibold">{t("plans.unopenedBenefits")}</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">{t("plans.upgradeDescription")}</p></div>
        <Card className="gap-0 px-5 py-6 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-center gap-3"><Sparkles aria-hidden="true" className="size-5 text-primary" /><h3 className="text-lg font-semibold">{t("plans.chuangxiang.name")}</h3></div><span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">{t("plans.inactive")}</span></div>
          <p className="mt-3 text-sm font-medium">{t("plans.chuangxiang.price")}</p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">{innovationBenefits.map(benefit => <li key={benefit} className="flex items-start gap-2 text-sm leading-6"><LockKeyhole aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" /><span>{t(`plans.benefits.${benefit}`)}</span></li>)}</ul>
          <div className="mt-5 max-w-sm"><MemberApplicationDrawer initialIdentity={initialIdentity} /></div>
        </Card>
      </section> : null}

      <Card className="gap-0 px-5 py-6 sm:px-6">
        <div className="flex items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <MapPin aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight">{t("plans.venueTitle")}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("plans.venueAddress")}</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{t("plans.venueBenefit")}</p>
          </div>
        </div>
      </Card>

      <Card className="gap-5 px-5 py-6 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{t("plans.contactTitle")}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("plans.contactDescription")}</p>
          </div>
          <Dialog open={contactOpen} onOpenChange={setContactOpen}>
            <DialogTrigger asChild>
              <Button className="h-auto min-h-11 w-full whitespace-normal rounded-lg px-5 py-3 lg:w-auto">
                <MessageCircle aria-hidden="true" className="size-4" />
                {t("plans.consult")}
              </Button>
            </DialogTrigger>
            <DialogContent className="member-center max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] overflow-y-auto rounded-xl text-foreground [&>button:last-child]:hidden">
              <DialogHeader className="pr-10 text-left">
                <DialogTitle className="leading-6">{t("plans.consult")}</DialogTitle>
                <DialogDescription className="leading-6">{t("plans.contactDescription")}</DialogDescription>
              </DialogHeader>
              <DialogClose asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-3 top-3 size-11 rounded-lg"
                  aria-label={t("common.close")}
                >
                  <X aria-hidden="true" className="size-5" />
                </Button>
              </DialogClose>
              <figure className="flex flex-col items-center gap-3">
                <Image
                  src="/images/wechat-qr.png"
                  alt={t("plans.qrAlt")}
                  width={360}
                  height={360}
                  sizes="240px"
                  className="size-60 max-w-full rounded-lg border bg-white p-2"
                />
                <figcaption className="text-center text-sm leading-6 text-muted-foreground">{t("plans.qrHint")}</figcaption>
              </figure>
              <a
                href={`mailto:${contactEmail}`}
                className="flex min-h-11 flex-wrap items-center justify-center gap-2 rounded-lg px-3 text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Mail aria-hidden="true" className="size-4" />
                <span>{t("plans.email")}</span>
                <span className="break-all">{contactEmail}</span>
              </a>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline" className="min-h-11 w-full rounded-lg">{t("common.close")}</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <div className="flex flex-col gap-2 border-t pt-4 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-x-6">
          <a
            href={`mailto:${contactEmail}`}
            className="flex min-h-11 items-center gap-2 rounded-md text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Mail aria-hidden="true" className="size-4 shrink-0" />
            <span className="break-all">{contactEmail}</span>
          </a>
          <p className="flex min-h-11 items-center gap-2">
            <MessageCircle aria-hidden="true" className="size-4 shrink-0" />
            <span><span className="sr-only">{t("plans.socialAccount")}: </span>{t("plans.socialHandle")}</span>
          </p>
        </div>
      </Card>
    </div>
  );
}
