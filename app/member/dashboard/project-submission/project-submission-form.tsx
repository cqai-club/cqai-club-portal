"use client";

import { NativeSelect } from "@/components/ui/native-select";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { BriefcaseBusiness, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MarkdownField } from "@/components/markdown/MarkdownField";
import { ProjectCoverCropDialog } from "@/components/project-cover-crop-dialog";
import { PROJECT_COVER_MAX_BYTES, type CroppedProjectCover } from "@/lib/client/project-cover";
import { useTranslations } from "@/lib/i18n/client";
import { MEMBER_PROJECT_SUBMISSION_PATH, memberLoginPath } from "@/lib/member/return-to";
import type { MemberProjectSubmission, MemberProjectSubmissionDetail } from "@/lib/member/project-submission-types";

const textFields = [
  { name: "projectName", max: 160, required: true },
  { name: "owner", max: 160, required: true },
  { name: "oneLine", max: 1000, required: true },
  { name: "projectFocus", max: 300, required: true },
  { name: "demoUrl", max: 2048, required: false },
  { name: "projectContact", max: 500, required: true },
] as const;

export default function ProjectSubmissionForm({ initialOwner, initialDetail, onSubmitted, onSubmittingChange, onConflict }: { initialOwner: string; initialDetail?: MemberProjectSubmissionDetail; onSubmitted: (submission: MemberProjectSubmission) => void; onSubmittingChange: (busy: boolean) => void; onConflict: () => void }) {
  const { t } = useTranslations();
  const [description, setDescription] = useState(initialDetail?.fields.projectBio ?? "");
  const [needs, setNeeds] = useState(initialDetail?.fields.needs ?? "");
  const [removeExistingCover, setRemoveExistingCover] = useState(false);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState("");
  const [cropSource, setCropSource] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const pending = useRef(false);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const visibleCover = coverPreview || (!removeExistingCover ? initialDetail?.coverUrl : "");

  useEffect(() => {
    if (!coverFile) { setCoverPreview(""); return; }
    const url = URL.createObjectURL(coverFile);
    setCoverPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [coverFile]);

  function showError(message: string, expired = false) {
    setError(message);
    setSessionExpired(expired);
    requestAnimationFrame(() => errorRef.current?.focus());
  }

  function selectCover(file?: File) {
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type) || file.size > PROJECT_COVER_MAX_BYTES) {
      showError(t("projectSubmission.imageError"));
      if (coverInputRef.current) coverInputRef.current.value = "";
      return;
    }
    setCropSource(file);
  }

  function finishCrop(result: CroppedProjectCover) {
    setCoverFile(result.file);
    setRemoveExistingCover(false);
    setCropSource(null);
    if (coverInputRef.current) coverInputRef.current.value = "";
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const form = event.currentTarget;
    setError("");
    setSessionExpired(false);
    if (!form.reportValidity() || !description.trim()) {
      showError(t("projectSubmission.requiredError"));
      return;
    }
    const data = new FormData(form);
    if (textFields.some(field => field.required && !String(data.get(field.name) ?? "").trim())) {
      showError(t("projectSubmission.requiredError"));
      return;
    }
    if (data.get("consent") !== "on") {
      showError(t("projectSubmission.consentError"));
      return;
    }
    data.set("type", "project");
    data.set("projectBio", description);
    data.set("needs", needs);
    if (coverFile) data.set("projectCover", coverFile, coverFile.name);
    if (initialDetail) {
      data.set("expectedUpdatedAt", initialDetail.updatedAt);
      data.set("removeCover", String(removeExistingCover));
    }
    pending.current = true;
    setSubmitting(true);
    onSubmittingChange(true);
    try {
      const response = await fetch(initialDetail ? `/member/api/project-submissions/${encodeURIComponent(initialDetail.id)}` : "/member/api/project-submissions", { method: initialDetail ? "PATCH" : "POST", body: data });
      const result = await response.json() as { id?: string; error?: string; submission?: MemberProjectSubmission };
      if (!response.ok) {
        if (response.status === 409) onConflict();
        showError(response.status === 401 ? t("projectSubmission.sessionError") : result.error || t("projectSubmission.submitError"), response.status === 401);
        return;
      }
      if (!result.id || !result.submission) throw new Error("Missing submission result");
      onSubmitted(result.submission);
    } catch {
      showError(t("projectSubmission.networkError"));
    } finally {
      pending.current = false;
      setSubmitting(false);
      onSubmittingChange(false);
    }
  }

  return (
    <div className="space-y-6">
        <form onSubmit={submit} className="space-y-6" noValidate>
          {error && <div ref={errorRef} role="alert" tabIndex={-1} className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm focus:outline-none">
            <p>{error}</p>
            {sessionExpired && <Button asChild variant="outline"><Link href={memberLoginPath(MEMBER_PROJECT_SUBMISSION_PATH, true)}>{t("projectSubmission.signInAgain")}</Link></Button>}
          </div>}
          <fieldset disabled={submitting} className="min-w-0 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><BriefcaseBusiness aria-hidden="true" className="size-5" />{t("projectSubmission.basics")}</CardTitle>
                <CardDescription>{t("projectSubmission.requiredHint")}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5 sm:grid-cols-2">
                {textFields.map(field => (
                  <div key={field.name} className={`space-y-2 ${field.name === "oneLine" ? "sm:col-span-2" : ""}`}>
                    <Label htmlFor={field.name}>{t(`projectSubmission.fields.${field.name}`)}{field.required ? " *" : ""}</Label>
                    <Input id={field.name} name={field.name} required={field.required} maxLength={field.max} defaultValue={initialDetail?.fields[field.name] ?? (field.name === "owner" ? initialOwner : "")} placeholder={t(`projectSubmission.placeholders.${field.name}`)} className="min-h-11" />
                  </div>
                ))}
                <div className="space-y-2">
                  <Label htmlFor="stage">{t("projectSubmission.fields.stage")} *</Label>
                  <NativeSelect id="stage" name="stage" required defaultValue={initialDetail?.fields.stage ?? ""} className="min-h-11 w-full rounded-md border bg-background px-3 text-sm">
                    <option value="">{t("projectSubmission.chooseStage")}</option>
                    {["idea", "build", "pilot", "live"].map(stage => <option key={stage} value={stage}>{t(`projectSubmission.stages.${stage}`)}</option>)}
                  </NativeSelect>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>{t("projectSubmission.details")}</CardTitle></CardHeader>
              <CardContent className="space-y-6">
                <MarkdownField id="projectBio" label={t("projectSubmission.fields.projectBio")} value={description} onChange={setDescription} maxLength={20000} required disabled={submitting} placeholder={t("projectSubmission.placeholders.projectBio")} />
                <MarkdownField id="needs" label={t("projectSubmission.fields.needs")} value={needs} onChange={setNeeds} maxLength={5000} rows={5} disabled={submitting} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><ImagePlus aria-hidden="true" className="size-5" />{t("projectSubmission.fields.projectCover")}</CardTitle><CardDescription>{t("projectSubmission.coverHint")}</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                {visibleCover && <div role="img" aria-label={t("projectSubmission.coverPreview")} className="aspect-[8/5] max-w-lg rounded-lg border bg-cover bg-center" style={{ backgroundImage: `url("${visibleCover}")` }} />}
                <Label htmlFor="projectCover">{t("projectSubmission.chooseCover")}</Label>
                <Input ref={coverInputRef} id="projectCover" type="file" accept="image/jpeg,image/png" onChange={event => selectCover(event.target.files?.[0])} className="min-h-11" />
                {(coverFile || visibleCover) && <div className="flex flex-wrap items-center gap-3 text-sm"><span className="break-all">{coverFile ? `${coverFile.name} · ${Math.ceil(coverFile.size / 1024)} KB` : initialDetail?.coverName}</span><Button type="button" variant="outline" className="min-h-11" onClick={() => { setCoverFile(null); setRemoveExistingCover(true); }}>{t("projectSubmission.removeCover")}</Button></div>}
              </CardContent>
            </Card>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border bg-card p-4 text-sm leading-6">
              <input name="consent" type="checkbox" required defaultChecked={initialDetail?.consent ?? false} className="mt-1 size-4 shrink-0 accent-primary" />
              <span>{t("projectSubmission.consent")}</span>
            </label>
            <Button type="submit" className="min-h-11 w-full sm:w-auto">{t(initialDetail ? (submitting ? "projectSubmission.saving" : "projectSubmission.saveChanges") : (submitting ? "projectSubmission.submitting" : "projectSubmission.submit"))}</Button>
          </fieldset>
        </form>
      <ProjectCoverCropDialog open={Boolean(cropSource)} file={cropSource} returnFocusRef={coverInputRef} onOpenChange={open => {
        if (!open) { setCropSource(null); if (coverInputRef.current) coverInputRef.current.value = ""; }
      }} onConfirm={finishCrop} />
    </div>
  );
}
