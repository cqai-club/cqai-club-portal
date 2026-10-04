"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { BriefcaseBusiness, CheckCircle2, Pencil, Plus, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useTranslations } from "@/lib/i18n/client";
import type { MemberProjectSubmission, MemberProjectSubmissionDetail } from "@/lib/member/project-submission-types";
import { MEMBER_PROJECT_SUBMISSION_PATH, memberLoginPath } from "@/lib/member/return-to";
import ProjectSubmissionForm from "./project-submission-form";

const statusClasses: Record<string, string> = {
  new: "border-border bg-muted text-muted-foreground",
  reviewing: "border-primary/20 bg-primary/10 text-primary",
  approved: "border-primary/20 bg-primary/10 text-primary",
  rejected: "border-destructive/20 bg-destructive/5 text-destructive",
  draft: "border-border bg-muted text-muted-foreground",
  published: "border-primary/20 bg-primary/10 text-primary",
  pending_review: "border-primary/20 bg-primary/10 text-primary",
  unpublished: "border-border bg-muted text-muted-foreground",
};

export default function ProjectSubmissionManager({ initialOwner }: { initialOwner: string }) {
  const { t, language } = useTranslations();
  const [items, setItems] = useState<MemberProjectSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [submittedName, setSubmittedName] = useState("");
  const [savedAsEdit, setSavedAsEdit] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDetail, setEditDetail] = useState<MemberProjectSubmissionDetail | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");
  const [editSessionExpired, setEditSessionExpired] = useState(false);
  const listHeading = useRef<HTMLHeadingElement>(null);
  const drawerTitle = useRef<HTMLHeadingElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const drawerTrigger = useRef<HTMLButtonElement | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const detailRequest = useRef<AbortController | null>(null);

  const loadProjects = useCallback(async () => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    setError("");
    setSessionExpired(false);
    try {
      const response = await fetch("/member/api/project-submissions", { cache: "no-store", signal: controller.signal });
      if (!response.ok) {
        setSessionExpired(response.status === 401);
        throw new Error("Project list unavailable");
      }
      const result = await response.json() as { data: MemberProjectSubmission[] };
      if (!Array.isArray(result.data)) throw new Error("Invalid project list");
      if (!controller.signal.aborted) {
        setItems(result.data);
        setLoaded(true);
      }
    } catch {
      if (!controller.signal.aborted) setError("listError");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProjects();
    return () => { activeRequest.current?.abort(); detailRequest.current?.abort(); };
  }, [loadProjects]);

  async function openEdit(id: string, trigger: HTMLButtonElement) {
    detailRequest.current?.abort();
    const controller = new AbortController();
    detailRequest.current = controller;
    drawerTrigger.current = trigger;
    setEditingId(id);
    setEditDetail(null);
    setEditError("");
    setEditSessionExpired(false);
    setEditLoading(true);
    setSubmittedName("");
    setShowForm(true);
    try {
      const response = await fetch(`/member/api/project-submissions/${encodeURIComponent(id)}`, { cache: "no-store", signal: controller.signal });
      const detail = await response.json();
      if (!response.ok) {
        if (!controller.signal.aborted) setEditSessionExpired(response.status === 401);
        if (response.status === 409) void loadProjects();
        throw new Error(detail.error || t("projectSubmission.editLoadError"));
      }
      if (!controller.signal.aborted) setEditDetail(detail);
    } catch (error) {
      if (!controller.signal.aborted) setEditError(error instanceof Error ? error.message : t("projectSubmission.editLoadError"));
    } finally {
      if (!controller.signal.aborted) setEditLoading(false);
    }
  }

  function projectSubmitted(submission: MemberProjectSubmission) {
    // A refresh started before this write must not overwrite the new record.
    activeRequest.current?.abort();
    setLoading(false);
    setItems(current => editingId ? current.map(item => item.id === submission.id ? submission : item) : [submission, ...current.filter(item => item.id !== submission.id)]);
    setSavedAsEdit(Boolean(editingId));
    setSubmittedName(submission.name);
    setShowForm(false);
    void loadProjects();
  }

  const formatDate = (value: string) => new Intl.DateTimeFormat(language === "en" ? "en-GB" : "zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  const statusLabel = (value: string) => t(`projectSubmission.statuses.${Object.hasOwn(statusClasses, value) ? value : "unknown"}`);

  return <Sheet open={showForm} onOpenChange={open => {
    if (creating) return;
    setShowForm(open);
    if (open) setSubmittedName("");
    else detailRequest.current?.abort();
  }}><div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-xs font-semibold tracking-[0.14em] text-primary">CQAI CLUB</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{t("projectSubmission.title")}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">{t("projectSubmission.manageDescription")}</p>
      </div>
      <SheetTrigger asChild><Button ref={addButton} type="button" className="min-h-11" onClick={() => {
        detailRequest.current?.abort(); setEditingId(null); setEditDetail(null); setEditError(""); drawerTrigger.current = addButton.current;
      }}><Plus aria-hidden="true" className="size-4" />{t("projectSubmission.addProject")}</Button></SheetTrigger>
    </header>

    {submittedName && <div role="status" className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm leading-6">
      <CheckCircle2 aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary" />
      <p>{t(savedAsEdit ? "projectSubmission.edited" : "projectSubmission.added", { name: submittedName })}</p>
    </div>}

    <section aria-labelledby="my-projects-heading" className="space-y-4" aria-busy={loading}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="my-projects-heading" ref={listHeading} tabIndex={-1} className="scroll-mt-20 text-lg font-semibold focus:outline-none">{t("projectSubmission.myProjects")}{loaded && <span className="ml-2 text-sm font-normal text-muted-foreground">({items.length})</span>}</h2>
        <Button type="button" variant="outline" disabled={loading} onClick={() => void loadProjects()} className="min-h-11"><RefreshCw aria-hidden="true" className={`size-4 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`} />{t(loading ? "projectSubmission.loading" : "projectSubmission.refresh")}</Button>
      </div>
      {error && <div role="alert" className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
        <p>{t(sessionExpired ? "projectSubmission.listSessionError" : "projectSubmission.listError")}</p>
        {sessionExpired && <Button asChild variant="outline"><Link href={memberLoginPath(MEMBER_PROJECT_SUBMISSION_PATH, true)}>{t("projectSubmission.signInAgain")}</Link></Button>}
      </div>}
      {!loaded && loading && <p role="status" className="py-8 text-sm text-muted-foreground">{t("projectSubmission.loading")}</p>}
      {loaded && !items.length && <Card><CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <BriefcaseBusiness aria-hidden="true" className="size-8 text-muted-foreground" />
        <h3 className="font-semibold">{t("projectSubmission.emptyTitle")}</h3>
        <p className="max-w-md text-sm leading-6 text-muted-foreground">{t("projectSubmission.emptyDescription")}</p>
      </CardContent></Card>}
      {!!items.length && <ul className="grid gap-4 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
        {items.map(item => <li key={item.id} className="min-w-0"><Card className="h-full gap-4 py-4">
          <CardHeader className="space-y-2 px-4">
            <div className="flex items-start justify-between gap-3">
              <CardTitle className="min-w-0 break-words text-base leading-6">{item.name}</CardTitle>
              {item.editable && item.reviewStatus === "new" && <Button type="button" variant="ghost" size="icon" className="-mt-2 -mr-2 size-11 shrink-0" aria-label={t("projectSubmission.editProject")} title={t("projectSubmission.editProject")} onClick={event => void openEdit(item.id, event.currentTarget)}><Pencil aria-hidden="true" className="size-4" /></Button>}
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className={`rounded-full border px-3 py-1 font-medium ${statusClasses[item.reviewStatus] ?? statusClasses.new}`}>{t("projectSubmission.reviewStatus")} · {statusLabel(item.reviewStatus)}</span>
              {item.publicationStatus && <span className={`rounded-full border px-3 py-1 font-medium ${statusClasses[item.publicationStatus] ?? statusClasses.draft}`}>{t("projectSubmission.publicationStatus")} · {statusLabel(item.publicationStatus)}</span>}
            </div>
          </CardHeader>
          <CardContent className="space-y-3 px-4">
            {item.coverUrl && <Image src={item.coverUrl} alt={`${item.name} · ${t("projectSubmission.fields.projectCover")}`} width={800} height={500} unoptimized className="aspect-[8/5] w-full rounded-lg border object-cover" />}
            <p className="break-words text-sm leading-6 text-muted-foreground">{item.summary}</p>
            <dl className="space-y-1.5 text-[13px] leading-5">
              {item.stage && <div className="flex flex-wrap justify-between gap-x-4 gap-y-1"><dt className="text-muted-foreground">{t("projectSubmission.fields.stage")}</dt><dd>{["idea", "build", "pilot", "live"].includes(item.stage) ? t(`projectSubmission.stages.${item.stage}`) : item.stage}</dd></div>}
              <div className="flex flex-wrap justify-between gap-x-4 gap-y-1"><dt className="text-muted-foreground">{t("projectSubmission.createdAt")}</dt><dd><time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time></dd></div>
              <div className="flex flex-wrap justify-between gap-x-4 gap-y-1"><dt className="text-muted-foreground">{t("projectSubmission.updatedAt")}</dt><dd><time dateTime={item.updatedAt}>{formatDate(item.updatedAt)}</time></dd></div>
            </dl>
            {item.publicUrl && <Button asChild variant="outline" className="min-h-11"><Link href={item.publicUrl}>{t("projectSubmission.viewPublicProject")}</Link></Button>}
          </CardContent>
        </Card></li>)}
      </ul>}
    </section>

    <SheetContent side="right"
      className="member-center flex h-dvh w-full flex-col gap-0 p-0 text-foreground sm:max-w-3xl motion-reduce:animate-none motion-reduce:transition-none [&>button]:hidden"
      onOpenAutoFocus={event => { event.preventDefault(); drawerTitle.current?.focus(); }}
      onCloseAutoFocus={event => { event.preventDefault(); (submittedName ? listHeading.current : (drawerTrigger.current?.isConnected ? drawerTrigger.current : addButton.current))?.focus(); }}
      onInteractOutside={event => event.preventDefault()}
      onEscapeKeyDown={event => { if (creating) event.preventDefault(); }}>
      <SheetHeader className="shrink-0 border-b px-4 py-4 text-left sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <SheetTitle ref={drawerTitle} tabIndex={-1} className="text-xl focus:outline-none">{t(editingId ? "projectSubmission.editProject" : "projectSubmission.addProject")}</SheetTitle>
          <SheetClose asChild><Button type="button" variant="ghost" size="icon" disabled={creating} className="size-11 shrink-0" aria-label={t(editingId ? "projectSubmission.cancelEdit" : "projectSubmission.cancelAdd")}><X aria-hidden="true" className="size-5" /></Button></SheetClose>
        </div>
        <SheetDescription className="leading-6">{t(editingId ? "projectSubmission.editDescription" : "projectSubmission.description")}</SheetDescription>
      </SheetHeader>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6">
        {editingId && editLoading && <p role="status" className="text-sm text-muted-foreground">{t("projectSubmission.loadingDetails")}</p>}
        {editingId && editError && <div role="alert" className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p>{editError}</p>
          {editSessionExpired && <Button asChild variant="outline"><Link href={memberLoginPath(MEMBER_PROJECT_SUBMISSION_PATH, true)}>{t("projectSubmission.signInAgain")}</Link></Button>}
        </div>}
        {(!editingId || editDetail) && <ProjectSubmissionForm key={editingId ?? "new"} initialOwner={initialOwner} initialDetail={editDetail ?? undefined} onSubmitted={projectSubmitted} onSubmittingChange={setCreating} onConflict={() => void loadProjects()} />}
      </div>
    </SheetContent>
  </div></Sheet>;
}
