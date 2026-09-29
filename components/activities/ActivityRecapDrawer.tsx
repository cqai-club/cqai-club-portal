/* eslint-disable @next/next/no-img-element -- recap photos are served by the validated same-origin image API */
"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FileText, ImagePlus, X } from "lucide-react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MAX_RECAP_IMAGE_BYTES, MAX_RECAP_IMAGES } from "@/lib/club-activity-recap-config";
import type { ActivityRecapView, ActivityView } from "@/lib/club-activities";

type PendingImage = { file: File; previewUrl: string };
type FormState = { title: string; summary: string; content: string };

const inputClass = "mt-1.5 min-h-11 w-full rounded-lg border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60";

export function ActivityRecapDrawer({
  activity,
  open,
  preview,
  previewRecap,
  onClose,
  onSaved,
  returnFocusRef,
}: {
  activity: ActivityView | null;
  open: boolean;
  preview: boolean;
  previewRecap?: ActivityRecapView;
  onClose: () => void;
  onSaved: (recap: ActivityRecapView) => void;
  returnFocusRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const [form, setForm] = useState<FormState>({ title: "", summary: "", content: "" });
  const [existingImages, setExistingImages] = useState<ActivityRecapView["images"]>([]);
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [hasPublishedDetail, setHasPublishedDetail] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const baselineRef = useRef({ form, imageIds: [] as string[] });
  const pendingRef = useRef<PendingImage[]>([]);
  const requestRef = useRef(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const activityId = activity?.id;
  const activityTitle = activity?.title;
  const activitySummary = activity?.summary;
  const dirty = JSON.stringify(form) !== JSON.stringify(baselineRef.current.form) ||
    JSON.stringify(existingImages.map(image => image.id)) !== JSON.stringify(baselineRef.current.imageIds) ||
    pendingImages.length > 0;

  useEffect(() => { pendingRef.current = pendingImages; }, [pendingImages]);
  useEffect(() => () => { pendingRef.current.forEach(image => URL.revokeObjectURL(image.previewUrl)); }, []);

  useEffect(() => {
    if (!open || !activityId || !activityTitle || !activitySummary) return;
    const requestId = ++requestRef.current;
    const nextForm = { title: activityTitle, summary: activitySummary, content: "" };
    setForm(nextForm);
    baselineRef.current = { form: nextForm, imageIds: [] };
    setExistingImages([]);
    setPublishedAt(null);
    setHasPublishedDetail(false);
    setError("");
    setSuccess("");
    setLoading(!preview);
    if (preview) {
      if (previewRecap) {
        const loaded = { title: previewRecap.title, summary: previewRecap.summary, content: previewRecap.content };
        setForm(loaded);
        setExistingImages(previewRecap.images);
        setPublishedAt(previewRecap.publishedAt);
        setHasPublishedDetail(Boolean(previewRecap.publishedAt && previewRecap.content.trim()));
        baselineRef.current = { form: loaded, imageIds: previewRecap.images.map(image => image.id) };
      }
      return;
    }
    void fetch(`/api/v1/manage/activities/${encodeURIComponent(activityId)}/recap`, { credentials: "same-origin", cache: "no-store" })
      .then(async response => {
        const data = await response.json().catch(() => null) as (ActivityRecapView & { error?: string }) | null;
        if (!response.ok || !data) throw new Error(data?.error || "活动回顾读取失败。");
        return data;
      })
      .then(recap => {
        if (requestId !== requestRef.current) return;
        const loaded = { title: recap.title, summary: recap.summary, content: recap.content };
        setForm(loaded);
        setExistingImages(recap.images);
        setPublishedAt(recap.publishedAt);
        setHasPublishedDetail(Boolean(recap.publishedAt && recap.content.trim()));
        baselineRef.current = { form: loaded, imageIds: recap.images.map(image => image.id) };
      })
      .catch(caught => {
        if (requestId === requestRef.current) setError(caught instanceof Error ? caught.message : "活动回顾读取失败。");
      })
      .finally(() => { if (requestId === requestRef.current) setLoading(false); });
    return () => { requestRef.current += 1; };
  }, [activityId, activityTitle, activitySummary, open, preview, previewRecap]);

  useEffect(() => {
    if (!open || !dirty) return;
    const preventLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventLeave);
    return () => window.removeEventListener("beforeunload", preventLeave);
  }, [dirty, open]);

  function clearPending() {
    pendingRef.current.forEach(image => URL.revokeObjectURL(image.previewUrl));
    pendingRef.current = [];
    setPendingImages([]);
    if (imageInputRef.current) imageInputRef.current.value = "";
  }

  function requestClose() {
    if (saving) return;
    if (dirty && !window.confirm("回顾内容尚未提交，确定关闭并放弃修改吗？")) return;
    requestRef.current += 1;
    clearPending();
    onClose();
  }

  function addImages(files: FileList | null) {
    if (!files?.length) return;
    const selected = Array.from(files);
    if (existingImages.length + pendingImages.length + selected.length > MAX_RECAP_IMAGES) {
      setError(`最多上传 ${MAX_RECAP_IMAGES} 张现场图片。`);
    } else if (selected.some(file => !["image/jpeg", "image/png"].includes(file.type) || !file.size || file.size > MAX_RECAP_IMAGE_BYTES)) {
      setError("仅支持单张不超过 5MB 的 JPG 或 PNG 图片。");
    } else {
      setPendingImages(current => [...current, ...selected.map(file => ({ file, previewUrl: URL.createObjectURL(file) }))]);
      setError("");
    }
    if (imageInputRef.current) imageInputRef.current.value = "";
  }

  function removePending(previewUrl: string) {
    URL.revokeObjectURL(previewUrl);
    setPendingImages(current => current.filter(image => image.previewUrl !== previewUrl));
  }

  async function importText(file: File | undefined) {
    if (!file) return;
    if (file.size > 100_000 || !/\.txt$/i.test(file.name)) {
      setError("请选择不超过 100KB 的 TXT 文字稿。");
    } else if (!form.content.trim() || window.confirm("导入文字稿会替换当前回顾正文，确定继续吗？")) {
      const content = await file.text();
      if (content.length > 20_000) {
        setError("文字稿不能超过 20000 字。");
      } else {
        setForm(current => ({ ...current, content }));
        setError("");
      }
    }
    if (textInputRef.current) textInputRef.current.value = "";
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activity || saving || loading || preview) return;
    setSaving(true);
    setError("");
    setSuccess("");
    const body = new FormData();
    body.set("title", form.title.trim());
    body.set("summary", form.summary.trim());
    body.set("content", form.content.trim());
    body.set("keepImageIds", JSON.stringify(existingImages.map(image => image.id)));
    pendingImages.forEach(image => body.append("images", image.file));
    try {
      const response = await fetch(`/api/v1/activities/${encodeURIComponent(activity.id)}/recap`, {
        method: "PUT", credentials: "same-origin", body,
      });
      const recap = await response.json().catch(() => null) as (ActivityRecapView & { error?: string }) | null;
      if (!response.ok || !recap) throw new Error(recap?.error || `提交失败（${response.status}）。`);
      const savedForm = { title: recap.title, summary: recap.summary, content: recap.content };
      baselineRef.current = { form: savedForm, imageIds: recap.images.map(image => image.id) };
      setForm(savedForm);
      setExistingImages(recap.images);
      setPublishedAt(recap.publishedAt);
      setHasPublishedDetail(Boolean(recap.content.trim()));
      clearPending();
      setSuccess("回顾已生成，活动交流页现在可以查看。");
      onSaved(recap);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "活动回顾提交失败。");
      window.requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      setSaving(false);
    }
  }

  return <Sheet open={open} onOpenChange={nextOpen => { if (!nextOpen) requestClose(); }}>
    <SheetContent id="activity-recap-drawer" side="right"
      onOpenAutoFocus={event => { event.preventDefault(); headingRef.current?.focus(); }}
      onCloseAutoFocus={event => { event.preventDefault(); returnFocusRef.current?.focus(); }}
      className="member-center flex h-dvh w-full flex-col gap-0 overflow-hidden bg-background p-0 text-foreground sm:max-w-[720px] [&>button]:hidden">
      <div className="shrink-0 border-b px-5 py-5 sm:px-7">
        <SheetHeader className="pr-16 text-left">
          <SheetTitle ref={headingRef} tabIndex={-1} className="text-xl outline-none">{publishedAt ? "编辑活动回顾" : "提交活动回顾"}</SheetTitle>
          <SheetDescription className="break-words">{activity?.title ?? "活动"} · 提交后生成历史回顾卡片；填写正文时还会生成图文详情页。</SheetDescription>
        </SheetHeader>
        <button type="button" disabled={saving} onClick={requestClose} className="absolute right-5 top-5 min-h-11 rounded-lg border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50">关闭</button>
        {preview && <p className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">当前为示例预览，可体验填写和上传界面；提交请前往真实管理页。</p>}
        {error && <p ref={errorRef} tabIndex={-1} role="alert" className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive outline-none">{error}</p>}
        {success && <p role="status" className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">{success} {hasPublishedDetail && <Link href={`/events/recaps/${encodeURIComponent(activity?.id ?? "")}/`} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline">查看回顾</Link>}</p>}
      </div>
      <form onSubmit={event => void submit(event)} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-6 sm:px-7">
          {loading ? <p role="status" className="text-sm text-muted-foreground">正在读取已有回顾…</p> : <>
            <section className="space-y-4" aria-labelledby="recap-copy-title">
              <div><h3 id="recap-copy-title" className="text-sm font-semibold">回顾内容</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">标题与摘要默认复用活动信息，也可以在这里修改。</p></div>
              <div><label htmlFor="recap-title" className="text-sm font-medium">回顾标题</label><input id="recap-title" maxLength={120} value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} disabled={saving} className={inputClass} /></div>
              <div><label htmlFor="recap-summary" className="text-sm font-medium">回顾摘要 <span className="font-normal text-muted-foreground">· 可选</span></label><textarea id="recap-summary" rows={3} maxLength={300} value={form.summary} onChange={event => setForm(current => ({ ...current, summary: event.target.value }))} placeholder="留空则使用活动摘要" disabled={saving} className={inputClass + " resize-y"} /></div>
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2"><label htmlFor="recap-content" className="text-sm font-medium">回顾正文 <span className="font-normal text-muted-foreground">· 可选</span></label><button type="button" disabled={saving} onClick={() => textInputRef.current?.click()} className="inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-primary hover:underline disabled:opacity-50"><FileText aria-hidden="true" className="size-4" />导入 TXT 文字稿</button></div>
                <textarea id="recap-content" rows={11} maxLength={20000} value={form.content} onChange={event => setForm(current => ({ ...current, content: event.target.value }))} placeholder="记录活动亮点、嘉宾观点、现场讨论与后续成果…" disabled={saving} aria-describedby="recap-content-help" className={inputClass + " resize-y leading-6"} />
                <p id="recap-content-help" className="mt-1.5 text-xs text-muted-foreground">留空也可生成回顾卡片；填写后会生成图文详情页，最多 20000 字。</p>
                <input ref={textInputRef} type="file" accept=".txt,text/plain" className="hidden" tabIndex={-1} aria-hidden="true" onChange={event => void importText(event.target.files?.[0])} />
              </div>
            </section>
            <section className="space-y-4 border-t pt-6" aria-labelledby="recap-images-title">
              <div><h3 id="recap-images-title" className="text-sm font-semibold">现场图片 <span className="font-normal text-muted-foreground">· 可选</span></h3><p className="mt-1 text-xs leading-5 text-muted-foreground">最多 {MAX_RECAP_IMAGES} 张 JPG / PNG，单张不超过 5MB。正文留空时，回顾卡片优先展示活动封面，且没有详情入口。</p></div>
              {(existingImages.length > 0 || pendingImages.length > 0) && <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {existingImages.map(image => <div key={image.id} className="relative overflow-hidden rounded-xl border bg-muted/30"><img src={image.url} alt={image.originalName} className="aspect-[4/3] w-full object-cover" /><button type="button" disabled={saving} onClick={() => setExistingImages(current => current.filter(item => item.id !== image.id))} aria-label={`移除图片：${image.originalName}`} className="absolute right-2 top-2 inline-flex size-11 items-center justify-center rounded-full bg-black/70 text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"><X aria-hidden="true" className="size-4" /></button></div>)}
                {pendingImages.map(image => <div key={image.previewUrl} className="relative overflow-hidden rounded-xl border bg-muted/30"><img src={image.previewUrl} alt={image.file.name} className="aspect-[4/3] w-full object-cover" /><button type="button" disabled={saving} onClick={() => removePending(image.previewUrl)} aria-label={`移除待上传图片：${image.file.name}`} className="absolute right-2 top-2 inline-flex size-11 items-center justify-center rounded-full bg-black/70 text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"><X aria-hidden="true" className="size-4" /></button></div>)}
              </div>}
              <button type="button" disabled={saving || existingImages.length + pendingImages.length >= MAX_RECAP_IMAGES} onClick={() => imageInputRef.current?.click()} className="inline-flex min-h-11 items-center gap-2 rounded-lg border bg-background px-4 text-sm font-medium hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"><ImagePlus aria-hidden="true" className="size-4 text-primary" />添加现场图片</button>
              <input ref={imageInputRef} type="file" accept="image/jpeg,image/png" multiple className="hidden" tabIndex={-1} aria-hidden="true" onChange={event => addImages(event.target.files)} />
            </section>
            {publishedAt && <p className="border-t pt-5 text-xs text-muted-foreground">已于 {new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "long", timeStyle: "short" }).format(new Date(publishedAt))} 生成公开回顾。{hasPublishedDetail ? "再次提交会更新图文详情。" : "补充正文后可生成图文详情。"}</p>}
          </>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-t bg-background px-5 py-4 sm:px-7">
          <button type="submit" disabled={loading || saving || preview || (Boolean(publishedAt) && !dirty)} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">{saving ? "正在生成回顾…" : publishedAt ? "保存回顾修改" : "提交并生成回顾"}</button>
          {publishedAt && activity && hasPublishedDetail && <Link href={`/events/recaps/${encodeURIComponent(activity.id)}/`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-medium text-primary hover:underline">查看公开回顾</Link>}
          {!dirty && <span className="text-xs text-muted-foreground">{publishedAt ? "当前没有未保存的修改" : "可以直接提交，也可以补充回顾内容"}</span>}
        </div>
      </form>
    </SheetContent>
  </Sheet>;
}
