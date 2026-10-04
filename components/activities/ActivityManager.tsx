/* eslint-disable @next/next/no-img-element -- covers use the validated same-origin activity image API */
"use client";

import { NativeSelect } from "@/components/ui/native-select";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, ImagePlus, MoreHorizontal, RefreshCw, Search } from "lucide-react";

import { ProjectCoverCropDialog } from "@/components/project-cover-crop-dialog";
import { ActivityRecapDrawer } from "@/components/activities/ActivityRecapDrawer";
import { MarkdownField } from "@/components/markdown/MarkdownField";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PROJECT_COVER_MAX_BYTES, type CroppedProjectCover } from "@/lib/client/project-cover";
import type { ActivityRecapView, ActivityView, ManagedActivityFilter } from "@/lib/club-activities";

type FormState = {
  title: string;
  summary: string;
  content: string;
  mode: "online" | "offline";
  location: string;
  startsAt: string;
  endsAt: string;
  registrationOpensAt: string;
  registrationClosesAt: string;
  capacity: number | "";
};

type Registration = { id: string; displayName: string; registeredAt: string };
type FieldErrors = Partial<Record<keyof FormState, string>>;
type ActivityFilter = ManagedActivityFilter;
export type ActivityManagerPreviewData = {
  activities: ActivityView[];
  registrations: Record<string, Registration[]>;
  recaps: Record<string, ActivityRecapView>;
};
const PAGE_SIZE = 20;

const filterLabels: Record<ActivityFilter, string> = {
  all: "全部",
  draft: "草稿",
  active: "待举行 / 进行中",
  past: "已结束",
  cancelled: "已取消",
};

const fieldLabels: Partial<Record<keyof FormState, string>> = {
  title: "标题",
  summary: "摘要",
  location: "地点或会议链接",
  capacity: "人数上限",
  startsAt: "活动开始",
  endsAt: "活动结束",
  registrationOpensAt: "报名开放",
  registrationClosesAt: "报名截止",
};
const controlClass = "mt-1.5 min-h-11 w-full rounded-lg border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60";

function FieldError({ field, errors }: { field: keyof FormState; errors: FieldErrors }) {
  return errors[field] ? <p id={"activity-" + field + "-error"} className="mt-1 text-xs text-destructive">{errors[field]}</p> : null;
}

function localInput(iso: string): string {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function emptyForm(): FormState {
  const start = new Date(Date.now() + 3 * 86_400_000);
  const end = new Date(start.getTime() + 2 * 3_600_000);
  return {
    title: "", summary: "", content: "", mode: "offline", location: "",
    startsAt: localInput(start.toISOString()),
    endsAt: localInput(end.toISOString()),
    registrationOpensAt: localInput(new Date().toISOString()),
    registrationClosesAt: localInput(new Date(start.getTime() - 3_600_000).toISOString()),
    capacity: 30,
  };
}

function formFromActivity(activity: ActivityView): FormState {
  return {
    title: activity.title,
    summary: activity.summary,
    content: activity.content,
    mode: activity.mode as "online" | "offline",
    location: activity.location,
    startsAt: localInput(activity.startsAt),
    endsAt: localInput(activity.endsAt),
    registrationOpensAt: localInput(activity.registrationOpensAt),
    registrationClosesAt: localInput(activity.registrationClosesAt),
    capacity: activity.capacity,
  };
}

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new Error(data?.error || `操作失败（${response.status}）。`);
  if (!data) throw new Error("服务器返回的内容无法读取，请刷新后重试。");
  return data;
}

const dateText = (iso: string) => new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", dateStyle: "medium", timeStyle: "short",
}).format(new Date(iso));

function phaseOf(activity: ActivityView, now: number): ActivityFilter | "ongoing" {
  if (activity.status === "draft") return "draft";
  if (activity.status === "cancelled") return "cancelled";
  if (Date.parse(activity.endsAt) <= now) return "past";
  return Date.parse(activity.startsAt) <= now ? "ongoing" : "active";
}

function phaseLabel(phase: ReturnType<typeof phaseOf>) {
  return phase === "ongoing" ? "进行中" : phase === "active" ? "待举行" : filterLabels[phase];
}

function validateForm(form: FormState, publishing: boolean): FieldErrors {
  const errors: FieldErrors = {};
  if (form.title.trim().length < 2) errors.title = "标题至少需要 2 个字。";
  if (form.summary.trim().length < 2) errors.summary = "摘要至少需要 2 个字。";
  if (form.location.trim().length < 2) errors.location = "请填写地点或会议链接。";
  if (typeof form.capacity !== "number" || !Number.isInteger(form.capacity) || form.capacity < 1 || form.capacity > 100_000) {
    errors.capacity = "人数上限须为 1 到 100000 的整数。";
  }
  const start = Date.parse(form.startsAt);
  const end = Date.parse(form.endsAt);
  const opens = Date.parse(form.registrationOpensAt);
  const closes = Date.parse(form.registrationClosesAt);
  if (!Number.isFinite(start)) errors.startsAt = "请选择活动开始时间。";
  if (!Number.isFinite(end)) errors.endsAt = "请选择活动结束时间。";
  if (!Number.isFinite(opens)) errors.registrationOpensAt = "请选择报名开放时间。";
  if (!Number.isFinite(closes)) errors.registrationClosesAt = "请选择报名截止时间。";
  if (Number.isFinite(start) && Number.isFinite(end) && end <= start) errors.endsAt = "活动结束时间必须晚于开始时间。";
  if (Number.isFinite(opens) && Number.isFinite(closes) && closes <= opens) errors.registrationClosesAt = "报名截止时间必须晚于开放时间。";
  if (Number.isFinite(start) && Number.isFinite(closes) && closes > start) errors.registrationClosesAt = "报名须在活动开始前截止。";
  if (publishing) {
    if (Number.isFinite(start) && start <= Date.now()) errors.startsAt = "发布前请将活动开始时间设在未来。";
    if (Number.isFinite(closes) && closes <= Date.now()) errors.registrationClosesAt = "发布前请将报名截止时间设在未来。";
  }
  return errors;
}

