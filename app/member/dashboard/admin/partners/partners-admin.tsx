"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";

type Partner = {
  id: string;
  groupId: string;
  nameZh: string;
  nameEn: string;
  url: string | null;
  sortOrder: number;
  enabled: boolean;
  revision: number;
};

type PartnerGroup = {
  id: string;
  nameZh: string;
  nameEn: string;
  sortOrder: number;
  enabled: boolean;
  revision: number;
  partners: Partner[];
};

type Editor = { kind: "partner"; item: Partner | null } | { kind: "group"; item: PartnerGroup | null };
type Deleting = { kind: "partner"; item: Partner } | { kind: "group"; item: PartnerGroup };
type FormValues = { nameZh: string; nameEn: string; groupId: string; url: string; sortOrder: string; enabled: boolean };
type FieldName = Exclude<keyof FormValues, "enabled">;
type FieldErrors = Partial<Record<FieldName, string>>;

const endpoint = "/member/api/admin/partners";
const fieldLabels: Record<FieldName, string> = {
  nameZh: "中文名称", nameEn: "英文名称", groupId: "所属分组", url: "网站地址", sortOrder: "显示顺序",
};

class RequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new RequestError(
      typeof data?.error === "string" ? data.error : `请求失败（${response.status}），请稍后重试。`,
      response.status,
    );
  }
  if (data === null) throw new Error("服务器返回了无法读取的数据，请重新加载。");
  return data as T;
}

function validateForm(values: FormValues, kind: Editor["kind"], groups: PartnerGroup[]): FieldErrors {
  const errors: FieldErrors = {};
  for (const field of ["nameZh", "nameEn"] as const) {
    if (!values[field].trim()) errors[field] = `请填写${fieldLabels[field]}。`;
    else if (values[field].trim().length > 100) errors[field] = `${fieldLabels[field]}不能超过 100 个字符。`;
  }
  const order = Number(values.sortOrder);
  if (!values.sortOrder.trim() || !Number.isInteger(order) || order < 0 || order > 10000) {
    errors.sortOrder = "请填写 0 到 10000 之间的整数，数值越小越靠前。";
  }
  if (kind === "partner") {
    if (!groups.some(group => group.id === values.groupId)) errors.groupId = "请选择现有分组。";
    const url = values.url.trim();
    if (url.length > 2048) errors.url = "网站地址不能超过 2048 个字符。";
    else if (url) {
      try {
        const parsed = new URL(url);
        if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
          errors.url = "请填写不含用户名或密码的 HTTP 或 HTTPS 地址。";
        }
      } catch { errors.url = "请填写完整的网站地址，例如 https://example.com。"; }
    }
  }
  return errors;
}

