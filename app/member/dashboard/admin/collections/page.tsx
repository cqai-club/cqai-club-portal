"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Files, FolderInput, Pencil, RefreshCw, Search } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { type ProjectStatus, projectStatusLabels } from "../projects/types";

type SubmissionAsset = {
  id: string;
  kind: string;
  originalName: string;
  downloadUrl: string;
};

type Submission = {
  id: string;
  type: string;
  status: string;
  displayName: string;
  contact: string;
  phone?: string | null;
  email?: string | null;
  payload?: Record<string, unknown>;
  consent: boolean;
  ipAddress?: string | null;
  createdAt: string;
  assets?: SubmissionAsset[];
  importedProject?: {
    id: string;
    slug: string;
    status: ProjectStatus;
    name: string;
    updatedAt: string;
  } | null;
};

type Filters = { type: string; status: string; search: string };
const emptyFilters: Filters = { type: "", status: "", search: "" };
const typeLabels: Record<string, string> = { member: "会员资料", enterprise: "企业资料", project: "AI 项目" };
const statusLabels: Record<string, string> = { new: "待审核", reviewing: "审核中", approved: "已通过", rejected: "已拒绝" };
const statusVariants: Record<string, BadgeProps["variant"]> = { new: "secondary", reviewing: "outline", approved: "default", rejected: "destructive" };

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN");
}

