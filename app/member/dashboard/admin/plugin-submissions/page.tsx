"use client";

import { NativeSelect } from "@/components/ui/native-select";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { MarkdownContent } from "@/components/markdown/MarkdownContent";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type SubmissionStatus = "pending" | "approved" | "rejected";
type Submission = {
  id: string;
  status: SubmissionStatus;
  packageName: string;
  displayName: string;
  summary: string;
  description: string;
  categories: string[];
  keywords: string[];
  repositoryUrl: string;
  homepageUrl: string;
  iconUrl: string;
  compatibilityApiVersion: string;
  compatibilityHosts: string[];
  submittedByName: string | null;
  reviewNote: string | null;
  pluginId: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

const statusLabels: Record<SubmissionStatus, string> = {
  pending: "待审核",
  approved: "已通过（草稿）",
  rejected: "已退回",
};

function dateText(value: string) {
  return new Date(value).toLocaleString("zh-CN");
}

export default function PluginSubmissionsPage() {
  const [status, setStatus] = useState<SubmissionStatus | "all">("pending");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [items, setItems] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Submission | null>(null);
  const [decision, setDecision] = useState<"approve" | "reject">("approve");
  const [note, setNote] = useState("");

  const load = useCallback(async (targetPage: number, targetStatus: SubmissionStatus | "all") => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ status: targetStatus, page: String(targetPage), limit: "20" });
      const response = await fetch(`/api/admin/plugin-submissions?${params}`, { cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "获取投稿失败。");
      setItems(result.data ?? []);
      setPage(result.page ?? targetPage);
      setTotal(result.total ?? 0);
      setTotalPages(result.totalPages ?? 0);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "获取投稿失败。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(1, status); }, [load, status]);

  function openReview(item: Submission, nextDecision: "approve" | "reject") {
    setSelected(item);
    setDecision(nextDecision);
    setNote("");
    setError("");
  }

  async function submitReview() {
    if (!selected || saving) return;
    if (decision === "reject" && !note.trim()) {
      setError("退回投稿时请填写原因。");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/plugin-submissions/${encodeURIComponent(selected.id)}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: note.trim() }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "审核失败。");
      setSelected(null);
      await load(page, status);
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "审核失败。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Button asChild variant="outline" size="sm"><Link href="/member/dashboard/admin/plugins"><ArrowLeft />返回插件市场</Link></Button>
          <h1 className="text-2xl font-bold tracking-tight">插件投稿审核</h1>
          <p className="text-muted-foreground">审核通过后仅生成市场草稿；请在插件市场复核并手动发布。</p>
        </div>
        <Button variant="outline" onClick={() => void load(page, status)} disabled={loading}><RefreshCw />刷新</Button>
      </div>

      <Card>
        <CardHeader><CardTitle>投稿队列</CardTitle><CardDescription>按创建时间显示，当前筛选共 {total} 条。</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-3 text-sm">状态
            <NativeSelect clearValue="all" className="h-9 rounded-md border bg-background px-3" value={status} onChange={event => setStatus(event.target.value as SubmissionStatus | "all")}>
              <option value="pending">待审核</option><option value="approved">已通过</option><option value="rejected">已退回</option><option value="all">全部</option>
            </NativeSelect>
          </label>
          {error && !selected && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          {loading ? <p className="py-8 text-center text-muted-foreground">正在加载投稿...</p> : items.length === 0 ? <p className="py-8 text-center text-muted-foreground">暂无投稿。</p> : (
            <div className="space-y-3">
              {items.map(item => (
                <article key={item.id} className="flex flex-wrap items-start justify-between gap-4 rounded-lg border p-4">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{item.displayName}</h2><Badge variant={item.status === "pending" ? "secondary" : "outline"}>{statusLabels[item.status]}</Badge></div>
                    <p className="break-all font-mono text-xs text-muted-foreground">{item.packageName}</p>
                    <p className="text-sm">{item.summary}</p>
                    <p className="text-xs text-muted-foreground">投稿人：{item.submittedByName || "已登录用户"} · {dateText(item.createdAt)}</p>
                    {item.reviewNote && <p className="text-xs text-muted-foreground">审核备注：{item.reviewNote}</p>}
                  </div>
                  <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => openReview(item, "approve")}>查看详情</Button>{item.status === "pending" && <Button size="sm" onClick={() => openReview(item, "approve")}>审核</Button>}</div>
                </article>
              ))}
            </div>
          )}
          {totalPages > 0 && <div className="flex items-center justify-between text-sm text-muted-foreground"><span>第 {page} / {totalPages} 页</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={loading || page <= 1} onClick={() => void load(page - 1, status)}>上一页</Button><Button variant="outline" size="sm" disabled={loading || page >= totalPages} onClick={() => void load(page + 1, status)}>下一页</Button></div></div>}
        </CardContent>
      </Card>

      <Dialog open={selected !== null} onOpenChange={open => { if (!open && !saving) { setSelected(null); setError(""); } }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>{selected?.displayName}</DialogTitle><DialogDescription>查看投稿资料并决定是否生成市场草稿。</DialogDescription></DialogHeader>
          {selected && <div className="space-y-4 text-sm">
            <dl className="grid gap-3 rounded-md border p-4 sm:grid-cols-2">
              <div><dt className="text-muted-foreground">npm 包</dt><dd className="break-all font-mono">{selected.packageName}</dd></div>
              <div><dt className="text-muted-foreground">状态</dt><dd>{statusLabels[selected.status]}</dd></div>
              <div className="sm:col-span-2"><dt className="text-muted-foreground">简介</dt><dd className="whitespace-pre-wrap">{selected.summary}</dd></div>
              {selected.description && <div className="sm:col-span-2"><dt className="text-muted-foreground">详细说明 · Markdown 预览</dt><dd className="mt-2 max-h-52 overflow-auto rounded-md border p-3"><MarkdownContent content={selected.description} /></dd></div>}
              <div><dt className="text-muted-foreground">分类</dt><dd>{selected.categories.join("、") || "无"}</dd></div>
              <div><dt className="text-muted-foreground">关键词</dt><dd>{selected.keywords.join("、") || "无"}</dd></div>
              <div><dt className="text-muted-foreground">兼容 API</dt><dd>{selected.compatibilityApiVersion || "未填写"}</dd></div>
              <div><dt className="text-muted-foreground">兼容 Host</dt><dd>{selected.compatibilityHosts.join("、") || "未填写"}</dd></div>
              {[selected.repositoryUrl, selected.homepageUrl, selected.iconUrl].filter(Boolean).map(url => <div key={url} className="sm:col-span-2"><a className="inline-flex max-w-full items-center gap-1 break-all text-primary underline" href={url} target="_blank" rel="noopener noreferrer">{url}<ExternalLink className="size-3 shrink-0" /></a></div>)}
            </dl>
            {selected.status === "pending" && <>
              <div className="flex gap-2"><Button type="button" size="sm" variant={decision === "approve" ? "default" : "outline"} onClick={() => setDecision("approve")}>通过为草稿</Button><Button type="button" size="sm" variant={decision === "reject" ? "destructive" : "outline"} onClick={() => setDecision("reject")}>退回</Button></div>
              <label className="grid gap-2">审核备注{decision === "reject" ? "（必填）" : "（选填）"}<textarea className="min-h-24 rounded-md border bg-background p-3" maxLength={1000} value={note} onChange={event => setNote(event.target.value)} /></label>
            </>}
            {selected.status !== "pending" && <p className="text-muted-foreground">审核备注：{selected.reviewNote || "无"}</p>}
            {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive">{error}</p>}
          </div>}
          <DialogFooter><Button variant="outline" onClick={() => setSelected(null)} disabled={saving}>关闭</Button>{selected?.status === "pending" && <Button onClick={() => void submitReview()} disabled={saving || (decision === "reject" && !note.trim())}>{saving ? "提交中..." : decision === "approve" ? "确认通过" : "确认退回"}</Button>}</DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