export default function PartnersAdmin() {
  const [groups, setGroups] = useState<PartnerGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [deleting, setDeleting] = useState<Deleting | null>(null);
  const [values, setValues] = useState<FormValues>({ nameZh: "", nameEn: "", groupId: "", url: "", sortOrder: "0", enabled: true });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const errorSummary = useRef<HTMLDivElement>(null);
  const dialogOpener = useRef<HTMLElement | null>(null);
  const pageHeading = useRef<HTMLHeadingElement>(null);
  const loadVersion = useRef(0);

  const load = useCallback(async (signal?: AbortSignal) => {
    const version = ++loadVersion.current;
    setLoading(true);
    setLoadError("");
    try {
      const data = await requestJson<{ groups: PartnerGroup[] }>(endpoint, { signal });
      if (!signal?.aborted && version === loadVersion.current) setGroups(data.groups);
    } catch (error) {
      if (!signal?.aborted && version === loadVersion.current) {
        setLoadError(error instanceof Error ? error.message : "无法加载合作伙伴，请重新加载。");
      }
    } finally {
      if (!signal?.aborted && version === loadVersion.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    if (actionError || Object.keys(fieldErrors).length) errorSummary.current?.focus();
  }, [actionError, fieldErrors]);

  const unavailable = busy || loading || !!loadError;
  const totalPartners = groups.reduce((total, group) => total + group.partners.length, 0);

  function openEditor(kind: Editor["kind"], item: Partner | PartnerGroup | null, groupId = "") {
    if (unavailable) return;
    dialogOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (kind === "partner") setEditor({ kind, item: item as Partner | null });
    else setEditor({ kind, item: item as PartnerGroup | null });
    setValues({
      nameZh: item?.nameZh ?? "",
      nameEn: item?.nameEn ?? "",
      groupId: item && "groupId" in item ? item.groupId : groupId || groups[0]?.id || "",
      url: item && "url" in item ? item.url ?? "" : "",
      sortOrder: String(item?.sortOrder ?? 0),
      enabled: item?.enabled ?? true,
    });
    setFieldErrors({});
    setActionError("");
    setConflict(false);
    setNotice("");
  }

  function setField<K extends keyof FormValues>(name: K, value: FormValues[K]) {
    setValues(current => ({ ...current, [name]: value }));
  }

  function showActionError(error: unknown) {
    setActionError(error instanceof Error ? error.message : "操作失败，请稍后重试。");
    setConflict(error instanceof RequestError && error.status === 409);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || busy || conflict) return;
    const errors = validateForm(values, editor.kind, groups);
    setFieldErrors(errors);
    setActionError("");
    if (Object.keys(errors).length) return;
    setBusy(true);
    const payload = {
      nameZh: values.nameZh.trim(), nameEn: values.nameEn.trim(),
      sortOrder: Number(values.sortOrder), enabled: values.enabled,
      ...(editor.kind === "partner" ? { groupId: values.groupId, url: values.url.trim() || null } : {}),
      ...(editor.item ? { revision: editor.item.revision } : {}),
    };
    const base = editor.kind === "group" ? `${endpoint}/groups` : endpoint;
    try {
      await requestJson(editor.item ? `${base}/${encodeURIComponent(editor.item.id)}` : base, {
        method: editor.item ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setEditor(null);
      setNotice(`${editor.kind === "group" ? "分组" : "合作伙伴"}已保存。`);
      await load();
    } catch (error) { showActionError(error); }
    finally { setBusy(false); }
  }

  function openDelete(target: Deleting) {
    dialogOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDeleting(target);
    setActionError("");
    setConflict(false);
    setNotice("");
  }

  async function remove() {
    if (!deleting || busy || conflict) return;
    setBusy(true);
    setActionError("");
    const base = deleting.kind === "group" ? `${endpoint}/groups` : endpoint;
    try {
      await requestJson(`${base}/${encodeURIComponent(deleting.item.id)}`, {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: deleting.item.revision }),
      });
      setDeleting(null);
      setNotice(`${deleting.kind === "group" ? "分组" : "合作伙伴"}已删除。`);
      await load();
    } catch (error) { showActionError(error); }
    finally { setBusy(false); }
  }

  function reloadAfterConflict() {
    setEditor(null);
    setDeleting(null);
    setActionError("");
    setConflict(false);
    void load();
  }

  function restoreDialogFocus(event: Event) {
    event.preventDefault();
    const target = dialogOpener.current;
    if (target?.isConnected && !target.matches(":disabled")) target.focus();
    else pageHeading.current?.focus();
  }

  function fieldMessage(field: FieldName) {
    return fieldErrors[field]
      ? <p id={`partner-${field}-error`} className="text-sm text-destructive">{fieldErrors[field]}</p>
      : null;
  }

  const errorFeedback = (inForm: boolean) => (actionError || (inForm && Object.keys(fieldErrors).length > 0)) && (
    <div ref={errorSummary} tabIndex={-1} role="alert" className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {actionError && <p>{actionError}</p>}
      {inForm && Object.keys(fieldErrors).length > 0 && <>
        <p className="font-medium">请检查以下内容：</p>
        <ul className="list-inside list-disc space-y-1">
          {(Object.keys(fieldErrors) as FieldName[]).map(field => <li key={field}><a className="underline underline-offset-4" href={`#partner-${field}`}>{fieldLabels[field]}：{fieldErrors[field]}</a></li>)}
        </ul>
      </>}
      {conflict && <>
        <p>请重新加载列表，再确认最新内容后操作。表单内容将关闭。</p>
        <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={reloadAfterConflict}>重新加载列表</Button>
      </>}
    </div>
  );

  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 ref={pageHeading} tabIndex={-1} className="text-2xl font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-3xl">合作伙伴管理</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">管理首页合作伙伴的分组、名称、网站和展示顺序。保存后首页按最新配置展示，隐藏分组会同时隐藏其中的合作伙伴。</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="min-h-11" disabled={busy || loading} onClick={() => void load()}>{loading ? "加载中…" : "重新加载"}</Button>
        <Button variant="outline" className="min-h-11" disabled={unavailable} onClick={() => openEditor("group", null)}>新增分组</Button>
        <Button className="min-h-11" disabled={unavailable || groups.length === 0} onClick={() => openEditor("partner", null)}>新增合作伙伴</Button>
      </div>
    </header>

    {notice && <p role="status" className="rounded-lg border bg-card p-3 text-sm">{notice}</p>}
    {loadError && <div role="alert" className="space-y-2 rounded-lg border border-destructive/40 p-4 text-sm">
      <p>{loadError}</p><p className="text-muted-foreground">请重新加载后继续编辑，避免覆盖已更新的内容。</p>
      <Button variant="outline" className="min-h-11" disabled={busy || loading} onClick={() => void load()}>重试加载</Button>
    </div>}

    <section aria-label="合作伙伴列表" aria-busy={loading} className="space-y-4">
      {loading ? <div role="status" className="space-y-4">
        <span className="sr-only">正在加载合作伙伴列表</span>
        {[0, 1].map(item => <Card key={item} className="gap-4 p-6"><Skeleton className="h-6 w-40 motion-reduce:animate-none" /><Skeleton className="h-4 w-64 max-w-full motion-reduce:animate-none" /><Skeleton className="h-16 w-full motion-reduce:animate-none" /></Card>)}
      </div> : groups.length === 0 && !loadError ? <Card className="items-start gap-4 p-6 sm:p-8">
        <CardTitle>先建立一个合作伙伴分组</CardTitle>
        <p className="text-sm leading-6 text-muted-foreground">例如指导单位、生态伙伴。创建分组后，即可添加伙伴并配置中英文名称。</p>
        <Button className="min-h-11" disabled={busy} onClick={() => openEditor("group", null)}>创建首个分组</Button>
      </Card> : <>
        <p className="text-sm text-muted-foreground">共 {groups.length} 个分组，{totalPartners} 个合作伙伴。顺序数值越小越靠前。</p>
        {groups.map(group => <Card key={group.id} className="gap-0 overflow-hidden">
          <CardHeader className="gap-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="break-words text-lg">{group.nameZh}</CardTitle>
                  <Badge variant={group.enabled ? "secondary" : "outline"}>{group.enabled ? "分组显示" : "分组隐藏"}</Badge>
                </div>
                <CardDescription className="break-words">{group.nameEn}</CardDescription>
                <p className="text-xs text-muted-foreground">顺序 {group.sortOrder} · {group.partners.length} 个伙伴</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="min-h-11" disabled={unavailable} onClick={() => openEditor("partner", null, group.id)}>添加伙伴</Button>
                <Button variant="outline" className="min-h-11" disabled={unavailable} onClick={() => openEditor("group", group)}>编辑分组</Button>
                <Button variant="ghost" className="min-h-11 text-destructive" disabled={unavailable || group.partners.length > 0} onClick={() => openDelete({ kind: "group", item: group })}>删除分组</Button>
              </div>
            </div>
            {!group.enabled && <p className="text-sm text-muted-foreground">此分组及其中伙伴目前均不在首页显示。</p>}
            {group.partners.length > 0 && <p className="text-xs text-muted-foreground">删除分组前，请先将伙伴移到其他分组或删除。</p>}
          </CardHeader>
          <CardContent className="space-y-3">
            {group.partners.length === 0 ? <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">此分组暂无合作伙伴，可点击“添加伙伴”。</p>
              : group.partners.map(partner => <article key={partner.id} className="flex min-w-0 flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="break-words text-base font-medium">{partner.nameZh}</h2>
                    <Badge variant={partner.enabled && group.enabled ? "secondary" : "outline"}>{!partner.enabled ? "伙伴隐藏" : !group.enabled ? "随分组隐藏" : "首页显示"}</Badge>
                  </div>
                  <p className="break-words text-sm text-muted-foreground">{partner.nameEn}</p>
                  {partner.url ? <a href={partner.url} target="_blank" rel="noopener noreferrer" className="block break-all text-sm text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{partner.url}<span className="sr-only">（在新窗口打开）</span></a>
                    : <p className="text-xs text-muted-foreground">未设置网站地址</p>}
                  <p className="text-xs text-muted-foreground">顺序 {partner.sortOrder}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button variant="outline" className="min-h-11" disabled={unavailable} aria-label={`编辑 ${partner.nameZh}`} onClick={() => openEditor("partner", partner)}>编辑</Button>
                  <Button variant="ghost" className="min-h-11 text-destructive" disabled={unavailable} aria-label={`删除 ${partner.nameZh}`} onClick={() => openDelete({ kind: "partner", item: partner })}>删除</Button>
                </div>
              </article>)}
          </CardContent>
        </Card>)}
      </>}
    </section>

    <Dialog open={!!editor} onOpenChange={open => { if (!open && !busy) setEditor(null); }}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl" onCloseAutoFocus={restoreDialogFocus} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }}>
        <DialogHeader className="pr-8">
          <DialogTitle>{editor?.item ? "编辑" : "新增"}{editor?.kind === "group" ? "分组" : "合作伙伴"}</DialogTitle>
          <DialogDescription>中英文名称均为必填。保存显示中的{editor?.kind === "group" ? "分组" : "伙伴"}后，首页会展示最新内容。</DialogDescription>
        </DialogHeader>
        {editor && <form noValidate onSubmit={save} className="space-y-4">
          {errorFeedback(true)}
          {editor.kind === "partner" && <div className="space-y-2">
            <Label htmlFor="partner-groupId">所属分组</Label>
            <NativeSelect id="partner-groupId" clearable={false} className="min-h-11" disabled={busy || conflict} value={values.groupId} onChange={event => setField("groupId", event.target.value)} aria-invalid={!!fieldErrors.groupId} aria-describedby={fieldErrors.groupId ? "partner-groupId-error" : undefined}>
              {groups.map(group => <option key={group.id} value={group.id}>{group.nameZh}{group.enabled ? "" : "（分组隐藏）"}</option>)}
            </NativeSelect>
            {fieldMessage("groupId")}
          </div>}
          {(["nameZh", "nameEn"] as const).map(field => <div key={field} className="space-y-2">
            <Label htmlFor={`partner-${field}`}>{fieldLabels[field]}<span className="text-destructive" aria-hidden="true"> *</span></Label>
            <Input id={`partner-${field}`} className="min-h-11" required maxLength={100} disabled={busy || conflict} value={values[field]} onChange={event => setField(field, event.target.value)} aria-invalid={!!fieldErrors[field]} aria-describedby={fieldErrors[field] ? `partner-${field}-error` : undefined} />
            {fieldMessage(field)}
          </div>)}
          {editor.kind === "partner" && <div className="space-y-2">
            <Label htmlFor="partner-url">网站地址（选填）</Label>
            <Input id="partner-url" type="url" className="min-h-11" maxLength={2048} disabled={busy || conflict} value={values.url} onChange={event => setField("url", event.target.value)} placeholder="https://" aria-invalid={!!fieldErrors.url} aria-describedby={`partner-url-hint${fieldErrors.url ? " partner-url-error" : ""}`} />
            <p id="partner-url-hint" className="text-xs text-muted-foreground">支持 HTTP 或 HTTPS。留空时，首页仅展示名称。</p>
            {fieldMessage("url")}
          </div>}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="partner-sortOrder">显示顺序</Label>
              <Input id="partner-sortOrder" type="number" inputMode="numeric" min={0} max={10000} step={1} required className="min-h-11" disabled={busy || conflict} value={values.sortOrder} onChange={event => setField("sortOrder", event.target.value)} aria-invalid={!!fieldErrors.sortOrder} aria-describedby={`partner-order-hint${fieldErrors.sortOrder ? " partner-sortOrder-error" : ""}`} />
              <p id="partner-order-hint" className="text-xs text-muted-foreground">0 到 10000，数值越小越靠前。</p>
              {fieldMessage("sortOrder")}
            </div>
            <div className="space-y-2">
              <Label htmlFor="partner-enabled">首页展示</Label>
              <NativeSelect id="partner-enabled" clearable={false} className="min-h-11" disabled={busy || conflict} value={String(values.enabled)} onChange={event => setField("enabled", event.target.value === "true")}>
                <option value="true">显示</option><option value="false">隐藏</option>
              </NativeSelect>
              <p className="text-xs text-muted-foreground">{editor.kind === "group" ? "隐藏分组会同时隐藏其中的伙伴。" : "所属分组也须显示，伙伴才会在首页展示。"}</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => setEditor(null)}>取消</Button>
            <Button type="submit" className="min-h-11" disabled={busy || conflict}>{busy ? "保存中…" : "保存"}</Button>
          </DialogFooter>
        </form>}
      </DialogContent>
    </Dialog>

    <Dialog open={!!deleting} onOpenChange={open => { if (!open && !busy) setDeleting(null); }}>
      <DialogContent onCloseAutoFocus={restoreDialogFocus} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }}>
        <DialogHeader className="pr-8">
          <DialogTitle>删除{deleting?.kind === "group" ? "分组" : "合作伙伴"}</DialogTitle>
          <DialogDescription className="break-words">确定删除“{deleting?.item.nameZh}”吗？此操作无法撤销。{deleting?.kind === "group" ? "仅可删除不含伙伴的分组。" : "删除后将从首页移除。"}</DialogDescription>
        </DialogHeader>
        {errorFeedback(false)}
        <DialogFooter className="gap-2">
          <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => setDeleting(null)}>取消</Button>
          <Button variant="destructive" className="min-h-11" disabled={busy || conflict} onClick={() => void remove()}>{busy ? "删除中…" : "确认删除"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
