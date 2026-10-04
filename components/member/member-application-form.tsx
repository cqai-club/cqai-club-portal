"use client";

import { NativeSelect } from "@/components/ui/native-select";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, ClipboardList, LoaderCircle, Mail, RefreshCw } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslations } from "@/lib/i18n/client";
import {
  applicationOptions,
  type MemberApplicationDTO,
  type MemberApplicationPayload,
} from "@/lib/member/application-fields";
import { MEMBER_APPLICATION_PATH, memberLoginPath } from "@/lib/member/return-to";
import { applicationStatusKey } from "@/lib/member/application-status";
import { cn } from "@/lib/utils";

type Field = keyof MemberApplicationPayload;
type MultiField = "provideRes" | "needRes" | "events";
type TextField = Exclude<Field, MultiField>;
type OptionField = keyof typeof applicationOptions;
type OtherField = "orgTypeOther" | "provideResOther" | "needResOther" | "purposeOther" | "eventsOther" | "cityOther";
type FieldErrors = Partial<Record<Field, string>>;
export type InitialIdentity = Pick<MemberApplicationPayload, "name" | "phone" | "email">;
type ApplicationResponse = {
  application?: MemberApplicationDTO | null;
  code?: string;
  field?: string;
};

const otherFields: Partial<Record<OptionField, OtherField>> = {
  orgType: "orgTypeOther", provideRes: "provideResOther", needRes: "needResOther",
  purpose: "purposeOther", events: "eventsOther", city: "cityOther",
};
const requiredTextFields = ["name", "phone", "wechat", "organization", "title"] as const;
const requiredOptionFields = ["orgType", "purpose", "timePref", "city", "roleIntent", "privacy"] as const;
const textLimits: Partial<Record<TextField, number>> = {
  name: 80, phone: 11, wechat: 80, email: 254, organization: 200, title: 100,
  orgTypeOther: 200, provideResOther: 200, needResOther: 200, purposeOther: 200,
  eventsOther: 200, cityOther: 200, bio: 100,
};
const emailValidator = z.email();
const recordSections: { id: string; fields: Field[] }[] = [
  { id: "identity", fields: ["name", "phone", "wechat", "email", "organization", "title", "orgType", "orgTypeOther"] },
  { id: "resources", fields: ["provideRes", "provideResOther", "needRes", "needResOther"] },
  { id: "motivation", fields: ["purpose", "purposeOther", "events", "eventsOther", "timePref"] },
  { id: "supplementary", fields: ["city", "cityOther", "roleIntent", "bio"] },
  { id: "privacy", fields: ["privacy"] },
];
const contactEmail = "781728683@qq.com";
const controlClass = "min-h-11 rounded-lg text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function initialPayload(identity: InitialIdentity): MemberApplicationPayload {
  return {
    ...identity, wechat: "", organization: "", title: "", orgType: "", orgTypeOther: "",
    provideRes: [], provideResOther: "", needRes: [], needResOther: "", purpose: "", purposeOther: "",
    events: [], eventsOther: "", timePref: "", city: "", cityOther: "", roleIntent: "", bio: "", privacy: "",
  };
}

function fieldValidationMessage(field: Field): string {
  if (field === "phone" || field === "email" || field === "needRes" || field === "bio") return field;
  if (field.endsWith("Other")) return "other";
  if (field === "provideRes" || field === "events") return "selectAtLeastOne";
  return "invalid";
}

function validateApplication(payload: MemberApplicationPayload): FieldErrors {
  const errors: FieldErrors = {};
  for (const field of requiredTextFields) {
    if (!payload[field].trim()) errors[field] = "required";
  }
  if (payload.phone.trim() && !/^1[3-9]\d{9}$/.test(payload.phone.trim())) errors.phone = "phone";
  if (payload.email.trim() && !emailValidator.safeParse(payload.email.trim()).success) errors.email = "email";
  for (const field of requiredOptionFields) {
    if (!payload[field]) errors[field] = "required";
  }
  for (const field of ["provideRes", "events"] as const) {
    if (!payload[field].length) errors[field] = "selectAtLeastOne";
  }
  if (payload.needRes.length < 1 || payload.needRes.length > 3) errors.needRes = "needRes";
  for (const [field, otherField] of Object.entries(otherFields) as [OptionField, OtherField][]) {
    const selection = payload[field];
    if ((Array.isArray(selection) ? selection.includes("其他") : selection === "其他") && !payload[otherField].trim()) {
      errors[otherField] = "other";
    }
  }
  for (const [field, max] of Object.entries(textLimits) as [TextField, number][]) {
    if (field !== "phone" && payload[field].trim().length > max) errors[field] = "tooLong";
  }
  if (payload.bio.length > 100) errors.bio = "bio";
  return errors;
}

