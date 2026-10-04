"use client";

import Link from "next/link";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useTranslations } from "@/lib/i18n/client";

export default function InnovationMembershipPrompt({ section }: { section: "resources" | "projectSubmission" }) {
  const { t } = useTranslations();
  return (
    <div className="space-y-7">
      <header>
        <p className="text-xs font-semibold tracking-[0.14em] text-primary">CQAI CLUB</p>
        <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">{t(`${section}.title`)}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{t(`${section}.description`)}</p>
      </header>
      <Card className="items-center gap-4 px-6 py-10 text-center">
        <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <LockKeyhole aria-hidden="true" className="size-6" />
        </span>
        <h2 className="text-lg font-semibold">{t(`${section}.membershipRequired`)}</h2>
        <p className="max-w-md text-sm leading-6 text-muted-foreground">{t(`${section}.membershipHint`)}</p>
        <Button asChild className="min-h-11">
          <Link href="/member/dashboard/plans?application=open">
            {t(`${section}.applyMembership`)}
            <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
          </Link>
        </Button>
      </Card>
    </div>
  );
}