function displayValue(value: unknown) {
  if (Array.isArray(value)) return value.join("、");
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

export default function CollectionSubmissionsPage() {
  const router = useRouter();
  const [draftFilters, setDraftFilters] = useState<Filters>(emptyFilters);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [items, setItems] = useState<Submission[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<Submission | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const latestRequest = useRef(0);
  const activeStatusUpdates = useRef(new Set<string>());
  const [busyStatusIds, setBusyStatusIds] = useState<Set<string>>(new Set());
  const detailTriggerRef = useRef<HTMLButtonElement | null>(null);
  const detailTitleRef = useRef<HTMLHeadingElement | null>(null);

  const loadSubmissions = useCallback(async (targetPage = 1, activeFilters = emptyFilters) => {
    const requestId = ++latestRequest.current;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: String(targetPage), limit: "20" });
    if (activeFilters.type) params.set("type", activeFilters.type);
    if (activeFilters.status) params.set("status", activeFilters.status);
    if (activeFilters.search.trim()) params.set("search", activeFilters.search.trim());

    try {
      const response = await fetch(`/api/admin/collection-submissions?${params.toString()}`);
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "获取征集资料失败。");
      if (requestId !== latestRequest.current) return;
      setItems(result.data || []);
      setTotal(result.total || 0);
      setPage(result.page || targetPage);
      setTotalPages(result.totalPages || 0);
    } catch (loadError) {
      if (requestId !== latestRequest.current) return;
      setError(loadError instanceof Error ? loadError.message : "获取征集资料失败。");
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSubmissions(1, emptyFilters);
  }, [loadSubmissions]);

  async function updateStatus(id: string, status: string) {
    if (activeStatusUpdates.current.has(id)) return;
    activeStatusUpdates.current.add(id);
    setBusyStatusIds(current => new Set(current).add(id));
    try {
      const response = await fetch(`/api/admin/collection-submissions/${encodeURIComponent(id)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "更新审核状态失败。");
      setItems(current => current.map(item => item.id === id ? { ...item, status: result.status } : item));
      setDetail(current => current?.id === id ? { ...current, status: result.status } : current);
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "更新审核状态失败。");
    } finally {
      activeStatusUpdates.current.delete(id);
      setBusyStatusIds(current => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }

  async function openDetail(id: string) {
    setImportError("");
    const response = await fetch(`/api/admin/collection-submissions/${encodeURIComponent(id)}`);
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(result.error || "获取资料详情失败。");
      return;
    }
    setDetail(result);
  }

  async function importProject() {
    if (!detail || detail.type !== "project" || detail.status !== "approved") return;
    setImporting(true);
    setImportError("");
    try {
      const response = await fetch(`/api/admin/collection-submissions/${encodeURIComponent(detail.id)}/import-project`, {
        method: "POST",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "导入项目广场失败。");
      if (!result.project?.id) throw new Error("项目已导入，但接口没有返回项目编号。");
      router.push(`/member/dashboard/admin/projects/${encodeURIComponent(result.project.id)}`);
    } catch (importProjectError) {
      setImportError(importProjectError instanceof Error ? importProjectError.message : "导入项目广场失败。");
    } finally {
      setImporting(false);
    }
  }

  async function openAsset(url: string) {
    const response = await fetch(url);
    if (!response.ok) {
      setError("读取附件失败。");
      return;
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    window.open(objectUrl, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }

  async function exportSubmissions() {
    const params = new URLSearchParams();
    if (filters.type) params.set("type", filters.type);
    if (filters.status) params.set("status", filters.status);
    if (filters.search.trim()) params.set("search", filters.search.trim());
    const response = await fetch(`/api/admin/collection-submissions/export?${params.toString()}`);
    if (!response.ok) {
      setError("导出失败，请稍后重试。");
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "collection-submissions.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">资料征集</h1>
          <p className="text-muted-foreground">查看、审核和导出会员、企业与项目资料。</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void loadSubmissions(page, filters)} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" />刷新</Button>
          <Button variant="outline" onClick={() => void exportSubmissions()}><Download className="mr-2 h-4 w-4" />导出 CSV</Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Search className="h-4 w-4" />筛选条件</CardTitle>
          <CardDescription>按资料类型、审核状态或姓名、联系方式搜索。</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-[180px_180px_minmax(180px,1fr)_auto_auto] md:items-end">
            <label className="grid gap-2 text-sm"><span className="text-muted-foreground">资料类型</span><select className="h-10 rounded-md border bg-background px-3" value={draftFilters.type} onChange={event => setDraftFilters({ ...draftFilters, type: event.target.value })}><option value="">全部类型</option><option value="member">会员资料</option><option value="enterprise">企业资料</option><option value="project">AI 项目</option></select></label>
            <label className="grid gap-2 text-sm"><span className="text-muted-foreground">审核状态</span><select className="h-10 rounded-md border bg-background px-3" value={draftFilters.status} onChange={event => setDraftFilters({ ...draftFilters, status: event.target.value })}><option value="">全部状态</option><option value="new">待审核</option><option value="reviewing">审核中</option><option value="approved">已通过</option><option value="rejected">已拒绝</option></select></label>
            <label className="grid gap-2 text-sm"><span className="text-muted-foreground">关键词</span><input className="h-10 rounded-md border bg-background px-3" placeholder="姓名、公司或联系方式" value={draftFilters.search} onChange={event => setDraftFilters({ ...draftFilters, search: event.target.value })} /></label>
            <Button onClick={() => { setFilters(draftFilters); void loadSubmissions(1, draftFilters); }}>搜索</Button>
            <Button variant="ghost" onClick={() => { setDraftFilters(emptyFilters); setFilters(emptyFilters); void loadSubmissions(1, emptyFilters); }}>重置</Button>
          </div>
        </CardContent>
      </Card>

      {error && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>}

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0"><div><CardTitle>征集记录</CardTitle><CardDescription>共 {total} 条记录</CardDescription></div><Files className="h-5 w-5 text-muted-foreground" /></CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-muted/50 text-muted-foreground"><tr><th scope="col" className="p-3">类型</th><th scope="col" className="p-3">名称</th><th scope="col" className="p-3">联系方式</th><th scope="col" className="p-3">审核状态</th><th scope="col" className="p-3">提交时间</th><th scope="col" className="p-3">操作</th></tr></thead>
              <tbody>
                {loading ? <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">正在加载数据...</td></tr> : items.length === 0 ? <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">没有符合条件的记录。</td></tr> : items.map(item => (
                  <tr key={item.id} className="border-t align-top hover:bg-muted/30">
                    <td className="p-3"><Badge variant="outline">{typeLabels[item.type] || item.type}</Badge></td>
                    <td className="p-3"><div className="font-medium">{item.displayName}</div><div className="text-xs text-muted-foreground">{item.id}</div>{item.importedProject && <Badge variant="outline" className="mt-1">已导入 · {projectStatusLabels[item.importedProject.status]}</Badge>}</td>
                    <td className="p-3"><div>{item.contact}</div><div className="text-muted-foreground">{item.email || item.phone || "-"}</div></td>
                    <td className="p-3"><select aria-label={`更新“${item.displayName}”的审核状态`} className="h-9 rounded-md border bg-background px-2 text-sm" value={item.status} disabled={busyStatusIds.has(item.id)} onChange={event => void updateStatus(item.id, event.target.value)}><option value="new">待审核</option><option value="reviewing">审核中</option><option value="approved">已通过</option><option value="rejected">已拒绝</option></select><div className="mt-1"><Badge variant={statusVariants[item.status] || "secondary"}>{statusLabels[item.status] || item.status}</Badge></div></td>
                    <td className="whitespace-nowrap p-3 text-muted-foreground">{formatDate(item.createdAt)}</td>
                    <td className="p-3"><Button variant="outline" size="sm" onClick={event => { detailTriggerRef.current = event.currentTarget; void openDetail(item.id); }}>查看详情</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 0 && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground"><span>第 {page} / {totalPages} 页</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => void loadSubmissions(page - 1, filters)}>上一页</Button><Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => void loadSubmissions(page + 1, filters)}>下一页</Button></div></div>}
        </CardContent>
      </Card>

      <Dialog open={Boolean(detail)} onOpenChange={open => { if (!open && !importing) { setDetail(null); setImportError(""); } }}>
        <DialogContent
          className="max-h-[85vh] max-w-3xl overflow-y-auto"
          onOpenAutoFocus={event => { event.preventDefault(); detailTitleRef.current?.focus(); }}
          onCloseAutoFocus={event => { event.preventDefault(); detailTriggerRef.current?.focus(); }}
        >
          {detail && <>
            <DialogHeader><DialogTitle ref={detailTitleRef} tabIndex={-1}>{detail.displayName || "资料详情"}</DialogTitle><DialogDescription>{typeLabels[detail.type] || detail.type} · {formatDate(detail.createdAt)}</DialogDescription></DialogHeader>
            <div className="grid gap-3 rounded-md border p-4 text-sm sm:grid-cols-2"><div><span className="text-muted-foreground">联系方式：</span>{detail.contact}</div><div><span className="text-muted-foreground">手机：</span>{detail.phone || "-"}</div><div><span className="text-muted-foreground">邮箱：</span>{detail.email || "-"}</div><div><span className="text-muted-foreground">授权：</span>{detail.consent ? "已同意" : "未同意"}</div><div><span className="text-muted-foreground">提交 IP：</span>{detail.ipAddress || "-"}</div><div><span className="text-muted-foreground">审核状态：</span><Badge variant={statusVariants[detail.status] || "secondary"}>{statusLabels[detail.status] || detail.status}</Badge></div></div>
            <div><h3 className="mb-2 font-medium">资料字段</h3><div className="grid gap-2 rounded-md border p-4 text-sm">{Object.entries(detail.payload || {}).map(([key, value]) => <div key={key} className="grid gap-1 border-b pb-2 last:border-0 last:pb-0 sm:grid-cols-[160px_1fr]"><strong>{key}</strong><span className="text-muted-foreground">{displayValue(value)}</span></div>)}</div></div>
            {detail.type === "project" && (
              <div className="space-y-3 rounded-md border bg-muted/20 p-4">
                <div>
                  <h3 className="flex items-center gap-2 font-medium"><FolderInput className="h-4 w-4" />项目广场</h3>
                  <p className="mt-1 text-sm text-muted-foreground">导入会复制当前征集内容并创建独立草稿；此后修改或删除原记录不会影响项目。</p>
                </div>
                {detail.importedProject ? (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm">
                      <div className="font-medium">{detail.importedProject.name}</div>
                      <div className="mt-1 flex items-center gap-2 text-muted-foreground">
                        <Badge variant="outline">{projectStatusLabels[detail.importedProject.status]}</Badge>
                        <span>/{detail.importedProject.slug}</span>
                      </div>
                    </div>
                    <Button asChild size="sm">
                      <Link href={`/member/dashboard/admin/projects/${encodeURIComponent(detail.importedProject.id)}`}>
                        <Pencil className="h-3.5 w-3.5" />继续编辑
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Button
                      size="sm"
                      disabled={detail.status !== "approved" || importing}
                      onClick={() => void importProject()}
                      aria-describedby="project-import-help"
                    >
                      <FolderInput className="h-3.5 w-3.5" />
                      {importing ? "导入中..." : "导入项目广场"}
                    </Button>
                    <p id="project-import-help" className="text-xs text-muted-foreground">
                      {detail.status === "approved" ? "导入后将进入项目编辑页，默认状态为草稿。" : "只有审核状态为“已通过”的 AI 项目资料可以导入。"}
                    </p>
                  </div>
                )}
                {importError && <p role="alert" className="text-sm text-destructive">{importError}</p>}
              </div>
            )}
            <div><h3 className="mb-2 font-medium">附件</h3><div className="flex flex-wrap gap-2">{detail.assets?.length ? detail.assets.map(asset => <Button key={asset.id} variant="outline" size="sm" onClick={() => void openAsset(asset.downloadUrl)}>{asset.kind === "avatar" ? "查看头像" : asset.kind === "projectCover" ? "查看项目封面" : "查看企业 Logo"} · {asset.originalName}</Button>) : <span className="text-sm text-muted-foreground">无附件</span>}</div></div>
          </>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