function apiErrorMessage(status: number, code?: string): string {
  if (status === 401 || code === "UNAUTHORIZED") return "session";
  if (code === "PHONE_ALREADY_USED") return "phoneUsed";
  if (code === "ALREADY_SUBMITTED") return "alreadySubmitted";
  if (status === 429 || code === "RATE_LIMITED") return "rateLimited";
  if (status === 403 || code === "INVALID_ORIGIN") return "forbidden";
  if (status === 415 || code === "INVALID_CONTENT_TYPE") return "unsupportedMedia";
  if (status === 413 || code === "PAYLOAD_TOO_LARGE") return "tooLarge";
  if (code === "INVALID_JSON") return "unsupportedMedia";
  if (code === "VALIDATION_ERROR") return "validation";
  return "submit";
}

export default function MemberApplicationForm({ initialIdentity, onSubmittingChange }: { initialIdentity: InitialIdentity; onSubmittingChange: (submitting: boolean) => void }) {
  const { t, language } = useTranslations();
  const [form, setForm] = useState(() => initialPayload(initialIdentity));
  const [application, setApplication] = useState<MemberApplicationDTO | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("load");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submissionPending = useRef(false);
  const errorSummary = useRef<HTMLDivElement>(null);
  const submittedSummary = useRef<HTMLDivElement>(null);

  const loadApplication = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/member/api/application", { cache: "no-store", signal });
      const data = await response.json() as ApplicationResponse;
      if (!response.ok) {
        setLoadError(response.status === 401 || data.code === "UNAUTHORIZED" ? "session" : "load");
        setLoadState("error");
        return;
      }
      if (data.application === undefined) throw new Error("Missing application record");
      setApplication(data.application);
      setLoadState("ready");
    } catch {
      if (signal?.aborted) return;
      setLoadError("load");
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadApplication(controller.signal);
    return () => controller.abort();
  }, [loadApplication]);

  function clearFieldError(field: Field) {
    setErrors(previous => {
      if (!previous[field]) return previous;
      const next = { ...previous };
      delete next[field];
      return next;
    });
  }

  function updateText(field: TextField, value: string) {
    setForm(previous => ({ ...previous, [field]: value }));
    clearFieldError(field);
    const otherField = otherFields[field as OptionField];
    if (otherField && value !== "其他") clearFieldError(otherField);
  }

  function updateMultiple(field: MultiField, value: string, checked: boolean) {
    setForm(previous => ({
      ...previous,
      [field]: checked ? [...previous[field], value] : previous[field].filter(item => item !== value),
    }));
    clearFieldError(field);
    const otherField = otherFields[field];
    if (otherField && value === "其他" && !checked) clearFieldError(otherField);
  }

  function optionText(field: OptionField, value: string) {
    const index = (applicationOptions[field] as readonly string[]).indexOf(value);
    return index < 0 ? value : t(`application.options.${field}.${index}`);
  }

  function errorText(field: Field, error: string) {
    return t(`application.errors.${error}`, {
      field: t(`application.fields.${field}`),
      max: String(textLimits[field as TextField] || 100),
    });
  }

  function focusErrors() {
    requestAnimationFrame(() => errorSummary.current?.focus());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionPending.current || application || loadState !== "ready") return;
    const validationErrors = validateApplication(form);
    setErrors(validationErrors);
    setSubmitError(null);
    if (Object.keys(validationErrors).length) {
      focusErrors();
      return;
    }

    submissionPending.current = true;
    setSubmitting(true);
    onSubmittingChange(true);
    try {
      const response = await fetch("/member/api/application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json() as ApplicationResponse;
      if (response.ok && data.application) {
        setApplication(data.application);
        requestAnimationFrame(() => submittedSummary.current?.focus());
        return;
      }
      if (response.status === 409 && data.code === "ALREADY_SUBMITTED") {
        await loadApplication();
        return;
      }
      if (data.code === "VALIDATION_ERROR" && data.field && Object.hasOwn(form, data.field)) {
        const field = data.field as Field;
        setErrors({ [field]: validateApplication(form)[field] || fieldValidationMessage(field) });
      }
      setSubmitError(apiErrorMessage(response.status, data.code));
      focusErrors();
    } catch {
      setSubmitError("network");
      focusErrors();
    } finally {
      submissionPending.current = false;
      setSubmitting(false);
      onSubmittingChange(false);
    }
  }

  function retryLoad() {
    setLoadState("loading");
    void loadApplication();
  }

  function inlineError(field: Field) {
    return errors[field] ? (
      <p id={`application-${field}-error`} className="text-sm leading-6 text-destructive">{errorText(field, errors[field])}</p>
    ) : null;
  }

  function textInput(field: TextField, required = true, type = "text") {
    const isOther = field.endsWith("Other");
    return (
      <div key={field} className="space-y-2">
        <Label htmlFor={`application-${field}`} className="leading-6">
          {t(`application.fields.${field}`)}
          {required ? <span aria-hidden="true" className="text-destructive">*</span> : <span className="text-xs text-muted-foreground">{t("application.optional")}</span>}
        </Label>
        <Input
          id={`application-${field}`} name={field} type={type} value={form[field]} required={required}
          autoComplete={field === "name" ? "name" : field === "phone" ? "tel-national" : field === "email" ? "email" : field === "organization" ? "organization" : field === "title" ? "organization-title" : "off"}
          inputMode={field === "phone" ? "numeric" : undefined}
          maxLength={textLimits[field]}
          placeholder={t(`application.placeholders.${isOther ? "other" : field}`)}
          aria-invalid={Boolean(errors[field])}
          aria-describedby={errors[field] ? `application-${field}-error` : undefined}
          onChange={event => updateText(field, event.target.value)}
          className={controlClass}
        />
        {inlineError(field)}
      </div>
    );
  }

  function selectionGroup(field: OptionField, multiple = false) {
    const selection = form[field];
    const hintId = `application-${field}-hint`;
    const otherField = otherFields[field];
    const hasOther = Array.isArray(selection) ? selection.includes("其他") : selection === "其他";
    return (
      <div key={field} className="space-y-3">
        <fieldset
          id={`application-${field}`} tabIndex={-1} aria-required="true" aria-invalid={Boolean(errors[field])}
          aria-describedby={[multiple ? hintId : "", errors[field] ? `application-${field}-error` : ""].filter(Boolean).join(" ") || undefined}
          className="min-w-0 space-y-3 rounded-lg scroll-mt-24 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <legend className="mb-2 text-sm font-medium leading-6">
            {t(`application.fields.${field}`)} <span aria-hidden="true" className="text-destructive">*</span>
          </legend>
          {multiple && <p id={hintId} className="text-sm leading-6 text-muted-foreground">{t(field === "needRes" ? "application.needsHint" : "application.multipleHint")}</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            {applicationOptions[field].map((value, index) => {
              const checked = Array.isArray(selection) ? selection.includes(value) : selection === value;
              const atLimit = field === "needRes" && Array.isArray(selection) && selection.length >= 3 && !checked;
              return (
                <label
                  key={value} htmlFor={`application-${field}-${index}`}
                  className={cn("flex min-h-11 items-center gap-3 rounded-lg border px-3 py-3 text-sm leading-6 transition-colors", checked ? "border-primary/50 bg-primary/5" : "border-border hover:bg-muted/50", atLimit ? "cursor-not-allowed opacity-50" : "cursor-pointer")}
                >
                  <input
                    id={`application-${field}-${index}`} name={field} type={multiple ? "checkbox" : "radio"}
                    value={value} checked={checked} disabled={atLimit} required={!multiple && index === 0}
                    aria-invalid={Boolean(errors[field])}
                    aria-describedby={errors[field] ? `application-${field}-error` : undefined}
                    onChange={event => multiple ? updateMultiple(field as MultiField, value, event.target.checked) : updateText(field as TextField, value)}
                    className="size-4 shrink-0 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                  <span className="min-w-0 break-words">{optionText(field, value)}</span>
                </label>
              );
            })}
          </div>
          {multiple && <p className="text-xs text-muted-foreground" aria-live="polite">{t("application.selectedCount", { count: String((selection as string[]).length) })}</p>}
          {inlineError(field)}
        </fieldset>
        {hasOther && otherField && textInput(otherField)}
      </div>
    );
  }

  function recordValue(field: Field) {
    const value = application![field];
    if (Array.isArray(value)) return value.map(item => optionText(field as OptionField, item)).join(language === "en" ? "; " : "、");
    if (Object.hasOwn(applicationOptions, field)) return optionText(field as OptionField, value);
    return value || t("application.notProvided");
  }

  const fieldErrors = Object.entries(errors) as [Field, string][];

  return (
    <div className="mx-auto max-w-4xl space-y-6 lg:space-y-7">

      {loadState === "loading" && !application && (
        <Card className="gap-3 px-5 py-6 sm:px-6" role="status">
          <LoaderCircle aria-hidden="true" className="size-5 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">{t("application.loading")}</p>
        </Card>
      )}

      {loadState === "error" && (
        <Card className="gap-4 border-destructive/30 px-5 py-6 sm:px-6" role="alert">
          <p className="text-sm leading-6">{t(`application.errors.${loadError}`)}</p>
          <div className="flex flex-wrap gap-3">
            {loadError === "session" ? (
              <Button asChild className="min-h-11 h-auto whitespace-normal rounded-lg py-3"><a href={memberLoginPath(MEMBER_APPLICATION_PATH, true)}>{t("application.signInAgain")}</a></Button>
            ) : <Button type="button" variant="outline" onClick={retryLoad} className="min-h-11 rounded-lg">{t("application.retry")}</Button>}
          </div>
        </Card>
      )}

      {application && (
        <>
          <Card ref={submittedSummary} tabIndex={-1} className="gap-4 border-primary/30 px-5 py-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-6" aria-labelledby="application-submitted-title">
            <div className="flex items-start gap-3">
              <CheckCircle2 aria-hidden="true" className="mt-1 size-6 shrink-0 text-primary" />
              <div>
                <h2 id="application-submitted-title" className="text-lg font-semibold">{t(`application.review.${applicationStatusKey(application)}Title`)}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{t(`application.review.${applicationStatusKey(application)}Description`)}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("application.submittedNote")}</p>
                {application.reviewNote && <p className="mt-3 whitespace-pre-wrap text-sm">{t("application.review.note")}{application.reviewNote}</p>}
              </div>
            </div>
            <dl className="grid gap-4 border-t pt-4 text-sm sm:grid-cols-2">
              <div><dt className="text-muted-foreground">{t("application.submittedAt")}</dt><dd className="mt-1">{new Intl.DateTimeFormat(language === "en" ? "en-US" : "zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "medium", timeStyle: "short" }).format(new Date(application.createdAt))}</dd></div>
              <div><dt className="text-muted-foreground">{t("application.submittedId")}</dt><dd className="mt-1 break-all font-mono text-xs">{application.id}</dd></div>
            </dl>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button type="button" variant="outline" onClick={retryLoad} disabled={loadState === "loading"} className="min-h-11 h-auto whitespace-normal rounded-lg py-3">
                {loadState === "loading" ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <RefreshCw aria-hidden="true" className="size-4" />}
                {t(loadState === "loading" ? "application.refreshing" : "application.refreshRecord")}
              </Button>
              <Button variant="outline" asChild className="min-h-11 h-auto whitespace-normal rounded-lg py-3"><a href={`mailto:${contactEmail}`}><Mail aria-hidden="true" className="size-4" />{t("application.contact")}</a></Button>
            </div>
          </Card>
          <section aria-label={t("application.viewRecord")} className="space-y-5">
            {recordSections.map(section => (
              <Card key={section.id} className="gap-5 px-5 py-6 sm:px-6">
                <h2 className="text-lg font-semibold">{t(`application.sections.${section.id}`)}</h2>
                <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
                  {section.fields.filter(field => !field.endsWith("Other") || application[field]).map(field => (
                    <div key={field} className="min-w-0">
                      <dt className="text-sm text-muted-foreground">{t(`application.fields.${field}`)}</dt>
                      <dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{recordValue(field)}</dd>
                    </div>
                  ))}
                </dl>
              </Card>
            ))}
          </section>
        </>
      )}

      {loadState === "ready" && !application && (
        <form noValidate onSubmit={submit} className="space-y-5" aria-busy={submitting}>
          <p className="text-sm leading-6 text-muted-foreground">{t("application.requiredHint")}</p>
          {(fieldErrors.length > 0 || submitError) && (
            <div ref={errorSummary} role="alert" tabIndex={-1} aria-labelledby="application-error-title" className="scroll-mt-24 space-y-3 rounded-xl border border-destructive/40 bg-destructive/5 p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <h2 id="application-error-title" className="flex items-center gap-2 font-semibold"><AlertCircle aria-hidden="true" className="size-5 shrink-0" />{t("application.errorSummary")}</h2>
              {submitError && <p className="text-sm leading-6">{t(`application.errors.${submitError}`)}</p>}
              {fieldErrors.length > 0 && <ul className="space-y-1">{fieldErrors.map(([field, error]) => <li key={field}><a className="inline-flex min-h-11 items-center text-sm underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href={`#application-${field}`} onClick={event => { event.preventDefault(); document.getElementById(`application-${field}`)?.focus(); }}>{errorText(field, error)}</a></li>)}</ul>}
              {submitError === "session" && <Button asChild className="min-h-11 h-auto whitespace-normal rounded-lg py-3"><a href={memberLoginPath(MEMBER_APPLICATION_PATH, true)}>{t("application.signInAgain")}</a></Button>}
              {submitError === "phoneUsed" && <a className="inline-flex min-h-11 items-center gap-2 text-sm text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href={`mailto:${contactEmail}`}><Mail aria-hidden="true" className="size-4" />{t("application.contact")}</a>}
            </div>
          )}
          <fieldset disabled={submitting} className="min-w-0 space-y-5">
            <legend className="sr-only">{t("application.title")}</legend>
            <Card className="gap-5 px-5 py-6 sm:px-6">
              <h2 className="flex items-center gap-2 text-lg font-semibold"><ClipboardList aria-hidden="true" className="size-5 text-primary" />{t("application.sections.identity")}</h2>
              <p className="text-sm leading-6 text-muted-foreground">{t("application.identityHint")}</p>
              <div className="grid gap-5 sm:grid-cols-2">
                {textInput("name")}{textInput("phone", true, "tel")}{textInput("wechat")}{textInput("email", false, "email")}{textInput("organization")}{textInput("title")}
              </div>
              {selectionGroup("orgType")}
            </Card>
            <Card className="gap-6 px-5 py-6 sm:px-6">
              <h2 className="text-lg font-semibold">{t("application.sections.resources")}</h2>
              {selectionGroup("provideRes", true)}{selectionGroup("needRes", true)}
            </Card>
            <Card className="gap-6 px-5 py-6 sm:px-6">
              <h2 className="text-lg font-semibold">{t("application.sections.motivation")}</h2>
              {selectionGroup("purpose")}{selectionGroup("events", true)}{selectionGroup("timePref")}
            </Card>
            <Card className="gap-5 px-5 py-6 sm:px-6">
              <h2 className="text-lg font-semibold">{t("application.sections.supplementary")}</h2>
              <p className="text-sm leading-6 text-muted-foreground">{t("application.supplementaryHint")}</p>
              <div className="space-y-2">
                <Label htmlFor="application-city" className="leading-6">{t("application.fields.city")} <span aria-hidden="true" className="text-destructive">*</span></Label>
                <NativeSelect id="application-city" name="city" value={form.city} required onChange={event => updateText("city", event.target.value)} aria-invalid={Boolean(errors.city)} aria-describedby={errors.city ? "application-city-error" : undefined} className={cn(controlClass, "w-full min-w-0 border bg-background px-3 py-2 shadow-xs aria-invalid:border-destructive")}>
                  <option value="" disabled>{t("application.choose")}</option>
                  {applicationOptions.city.map(value => <option key={value} value={value}>{optionText("city", value)}</option>)}
                </NativeSelect>
                {inlineError("city")}
              </div>
              {form.city === "其他" && textInput("cityOther")}
              {selectionGroup("roleIntent")}
              <div className="space-y-2">
                <Label htmlFor="application-bio" className="leading-6">{t("application.fields.bio")} <span className="text-xs text-muted-foreground">{t("application.optional")}</span></Label>
                <textarea id="application-bio" name="bio" value={form.bio} maxLength={100} rows={4} placeholder={t("application.placeholders.bio")} onChange={event => updateText("bio", event.target.value)} aria-invalid={Boolean(errors.bio)} aria-describedby={["application-bio-hint", errors.bio ? "application-bio-error" : ""].filter(Boolean).join(" ")} className={cn(controlClass, "w-full min-w-0 resize-y border bg-transparent px-3 py-3 placeholder:text-muted-foreground aria-invalid:border-destructive")} />
                <p id="application-bio-hint" className="text-xs text-muted-foreground">{t("application.bioCount", { count: String(form.bio.length) })}</p>
                {inlineError("bio")}
              </div>
            </Card>
            <Card className="gap-5 px-5 py-6 sm:px-6">
              <h2 className="text-lg font-semibold">{t("application.sections.privacy")}</h2>
              {selectionGroup("privacy")}
              <p className="text-sm leading-6 text-muted-foreground">{t("application.privacyHint")}</p>
            </Card>
            <Button type="submit" disabled={submitting || submitError === "session"} className="min-h-11 h-auto w-full whitespace-normal rounded-lg px-6 py-3 sm:w-auto">
              {submitting && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
              {t(submitting ? "application.submitting" : submitError ? "application.retrySubmit" : "application.submit")}
            </Button>
          </fieldset>
        </form>
      )}
    </div>
  );
}
