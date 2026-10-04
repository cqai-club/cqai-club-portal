"use client";

import { NativeSelect } from "@/components/ui/native-select";
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ExternalLink, Files, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTranslations } from "@/lib/i18n/client";
import type { MemberResourceItem, MemberResourcePage } from "@/lib/member/resource-types";

const empty: MemberResourcePage = { data: [], page: 1, totalPages: 1, total: 0 };

function ResourceImage({ src, alt, large = false }: { src: string; alt: string; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  return <div className={`relative overflow-hidden rounded-lg bg-muted ${large ? "h-64 sm:h-80" : "aspect-[16/10]"}`}>
    {failed ? <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground"><Files aria-hidden="true" className="size-5" />{alt}</div>
      : <Image unoptimized fill sizes="(max-width: 640px) 100vw, 50vw" src={src} alt={alt} className="object-contain" onError={() => setFailed(true)} />}
  </div>;
}

export default function ResourceCenter({ manage = false }: { manage?: boolean }) {
  const { t } = useTranslations();
  const endpoint = manage ? "/member/api/admin/resources" : "/member/api/resources";
  const [result, setResult] = useState<MemberResourcePage>(empty);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<MemberResourceItem | null>(null);
  const [detail, setDetail] = useState<MemberResourceItem | null>(null);
  const [deleting, setDeleting] = useState<MemberResourceItem | null>(null);
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const version = useRef(0);
  const load = useCallback(async (signal?: AbortSignal) => {
    const requestVersion = ++version.current;
    setLoading(true); setLoadError(false);
    try {
      const response = await fetch(`${endpoint}?page=${page}`, { cache: "no-store", signal });
      if (!response.ok) throw new Error("Load failed");
      const data: MemberResourcePage = await response.json();
      if (!signal?.aborted && requestVersion === version.current) setResult(data);
    } catch {
      if (!signal?.aborted && requestVersion === version.current) setLoadError(true);
    } finally {
      if (!signal?.aborted && requestVersion === version.current) setLoading(false);
    }
  }, [endpoint, page]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  useEffect(() => {
    if (!image) { setPreview(""); return; }
    const url = URL.createObjectURL(image);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  function openEditor(item: MemberResourceItem | null) {
    setEditing(item); setImage(null); setActionError(""); setNotice(""); setEditorOpen(true);
  }
  async function send(url: string, method: string, body: FormData | string) {
    const response = await fetch(url, { method, body, ...(typeof body === "string" ? { headers: { "Content-Type": "application/json" } } : {}) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || t("resources.actionError"));
    return data;
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setActionError("");
    const form = new FormData(event.currentTarget);
    form.delete("image");
    if (image) form.set("image", image);
    if (editing) form.set("updatedAt", editing.updatedAt);
    try {
      await send(editing ? `${endpoint}/${editing.id}` : endpoint, editing ? "PATCH" : "POST", form);
      setEditorOpen(false); setNotice(t("resources.saved")); await load();
    } catch (error) { setActionError(error instanceof Error ? error.message : t("resources.actionError")); }
    finally { setBusy(false); }
  }
  async function toggle(item: MemberResourceItem) {
    if (busy) return;
    setBusy(true); setActionError(""); setNotice("");
    const form = new FormData();
    form.set("description", item.description); form.set("externalUrl", item.externalUrl);
    form.set("published", String(!item.published)); form.set("updatedAt", item.updatedAt);
    try { await send(`${endpoint}/${item.id}`, "PATCH", form); setNotice(t(item.published ? "resources.unpublished" : "resources.publishedNotice")); await load(); }
    catch (error) { setActionError(error instanceof Error ? error.message : t("resources.actionError")); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!deleting || busy) return;
    setBusy(true); setActionError(""); setNotice("");
    try { await send(`${endpoint}/${deleting.id}`, "DELETE", JSON.stringify({ updatedAt: deleting.updatedAt })); setDeleting(null); setNotice(t("resources.deleted")); await load(); }
    catch (error) { setActionError(error instanceof Error ? error.message : t("resources.actionError")); }
    finally { setBusy(false); }
  }
  const externalLink = (item: MemberResourceItem) => <Button asChild className="min-h-11"><a href={item.externalUrl} target="_blank" rel="noopener noreferrer">{t("resources.openLink")}<ExternalLink aria-hidden="true" className="size-4" /></a></Button>;

  return <div className="space-y-7">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-semibold tracking-[0.14em] text-primary">CQAI CLUB</p><h1 className="mt-2 text-2xl font-semibold sm:text-3xl">{t(manage ? "resources.manageTitle" : "resources.title")}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{t(manage ? "resources.manageDescription" : "resources.description")}</p></div>
      {manage && <Button className="min-h-11" onClick={() => openEditor(null)} disabled={busy}><Plus aria-hidden="true" className="size-4" />{t("resources.add")}</Button>}
    </header>
    {notice && <p role="status" className="rounded-lg border bg-card p-3 text-sm">{notice}</p>}
    {actionError && !editorOpen && !deleting && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
    <section aria-label={t("resources.title")} aria-busy={loading}>
      {loading ? <p role="status" className="flex items-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />{t("resources.loading")}</p>
        : loadError ? <Card className="items-start gap-3 p-6"><p role="alert">{t("resources.loadError")}</p><Button variant="outline" className="min-h-11" onClick={() => void load()}>{t("resources.retry")}</Button></Card>
          : !result.data.length ? <Card className="items-center p-10 text-center"><Files aria-hidden="true" className="size-9 text-primary" /><p className="mt-3 font-medium">{t("resources.empty")}</p><p className="mt-2 text-sm text-muted-foreground">{t(manage ? "resources.emptyAdmin" : "resources.emptyMember")}</p></Card>
            : <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{result.data.map(item => <Card key={`${item.id}-${item.updatedAt}`} className="gap-0 overflow-hidden p-4">
              <ResourceImage src={item.imageUrl} alt={t("resources.imageAlt")} />
              {manage && <p className={`mt-4 self-start rounded-md px-2 py-1 text-xs font-medium ${item.published ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{t(item.published ? "resources.published" : "resources.draft")}</p>}
              <p className="mt-4 line-clamp-4 whitespace-pre-wrap break-words text-sm leading-6">{item.description}</p>
              <p className="mt-3 truncate text-xs text-muted-foreground">{new URL(item.externalUrl).host}</p>
              <div className="mt-auto flex flex-wrap gap-2 pt-5"><Button variant="outline" className="min-h-11" onClick={() => setDetail(item)}>{t("resources.details")}</Button>{externalLink(item)}</div>
              {manage && <div className="mt-4 flex flex-wrap gap-2 border-t pt-4"><Button variant="outline" className="min-h-11" disabled={busy} onClick={() => openEditor(item)}>{t("resources.edit")}</Button><Button variant="outline" className="min-h-11" disabled={busy} onClick={() => void toggle(item)}>{t(item.published ? "resources.unpublish" : "resources.publish")}</Button><Button variant="ghost" className="min-h-11 text-destructive" disabled={busy} onClick={() => { setDeleting(item); setActionError(""); }}>{t("resources.delete")}</Button></div>}
            </Card>)}</div>}
    </section>
    {!loading && !loadError && result.totalPages > 1 && <nav aria-label={t("resources.pagination")} className="flex flex-wrap items-center justify-center gap-4"><Button variant="outline" className="min-h-11" disabled={result.page <= 1 || busy} onClick={() => setPage(result.page - 1)}>{t("resources.previous")}</Button><span className="text-sm">{result.page} / {result.totalPages}</span><Button variant="outline" className="min-h-11" disabled={result.page >= result.totalPages || busy} onClick={() => setPage(result.page + 1)}>{t("resources.next")}</Button></nav>}

    <Dialog open={!!detail} onOpenChange={open => { if (!open) setDetail(null); }}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{t("resources.details")}</DialogTitle><DialogDescription>{t("resources.externalHint")}</DialogDescription></DialogHeader>{detail && <><ResourceImage key={detail.imageUrl} src={detail.imageUrl} alt={t("resources.imageAlt")} large /><p className="whitespace-pre-wrap break-words text-sm leading-7">{detail.description}</p><p className="break-all text-xs text-muted-foreground">{detail.externalUrl}</p><DialogFooter>{externalLink(detail)}</DialogFooter></>}</DialogContent></Dialog>

    {manage && <Dialog open={editorOpen} onOpenChange={open => { if (!busy) setEditorOpen(open); }}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl" onEscapeKeyDown={event => { if (busy) event.preventDefault(); }}><DialogHeader><DialogTitle>{t(editing ? "resources.edit" : "resources.add")}</DialogTitle><DialogDescription>{t("resources.editorHint")}</DialogDescription></DialogHeader>
      <form onSubmit={save} className="space-y-5">
        <div className="space-y-2"><Label htmlFor="resource-image">{t("resources.image")}</Label><Input id="resource-image" name="image" type="file" accept="image/jpeg,image/png" required={!editing} disabled={busy} onChange={event => { const file = event.target.files?.[0] ?? null; if (file && file.size > 5 * 1024 * 1024) { event.target.value = ""; setImage(null); setActionError(t("resources.imageSize")); } else { setImage(file); setActionError(""); } }} /><p className="text-xs text-muted-foreground">{t("resources.imageHint")}</p>{(preview || editing?.imageUrl) && <ResourceImage key={preview || editing?.imageUrl} src={preview || editing!.imageUrl} alt={t("resources.imageAlt")} />}</div>
        <div className="space-y-2"><Label htmlFor="resource-description">{t("resources.detailLabel")}</Label><textarea id="resource-description" name="description" required maxLength={10000} rows={8} disabled={busy} defaultValue={editing?.description ?? ""} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" /></div>
        <div className="space-y-2"><Label htmlFor="resource-url">{t("resources.link")}</Label><Input id="resource-url" name="externalUrl" type="url" required maxLength={2048} disabled={busy} placeholder="https://…" defaultValue={editing?.externalUrl ?? ""} /><p className="text-xs text-muted-foreground">{t("resources.externalHint")}</p></div>
        <div className="space-y-2"><Label htmlFor="resource-published">{t("resources.status")}</Label><NativeSelect clearable={false} id="resource-published" name="published" disabled={busy} defaultValue={String(editing?.published ?? false)} className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="false">{t("resources.draft")}</option><option value="true">{t("resources.published")}</option></NativeSelect></div>
        {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
        <DialogFooter><Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => setEditorOpen(false)}>{t("resources.cancel")}</Button><Button type="submit" className="min-h-11" disabled={busy}>{busy ? t("resources.saving") : t("resources.save")}</Button></DialogFooter>
      </form>
    </DialogContent></Dialog>}
    {manage && <Dialog open={!!deleting} onOpenChange={open => { if (!busy && !open) setDeleting(null); }}><DialogContent onEscapeKeyDown={event => { if (busy) event.preventDefault(); }}><DialogHeader><DialogTitle>{t("resources.deleteTitle")}</DialogTitle><DialogDescription>{t("resources.deleteDescription")}</DialogDescription></DialogHeader>{actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}<DialogFooter><Button variant="outline" className="min-h-11" disabled={busy} onClick={() => setDeleting(null)}>{t("resources.cancel")}</Button><Button variant="destructive" className="min-h-11" disabled={busy} onClick={() => void remove()}>{busy ? t("resources.saving") : t("resources.delete")}</Button></DialogFooter></DialogContent></Dialog>}
  </div>;
}