export function ActivityManager({ previewData }: { previewData?: ActivityManagerPreviewData }) {
  const [items, setItems] = useState<ActivityView[]>(previewData?.activities.slice(0, PAGE_SIZE) ?? []);
  const [loading, setLoading] = useState(!previewData);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const loadRequestRef = useRef(0);
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [draftFilter, setDraftFilter] = useState<ActivityFilter>("all");
  const [search, setSearch] = useState("");
  const [draftSearch, setDraftSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(previewData?.activities.length ?? 0);
  const [totalPages, setTotalPages] = useState(Math.ceil((previewData?.activities.length ?? 0) / PAGE_SIZE));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const baselineRef = useRef(form);
  const [formErrors, setFormErrors] = useState<FieldErrors>({});
  const [registrationDrawerOpen, setRegistrationDrawerOpen] = useState(false);
  const [recapDrawerOpen, setRecapDrawerOpen] = useState(false);
  const [recapTarget, setRecapTarget] = useState<ActivityView | null>(null);
  const [registrationTarget, setRegistrationTarget] = useState<ActivityView | null>(null);
  const [registrations, setRegistrations] = useState<Registration[] | null>(null);
  const [loadingRegistrations, setLoadingRegistrations] = useState(false);
  const [registrationError, setRegistrationError] = useState("");
  const registrationRequestRef = useRef(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState("");
  const [coverCropSource, setCoverCropSource] = useState<File | null>(null);
  const [coverCropOpen, setCoverCropOpen] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const coverButtonRef = useRef<HTMLButtonElement>(null);
  const coverPreviewRef = useRef("");
  const listHeadingRef = useRef<HTMLHeadingElement>(null);
  const formErrorRef = useRef<HTMLDivElement>(null);
  const editorHeadingRef = useRef<HTMLHeadingElement>(null);
  const registrationHeadingRef = useRef<HTMLHeadingElement>(null);
  const registrationTriggerRef = useRef<HTMLButtonElement | null>(null);
  const moreActionTriggerRef = useRef<HTMLButtonElement | null>(null);
  const registrationFromMenuRef = useRef(false);
  const recapTriggerRef = useRef<HTMLButtonElement | null>(null);
  const drawerTriggerRef = useRef<HTMLButtonElement | null>(null);
  const newButtonRef = useRef<HTMLButtonElement | null>(null);

  const load = useCallback(async (
    targetPage: number,
    activeFilter: ActivityFilter,
    activeSearch: string,
    { showLoading = true, focusList = false }: { showLoading?: boolean; focusList?: boolean } = {},
  ): Promise<void> => {
    const requestId = ++loadRequestRef.current;
    if (showLoading) setLoading(true);
    registrationRequestRef.current += 1;
    setRegistrationDrawerOpen(false);
    setRegistrations(null);
    setLoadingRegistrations(false);
    setRegistrationError("");
    try {
      if (previewData) {
        const query = activeSearch.trim().toLowerCase();
        const now = Date.now();
        const matching = previewData.activities.filter(activity => {
          const phase = phaseOf(activity, now);
          const matchesStatus = activeFilter === "all" || phase === activeFilter || (activeFilter === "active" && phase === "ongoing");
          const matchesSearch = !query || [activity.title, activity.summary, activity.location].some(value => value.toLowerCase().includes(query));
          return matchesStatus && matchesSearch;
        });
        const pages = Math.ceil(matching.length / PAGE_SIZE);
        const nextPage = Math.min(targetPage, pages || 1);
        setItems(matching.slice((nextPage - 1) * PAGE_SIZE, nextPage * PAGE_SIZE));
        setTotal(matching.length);
        setTotalPages(pages);
        setPage(nextPage);
        setFilter(activeFilter);
        setSearch(activeSearch);
        setError("");
        if (focusList) window.requestAnimationFrame(() => listHeadingRef.current?.focus());
        return;
      }
      let requestedPage = targetPage;
      while (true) {
        const params = new URLSearchParams({ page: String(requestedPage), limit: String(PAGE_SIZE) });
        if (activeFilter !== "all") params.set("status", activeFilter);
        if (activeSearch.trim()) params.set("search", activeSearch.trim());
        const data = await requestJson(`/api/v1/manage/activities?${params}`) as {
          items: ActivityView[]; total: number; page: number; totalPages: number;
        };
        if (requestId !== loadRequestRef.current) return;
        if (data.totalPages > 0 && requestedPage > data.totalPages) {
          requestedPage = data.totalPages;
          continue;
        }
        setItems(data.items);
        setTotal(data.total);
        setTotalPages(data.totalPages);
        setPage(data.totalPages === 0 ? 1 : data.page);
        setFilter(activeFilter);
        setSearch(activeSearch);
        setError("");
        if (focusList) window.requestAnimationFrame(() => listHeadingRef.current?.focus());
        break;
      }
    } catch (caught) {
      if (requestId === loadRequestRef.current) setError(caught instanceof Error ? caught.message : "活动读取失败。");
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  }, [previewData]);

  useEffect(() => { if (!previewData) void load(1, "all", ""); }, [load, previewData]);
  useEffect(() => () => {
    if (coverPreviewRef.current) URL.revokeObjectURL(coverPreviewRef.current);
  }, []);

  const dirtyDetails = JSON.stringify(form) !== JSON.stringify(baselineRef.current);
  const dirty = dirtyDetails || Boolean(coverFile);
  const now = Date.now();
  const currentActivity = items.find(item => item.id === editingId);
  const lockedDetails = Boolean(currentActivity && (
    currentActivity.status === "cancelled" ||
    (currentActivity.status === "published" && Date.parse(currentActivity.startsAt) <= now)
  ));
  const imageUrl = coverPreview || currentActivity?.coverUrl;
  const hasAppliedFilters = filter !== "all" || Boolean(search.trim());
  function applyFilters() {
    void load(1, draftFilter, draftSearch.trim(), { focusList: true });
  }

  function resetFilters() {
    setDraftFilter("all");
    setDraftSearch("");
    void load(1, "all", "", { focusList: true });
  }

  useEffect(() => {
    if (!drawerOpen || !dirty) return;
    const preventLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const guardLink = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const link = event.target.closest<HTMLAnchorElement>("a[href]");
      if (!link || (link.target && link.target !== "_self") || link.hasAttribute("download")) return;
      const destination = new URL(link.href, window.location.href);
      if (destination.origin !== window.location.origin ||
        (destination.pathname === window.location.pathname && destination.search === window.location.search)) return;
      if (!window.confirm("当前活动有未保存的修改，确定离开此页面吗？")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", preventLeave);
    document.addEventListener("click", guardLink, true);
    return () => {
      window.removeEventListener("beforeunload", preventLeave);
      document.removeEventListener("click", guardLink, true);
    };
  }, [dirty, drawerOpen]);

  async function execute(action: () => Promise<void>): Promise<boolean> {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await action();
      await load(page, filter, search, { showLoading: false });
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "操作失败。");
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function closeDrawer() {
    clearPendingCover();
    const nextForm = emptyForm();
    baselineRef.current = nextForm;
    setForm(nextForm);
    setEditingId(null);
    setFormErrors({});
    setDrawerOpen(false);
  }

  function requestDrawerClose() {
    if (busyRef.current || coverCropOpen) return;
    if (dirty && !window.confirm("当前活动有未保存的修改，确定关闭并放弃吗？")) return;
    setError("");
    setMessage("");
    closeDrawer();
  }

  function edit(activity: ActivityView, trigger: HTMLButtonElement) {
    if (busyRef.current || activity.id === editingId || (dirty && !window.confirm("当前活动有未保存的修改，确定放弃并切换吗？"))) return;
    drawerTriggerRef.current = trigger;
    clearPendingCover();
    setEditingId(activity.id);
    const nextForm = formFromActivity(activity);
    baselineRef.current = nextForm;
    setForm(nextForm);
    setFormErrors({});
    setMessage("");
    setError("");
    setDrawerOpen(true);
  }

  function createNew(trigger: HTMLButtonElement) {
    if (busyRef.current || (dirty && !window.confirm("当前活动有未保存的修改，确定放弃并新建吗？"))) return;
    drawerTriggerRef.current = trigger;
    clearPendingCover();
    const nextForm = emptyForm();
    baselineRef.current = nextForm;
    setForm(nextForm);
    setEditingId(null);
    setFormErrors({});
    setError("");
    setMessage("");
    setDrawerOpen(true);
  }

  function discardChanges() {
    if (busyRef.current || (dirty && !window.confirm("确定放弃当前未保存的修改吗？"))) return;
    clearPendingCover();
    setForm(baselineRef.current);
    setFormErrors({});
    setError("");
    setMessage("未保存的修改已放弃。");
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(current => ({ ...current, [key]: value }));
    setFormErrors(current => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function clearPendingCover() {
    if (coverPreviewRef.current) URL.revokeObjectURL(coverPreviewRef.current);
    coverPreviewRef.current = "";
    setCoverPreview("");
    setCoverFile(null);
    setCoverCropSource(null);
    setCoverCropOpen(false);
    if (coverInputRef.current) coverInputRef.current.value = "";
  }

  function selectCover(file: File | undefined) {
    if (!file) return;
    if (file.size > PROJECT_COVER_MAX_BYTES) {
      setError("封面大小不能超过 5MB。");
      if (coverInputRef.current) coverInputRef.current.value = "";
      return;
    }
    if (file.type !== "image/jpeg" && file.type !== "image/png") {
      setError("请选择 JPG 或 PNG 图片。");
      if (coverInputRef.current) coverInputRef.current.value = "";
      return;
    }
    setError("");
    setCoverCropSource(file);
    setCoverCropOpen(true);
  }

  function applyCroppedCover(result: CroppedProjectCover) {
    if (coverPreviewRef.current) URL.revokeObjectURL(coverPreviewRef.current);
    const preview = URL.createObjectURL(result.file);
    coverPreviewRef.current = preview;
    setCoverPreview(preview);
    setCoverFile(result.file);
    setCoverCropSource(null);
    setCoverCropOpen(false);
    if (coverInputRef.current) coverInputRef.current.value = "";
  }

  async function uploadCover(id: string) {
    if (!coverFile) return null;
    const body = new FormData();
    body.append("cover", coverFile);
    const updated = await requestJson(`/api/v1/activities/${id}/cover`, { method: "PUT", body }) as ActivityView;
    clearPendingCover();
    return updated;
  }

  async function saveCover() {
    if (!editingId || !coverFile) return;
    await execute(async () => {
      await uploadCover(editingId);
      setMessage(dirtyDetails ? "封面已保存，表单中的其他修改仍未保存。" : "活动封面已更新，公开页面会使用新图片。");
    });
  }

  async function save(publish = false): Promise<boolean> {
    if (lockedDetails) {
      setError("该活动已开始或取消，基本信息不可修改；封面可单独保存。");
      return false;
    }
    const errors = validateForm(form, publish);
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      setError("");
      setMessage("");
      window.requestAnimationFrame(() => formErrorRef.current?.focus());
      return false;
    }
    setFormErrors({});
    const completed = await execute(async () => {
      let saved = currentActivity;
      let detailsSaved = false;
      let coverSaved = false;
      if (!editingId || dirtyDetails) {
        const payload = {
          ...form,
          capacity: Number(form.capacity),
          title: form.title.trim(),
          summary: form.summary.trim(),
          location: form.location.trim(),
          startsAt: new Date(form.startsAt).toISOString(),
          endsAt: new Date(form.endsAt).toISOString(),
          registrationOpensAt: new Date(form.registrationOpensAt).toISOString(),
          registrationClosesAt: new Date(form.registrationClosesAt).toISOString(),
        };
        saved = await requestJson(editingId ? `/api/v1/activities/${editingId}` : "/api/v1/activities", {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }) as ActivityView;
        detailsSaved = true;
        setEditingId(saved.id);
        const normalized = formFromActivity(saved);
        baselineRef.current = normalized;
        setForm(normalized);
      }
      if (!saved) throw new Error("活动未能保存，请刷新后重试。");
      if (coverFile) {
        try {
          saved = await uploadCover(saved.id) ?? saved;
          coverSaved = true;
        } catch (uploadError) {
          await load(page, filter, search, { showLoading: false });
          const reason = uploadError instanceof Error ? uploadError.message : "请重试。";
          throw new Error(detailsSaved ? "活动信息已保存，但封面上传失败：" + reason + " 可单独重试封面。" : reason);
        }
      }
      if (publish && saved.status === "draft") {
        try {
          await requestJson(`/api/v1/activities/${saved.id}/publish`, { method: "POST" });
        } catch (publishError) {
          await load(page, filter, search, { showLoading: false });
          const reason = publishError instanceof Error ? publishError.message : "请重试。";
          throw new Error(detailsSaved ? "活动已保存为草稿，但发布失败：" + reason : coverSaved ? "封面已保存，但发布失败：" + reason : reason);
        }
      }
      setMessage(publish ? "活动已保存并发布，前台现在可以查看。" : editingId ? "活动修改已保存。" : "活动已保存为草稿。");
    });
    if (completed) closeDrawer();
    return completed;
  }

  async function action(id: string, kind: "publish" | "cancel" | "delete") {
    if (previewData) return;
    const target = items.find(item => item.id === id);
    if (!target) return;
    if (kind === "publish") {
      const needsSave = editingId === id && dirty;
      if (!window.confirm(`确认发布「${target.title}」？${needsSave ? "当前未保存的修改会先保存，再发布。" : "发布后前台将立即可见。"}`)) return;
      if (needsSave) { await save(true); return; }
    }
    if (kind === "delete" && !window.confirm(`确认删除「${target.title}」？活动将从公开页面下架。${editingId === id && dirty ? "当前未保存的修改会丢失。" : ""}`)) return;
    if (kind === "cancel" && !window.confirm(`确认取消「${target.title}」？报名用户会看到取消状态。${editingId === id && dirty ? "当前未保存的修改会丢失。" : ""}`)) return;
    await execute(async () => {
      const updated = await requestJson(kind === "delete" ? `/api/v1/activities/${id}` : `/api/v1/activities/${id}/${kind}`, {
        method: kind === "delete" ? "DELETE" : "POST",
      }) as ActivityView | null;
      if (editingId === id) {
        clearPendingCover();
        const nextForm = updated ? formFromActivity(updated) : emptyForm();
        baselineRef.current = nextForm;
        setForm(nextForm);
        setFormErrors({});
        if (!updated) setEditingId(null);
      }
      setMessage(kind === "publish" ? "活动已发布。" : kind === "cancel" ? "活动已取消。" : "活动已删除。");
    });
  }

  function closeRegistrations() {
    registrationRequestRef.current += 1;
    setRegistrationDrawerOpen(false);
    setLoadingRegistrations(false);
  }

  async function readRegistrations(id: string) {
    const requestId = ++registrationRequestRef.current;
    setLoadingRegistrations(true);
    setRegistrationError("");
    setRegistrations(null);
    if (previewData) {
      setRegistrations(previewData.registrations[id] ?? []);
      setLoadingRegistrations(false);
      return;
    }
    try {
      const data = await requestJson(`/api/v1/activities/${id}/registrations`) as { items: Registration[] };
      if (requestId === registrationRequestRef.current) setRegistrations(data.items);
    } catch (caught) {
      if (requestId === registrationRequestRef.current) setRegistrationError(caught instanceof Error ? caught.message : "报名名单读取失败。");
    } finally {
      if (requestId === registrationRequestRef.current) setLoadingRegistrations(false);
    }
  }

  function showRegistrations(activity: ActivityView, trigger: HTMLButtonElement | null) {
    registrationTriggerRef.current = trigger;
    setRegistrationTarget(activity);
    setRegistrationDrawerOpen(true);
    void readRegistrations(activity.id);
  }

  function showRecap(activity: ActivityView, trigger: HTMLButtonElement) {
    recapTriggerRef.current = trigger;
    setRecapTarget(activity);
    setRecapDrawerOpen(true);
  }

  function recapSaved(recap: ActivityRecapView) {
    setRecapTarget(current => current?.id === recap.activityId ? { ...current, recapPublishedAt: recap.publishedAt } : current);
    void load(page, filter, search, { showLoading: false });
  }

  return <section className="space-y-7">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">CLUB OPERATIONS</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">俱乐部活动管理</h1>
        <p className="mt-2 text-sm text-muted-foreground">创建活动、查看报名，并在活动结束后提交活动回顾。</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || loading || Boolean(previewData)} onClick={() => void load(page, filter, search)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border bg-card px-4 text-sm font-medium hover:bg-muted disabled:opacity-50"><RefreshCw aria-hidden="true" className="size-4" />刷新</button>
        <button ref={newButtonRef} type="button" aria-haspopup="dialog" aria-expanded={drawerOpen && !editingId} aria-controls="activity-editor-drawer" disabled={busy || Boolean(previewData)} onClick={event => createNew(event.currentTarget)} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">新建活动</button>
      </div>
    </div>
    {!drawerOpen && error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
    {!drawerOpen && message && <p role="status" className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm text-foreground">{message}</p>}

    <div className="min-w-0 space-y-5">
      <Card role="region" aria-labelledby="activity-filter-title">
        <CardHeader>
          <CardTitle id="activity-filter-title" className="flex items-center gap-2 text-lg"><Search aria-hidden="true" className="size-4" />筛选活动</CardTitle>
          <CardDescription>按状态或关键词查找活动，已结束活动可提交活动回顾。</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={event => { event.preventDefault(); applyFilters(); }} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[180px_minmax(180px,1fr)_auto_auto] lg:items-end">
            <label className="grid gap-2 text-sm">
              <span className="text-muted-foreground">状态</span>
              <NativeSelect clearValue="all" value={draftFilter} onChange={event => setDraftFilter(event.target.value as ActivityFilter)} className="min-h-11 rounded-md border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                {(Object.keys(filterLabels) as ActivityFilter[]).map(option => <option key={option} value={option}>{option === "all" ? "全部状态" : filterLabels[option]}</option>)}
              </NativeSelect>
            </label>
            <label className="grid gap-2 text-sm">
              <span className="text-muted-foreground">关键词</span>
              <Input type="search" maxLength={200} value={draftSearch} onChange={event => setDraftSearch(event.target.value)} placeholder="标题、摘要或地点" className="min-h-11" />
            </label>
            <Button type="submit" className="min-h-11">搜索</Button>
            <Button type="button" variant="ghost" onClick={resetFilters} className="min-h-11">重置</Button>
          </form>
        </CardContent>
      </Card>
      <div className="min-w-0 rounded-2xl border bg-card p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 ref={listHeadingRef} tabIndex={-1} className="scroll-mt-24 text-xl font-semibold">活动列表</h2><span className="text-xs text-muted-foreground">{hasAppliedFilters ? `匹配 ${total} 场` : `共 ${total} 场`}</span></div>
        {loading ? <p role="status" className="mt-5 text-sm text-muted-foreground">正在读取活动…</p> : items.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed p-6 text-center">
            <p className="font-medium">{hasAppliedFilters ? "没有找到匹配的活动" : "还没有活动"}</p>
            <p className="mt-1 text-sm text-muted-foreground">{hasAppliedFilters ? "试试其他关键词或状态筛选。" : "点击“新建活动”开始创建。"}</p>
            {hasAppliedFilters && <button type="button" onClick={resetFilters} className="mt-3 min-h-10 text-sm font-medium text-primary hover:underline">清除筛选</button>}
          </div>
        ) : <>
          <div className="mt-5 overflow-hidden rounded-xl border">
            <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1.5fr)] items-center gap-4 border-b bg-muted/40 px-4 py-3 text-xs font-semibold text-muted-foreground xl:grid">
              <span>活动</span>
              <div className="grid grid-cols-[minmax(0,1.7fr)_minmax(5rem,0.9fr)_minmax(4rem,0.7fr)] gap-3"><span>开始时间</span><span>状态</span><span>报名人数</span></div>
              <span className="text-right">操作</span>
            </div>
            <div className="divide-y">
              {items.map(item => {
                const phase = phaseOf(item, now);
                const selected = editingId === item.id;
                const detailsLocked = item.status === "cancelled" || (item.status === "published" && Date.parse(item.startsAt) <= now);
                const registrationInMenu = item.status === "draft" || (phase === "past" && item.status === "published");
                return <article key={item.id} aria-labelledby={"activity-row-" + item.id} className={"transition-colors " + (selected && drawerOpen ? "bg-primary/[0.04]" : "bg-background hover:bg-muted/25")}>
                  <div className="grid gap-3 px-4 py-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1.5fr)] xl:items-center xl:gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-14 w-[88px] shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground">
                        {item.coverUrl ? <img src={item.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" /> : <ImagePlus aria-hidden="true" className="size-5" />}
                      </div>
                      <div className="min-w-0">
                        <h3 id={"activity-row-" + item.id} title={item.title} className="truncate text-sm font-semibold">{item.title}</h3>
                        <p title={item.summary} className="mt-1 truncate text-xs text-muted-foreground">{item.summary}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-[minmax(0,1.5fr)_auto_auto] gap-3 border-t pt-3 xl:grid-cols-[minmax(0,1.7fr)_minmax(5rem,0.9fr)_minmax(4rem,0.7fr)] xl:items-center xl:border-0 xl:pt-0">
                      <div className="min-w-0">
                        <span className="mb-1 block text-[11px] text-muted-foreground xl:hidden">开始时间</span>
                        <time dateTime={item.startsAt} className="block text-xs font-medium">{dateText(item.startsAt)}</time>
                        <p title={item.location} className="mt-1 truncate text-[11px] text-muted-foreground">{item.mode === "online" ? "线上 · " : "线下 · "}{item.location}</p>
                      </div>
                      <div>
                        <span className="mb-1 block text-[11px] text-muted-foreground xl:hidden">状态</span>
                        <span className={"inline-flex whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-medium " + (phase === "active" || phase === "ongoing" ? "bg-primary/10 text-primary" : phase === "cancelled" ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200" : "bg-muted text-muted-foreground")}>{phaseLabel(phase)}</span>
                      </div>
                      <div>
                        <span className="mb-1 block text-[11px] text-muted-foreground xl:hidden">报名人数</span>
                        <span className="whitespace-nowrap text-xs font-medium">{item.registeredCount} / {item.capacity}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 border-t pt-3 xl:justify-end xl:border-0 xl:pt-0">
                      <button type="button" aria-haspopup="dialog" aria-expanded={selected && drawerOpen} aria-controls="activity-editor-drawer" disabled={busy || Boolean(previewData)} onClick={event => edit(item, event.currentTarget)} className="min-h-11 rounded-lg px-2.5 text-xs font-medium text-primary hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50">{selected && drawerOpen ? "正在编辑" : detailsLocked ? "查看 / 换封面" : "编辑活动"}</button>
                      {item.status === "draft" && <button type="button" disabled={busy || Boolean(previewData)} onClick={() => { void action(item.id, "publish"); }} className="min-h-11 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50">发布</button>}
                      {phase === "past" && item.status === "published" && <button type="button" aria-haspopup="dialog" aria-expanded={recapDrawerOpen && recapTarget?.id === item.id} aria-controls="activity-recap-drawer" disabled={busy} onClick={event => showRecap(item, event.currentTarget)} className="min-h-11 rounded-lg px-2.5 text-xs font-medium text-primary hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50">{item.recapPublishedAt ? "编辑回顾" : "提交回顾"}</button>}
                      {!registrationInMenu && <button type="button" aria-haspopup="dialog" aria-expanded={registrationDrawerOpen && registrationTarget?.id === item.id} aria-controls="activity-registrations-drawer" disabled={busy} onClick={event => showRegistrations(item, event.currentTarget)} className="min-h-11 rounded-lg px-2.5 text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50">报名名单</button>}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><button type="button" aria-label={"更多操作：" + item.title} disabled={busy} onFocus={event => { moreActionTriggerRef.current = event.currentTarget; }} onPointerDown={event => { moreActionTriggerRef.current = event.currentTarget; }} className="inline-flex size-11 items-center justify-center rounded-lg border text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"><MoreHorizontal aria-hidden="true" className="size-4" /></button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-40" onCloseAutoFocus={event => {
                          if (!registrationFromMenuRef.current) return;
                          event.preventDefault();
                          registrationFromMenuRef.current = false;
                          window.requestAnimationFrame(() => registrationHeadingRef.current?.focus());
                        }}>
                          {registrationInMenu && <DropdownMenuItem onSelect={() => {
                            registrationFromMenuRef.current = true;
                            showRegistrations(item, moreActionTriggerRef.current);
                          }}>报名名单</DropdownMenuItem>}
                          {item.status !== "draft" && <DropdownMenuItem asChild><Link href={"/activities/" + encodeURIComponent(item.id) + "/"} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">前台查看<ExternalLink aria-hidden="true" className="size-3" /></Link></DropdownMenuItem>}
                          {item.status === "published" && phase !== "past" && <DropdownMenuItem disabled={Boolean(previewData)} onSelect={() => { void action(item.id, "cancel"); }}>取消活动</DropdownMenuItem>}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem disabled={Boolean(previewData)} onSelect={() => { void action(item.id, "delete"); }} className="text-destructive focus:text-destructive">删除活动</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </article>;
              })}
            </div>
          </div>
          {totalPages > 0 && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>第 {page} / {totalPages} 页 · 显示 {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} 场，共 {total} 场</span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" disabled={page <= 1 || busy} onClick={() => { void load(page - 1, filter, search, { focusList: true }); }} className="min-h-11">上一页</Button>
              <Button type="button" variant="outline" disabled={page >= totalPages || busy} onClick={() => { void load(page + 1, filter, search, { focusList: true }); }} className="min-h-11">下一页</Button>
            </div>
          </div>}
        </>}
      </div>
    </div>

    <Sheet open={drawerOpen} onOpenChange={open => { if (open) setDrawerOpen(true); else requestDrawerClose(); }}>
      <SheetContent id="activity-editor-drawer" side="right" onOpenAutoFocus={event => { event.preventDefault(); editorHeadingRef.current?.focus(); }} onCloseAutoFocus={event => { event.preventDefault(); (drawerTriggerRef.current?.isConnected ? drawerTriggerRef.current : newButtonRef.current)?.focus(); }}
        className="member-center flex h-dvh w-full flex-col gap-0 overflow-hidden bg-background p-0 text-foreground sm:max-w-[720px] lg:max-w-[800px] [&>button]:hidden">
        <form noValidate onSubmit={(event) => { event.preventDefault(); void save(); }} className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 border-b px-5 py-5 sm:px-7">
            <SheetHeader className="pr-16 text-left">
              <SheetTitle ref={editorHeadingRef} tabIndex={-1} className="text-xl outline-none">{editingId ? "编辑活动" : "新建活动"}</SheetTitle>
              <SheetDescription>{lockedDetails ? "活动已开始或取消，基本信息已锁定；仍可更新封面。" : currentActivity?.status === "published" ? "修改保存后会同步更新前台活动信息。" : "填写基本信息，保存草稿后再发布。"}</SheetDescription>
            </SheetHeader>
            <button type="button" disabled={busy} onClick={requestDrawerClose} className="absolute right-5 top-5 min-h-11 rounded-lg border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50">关闭</button>
            {currentActivity && <span className="mt-3 inline-flex rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">{phaseLabel(phaseOf(currentActivity, now))}</span>}
            {dirty && <p role="status" className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">有未保存的修改</p>}
            {error && <p role="alert" className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
            {message && <p role="status" className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm text-foreground">{message}</p>}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
        {Object.keys(formErrors).length > 0 && <div ref={formErrorRef} tabIndex={-1} role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm outline-none">
          <p className="font-semibold text-destructive">请先检查以下信息</p>
          <ul className="mt-2 list-inside list-disc space-y-1">{(Object.keys(formErrors) as (keyof FormState)[]).map(key => <li key={key}><a href={"#activity-" + key} className="text-destructive underline underline-offset-2">{fieldLabels[key]}：{formErrors[key]}</a></li>)}</ul>
        </div>}
        <div className="mt-5 grid gap-6">
          <div className="grid gap-3">
            <div><h3 className="text-sm font-semibold">活动封面 <span className="font-normal text-muted-foreground">· 可选</span></h3><p className="mt-1 text-xs text-muted-foreground">展示在活动交流、首页活动卡片和详情页；已结束活动也可单独更新。</p></div>
            <button ref={coverButtonRef} type="button" disabled={busy} onClick={() => coverInputRef.current?.click()} className="group relative flex aspect-[8/5] w-full max-w-[340px] items-center justify-center overflow-hidden rounded-xl border bg-muted/40 text-sm transition-colors hover:border-primary/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60">
              {imageUrl ? (
                <>
                  <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-black/65 px-3 py-3 font-medium text-white"><ImagePlus aria-hidden="true" className="size-4" />{coverFile ? "点击重新选图" : "点击更换封面"}</span>
                </>
              ) : (
                <span className="flex flex-col items-center gap-2 text-muted-foreground group-hover:text-primary"><ImagePlus aria-hidden="true" className="size-8" /><span className="font-medium">点击上传封面</span><span className="text-xs">选择图片后可裁剪</span></span>
              )}
            </button>
            <input ref={coverInputRef} id="activity-cover" type="file" accept="image/jpeg,image/png" disabled={busy} onChange={event => selectCover(event.target.files?.[0])} className="hidden" tabIndex={-1} aria-hidden="true" />
            <p className="text-xs text-muted-foreground">点击封面区域选择图片，裁剪后保存才会生效。支持 JPG / PNG，原图不超过 5MB，裁剪比例 16:10。</p>
            {coverFile && <div className="flex flex-wrap items-center gap-3">
              <span className="max-w-full truncate text-xs font-medium text-primary" title={coverFile.name}>待保存：{coverFile.name}</span>
              <button type="button" disabled={busy} onClick={clearPendingCover} className="min-h-10 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50">撤销选择</button>
              {editingId && <button type="button" disabled={busy} onClick={() => void saveCover()} className="min-h-11 rounded-lg border px-3 text-sm font-medium text-primary hover:bg-muted disabled:opacity-50">只保存封面</button>}
            </div>}
          </div>
          <fieldset disabled={lockedDetails || busy} className="grid gap-6">
            <section aria-labelledby="activity-basic-title" className="grid gap-4 border-t pt-6">
              <div><h3 id="activity-basic-title" className="text-sm font-semibold">基本信息</h3><p className="mt-1 text-xs text-muted-foreground">标题和摘要会显示在活动列表中。</p></div>
              <div>
                <label htmlFor="activity-title" className="text-sm font-medium">标题 <span aria-hidden="true" className="text-destructive">*</span></label>
                <Input id="activity-title" maxLength={120} value={form.title} onChange={event => update("title", event.target.value)} aria-invalid={Boolean(formErrors.title)} aria-describedby={formErrors.title ? "activity-title-error" : undefined} className={controlClass} />
                <FieldError field="title" errors={formErrors} />
              </div>
              <div>
                <label htmlFor="activity-summary" className="text-sm font-medium">摘要 <span aria-hidden="true" className="text-destructive">*</span></label>
                <Input id="activity-summary" maxLength={300} value={form.summary} onChange={event => update("summary", event.target.value)} aria-invalid={Boolean(formErrors.summary)} aria-describedby={formErrors.summary ? "activity-summary-error" : undefined} className={controlClass} />
                <FieldError field="summary" errors={formErrors} />
              </div>
              <MarkdownField id="activity-content" label="活动介绍" value={form.content}
                onChange={value => update("content", value)} maxLength={20000} rows={8}
                disabled={busy || lockedDetails} previewOnly={lockedDetails}
                placeholder="使用 Markdown 介绍活动内容、议程和参与方式…" />
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="activity-mode" className="text-sm font-medium">形式</label>
                  <NativeSelect clearable={false} id="activity-mode" value={form.mode} onChange={event => update("mode", event.target.value as FormState["mode"])} className={controlClass}><option value="offline">线下</option><option value="online">线上</option></NativeSelect>
                </div>
                <div>
                  <label htmlFor="activity-capacity" className="text-sm font-medium">人数上限 <span aria-hidden="true" className="text-destructive">*</span></label>
                  <Input id="activity-capacity" type="number" min={1} max={100000} value={form.capacity} onChange={event => update("capacity", event.target.value === "" ? "" : Number(event.target.value))} aria-invalid={Boolean(formErrors.capacity)} aria-describedby={formErrors.capacity ? "activity-capacity-error" : undefined} className={controlClass} />
                  <FieldError field="capacity" errors={formErrors} />
                </div>
              </div>
              <div>
                <label htmlFor="activity-location" className="text-sm font-medium">地点或会议链接 <span aria-hidden="true" className="text-destructive">*</span></label>
                <Input id="activity-location" maxLength={300} value={form.location} onChange={event => update("location", event.target.value)} aria-invalid={Boolean(formErrors.location)} aria-describedby={formErrors.location ? "activity-location-error" : undefined} className={controlClass} />
                <FieldError field="location" errors={formErrors} />
              </div>
            </section>
            <section aria-labelledby="activity-time-title" className="grid gap-4 border-t pt-6">
              <div><h3 id="activity-time-title" className="text-sm font-semibold">时间与报名</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">按当前设备时区填写。报名截止须早于活动开始；发布时两者都必须在未来。</p></div>
              <div className="grid gap-4 sm:grid-cols-2">
                {(["startsAt", "endsAt", "registrationOpensAt", "registrationClosesAt"] as const).map(key => <div key={key}>
                  <label htmlFor={"activity-" + key} className="text-sm font-medium">{fieldLabels[key]} <span aria-hidden="true" className="text-destructive">*</span></label>
                  <Input id={"activity-" + key} type="datetime-local" value={form[key]} onChange={event => update(key, event.target.value)} aria-invalid={Boolean(formErrors[key])} aria-describedby={formErrors[key] ? "activity-" + key + "-error" : undefined} className={controlClass} />
                  <FieldError field={key} errors={formErrors} />
                </div>)}
              </div>
            </section>
          </fieldset>
        </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-t bg-background px-5 py-4 sm:px-7">
            {!lockedDetails && <>
              <button type="submit" disabled={busy || (Boolean(editingId) && !dirty)} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">{busy ? "正在保存…" : editingId ? "保存修改" : "保存草稿"}</button>
              {(!currentActivity || currentActivity.status === "draft") && <button type="button" disabled={busy} onClick={() => { if (window.confirm("确认保存当前内容并发布活动？发布后前台会立即可见。")) void save(true); }} className="min-h-11 rounded-lg border px-4 text-sm font-medium text-primary hover:bg-muted disabled:opacity-50">保存并发布</button>}
            </>}
            {dirty && <button type="button" disabled={busy} onClick={discardChanges} className="min-h-11 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-50">放弃修改</button>}
            {!dirty && editingId && <span className="self-center text-xs text-muted-foreground">当前没有未保存的修改</span>}
          </div>
        </form>
      </SheetContent>
    </Sheet>
    <Sheet open={registrationDrawerOpen} onOpenChange={open => { if (!open) closeRegistrations(); }}>
      <SheetContent id="activity-registrations-drawer" side="right"
        onOpenAutoFocus={event => { event.preventDefault(); registrationHeadingRef.current?.focus(); }}
        onCloseAutoFocus={event => { event.preventDefault(); (registrationTriggerRef.current?.isConnected ? registrationTriggerRef.current : listHeadingRef.current)?.focus(); }}
        className="member-center flex h-dvh w-full flex-col gap-0 overflow-hidden bg-background p-0 text-foreground sm:max-w-[520px] [&>button]:hidden">
        <div className="shrink-0 border-b px-5 py-5 sm:px-7">
          <SheetHeader className="pr-16 text-left">
            <SheetTitle ref={registrationHeadingRef} tabIndex={-1} className="text-xl outline-none">报名名单</SheetTitle>
            <SheetDescription className="break-words">{registrationTarget?.title ?? "活动"}</SheetDescription>
          </SheetHeader>
          <button type="button" onClick={closeRegistrations} className="absolute right-5 top-5 min-h-11 rounded-lg border px-3 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">关闭</button>
          <p className="mt-4 text-sm text-muted-foreground">已确认报名 <span className="font-semibold text-foreground">{registrations?.length ?? registrationTarget?.registeredCount ?? 0}</span> 人{registrationTarget ? ` · 名额 ${registrationTarget.capacity} 人` : ""}</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
          {loadingRegistrations ? <p role="status" className="text-sm text-muted-foreground">正在读取报名名单…</p> : registrationError ? (
            <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
              <p className="font-medium text-destructive">报名名单读取失败</p>
              <p className="mt-1 text-destructive">{registrationError}</p>
              <button type="button" onClick={() => { if (registrationTarget) void readRegistrations(registrationTarget.id); }} className="mt-3 min-h-11 rounded-lg border bg-background px-4 font-medium text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">重试</button>
            </div>
          ) : registrations?.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center">
              <p className="text-sm font-medium">暂无报名</p>
              <p className="mt-1 text-xs text-muted-foreground">有人完成报名后，会显示在这里。</p>
            </div>
          ) : registrations ? (
            <ol className="divide-y rounded-xl border">
              {registrations.map((entry, index) => <li key={entry.id} className="flex items-center gap-3 px-4 py-3.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-medium">{entry.displayName}</p>
                  <time className="mt-1 block text-xs text-muted-foreground" dateTime={entry.registeredAt}>报名时间：{dateText(entry.registeredAt)}</time>
                </div>
              </li>)}
            </ol>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
    <ActivityRecapDrawer
      activity={recapTarget}
      open={recapDrawerOpen}
      preview={Boolean(previewData)}
      previewRecap={recapTarget ? previewData?.recaps[recapTarget.id] : undefined}
      onClose={() => setRecapDrawerOpen(false)}
      onSaved={recapSaved}
      returnFocusRef={recapTriggerRef}
    />
    <ProjectCoverCropDialog
      open={coverCropOpen}
      file={coverCropSource}
      subject="活动"
      returnFocusRef={coverButtonRef}
      onOpenChange={open => {
        if (!open) {
          setCoverCropOpen(false);
          setCoverCropSource(null);
          if (coverInputRef.current) coverInputRef.current.value = "";
        }
      }}
      onConfirm={applyCroppedCover}
    />
  </section>;
}
