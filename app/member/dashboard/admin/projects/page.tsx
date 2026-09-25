"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FileImage,
  FolderKanban,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Star,
} from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  type AdminProject,
  type ProjectStatus,
  projectStageLabels,
  projectStatusLabels,
} from "./types";
import { useProjectPublishPermission } from "./project-permissions";

type Filters = {
  status: string;
  featured: string;
  search: string;
};

const emptyFilters: Filters = { status: "", featured: "", search: "" };

const statusVariants: Record<ProjectStatus, BadgeProps["variant"]> = {
  draft: "secondary",
  pending_review: "outline",
  published: "default",
  unpublished: "outline",
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN");
}

export default function ProjectAdminPage() {
  const router = useRouter();
  const canPublish = useProjectPublishPermission();
  const [draftFilters, setDraftFilters] = useState<Filters>(emptyFilters);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [items, setItems] = useState<AdminProject[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const statusBusyRef = useRef(false);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);
  const latestRequest = useRef(0);
  const [newProjectName, setNewProjectName] = useState("");
  const [createError, setCreateError] = useState("");
  const [unpublishTarget, setUnpublishTarget] = useState<AdminProject | null>(null);
  const [unpublishError, setUnpublishError] = useState("");
  const createTriggerRef = useRef<HTMLButtonElement | null>(null);
  const unpublishTriggerRef = useRef<HTMLButtonElement | null>(null);
  const unpublishTitleRef = useRef<HTMLHeadingElement | null>(null);
  const errorRef = useRef<HTMLDivElement | null>(null);

  const loadProjects = useCallback(async (
    targetPage = 1,
    activeFilters: Filters = emptyFilters
  ) => {
    const requestId = ++latestRequest.current;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: String(targetPage), limit: "20" });
    if (activeFilters.status) params.set("status", activeFilters.status);
    if (activeFilters.featured) params.set("featured", activeFilters.featured);
    if (activeFilters.search.trim()) params.set("search", activeFilters.search.trim());

    try {
      const response = await fetch(`/api/admin/projects?${params.toString()}`);
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "获取项目列表失败。");
      if (requestId !== latestRequest.current) return;
      setItems(Array.isArray(result.data) ? result.data : []);
      setTotal(typeof result.total === "number" ? result.total : 0);
      setPage(typeof result.page === "number" ? result.page : targetPage);
      setTotalPages(typeof result.totalPages === "number" ? result.totalPages : 0);
    } catch (loadError) {
      if (requestId !== latestRequest.current) return;
      setError(loadError instanceof Error ? loadError.message : "获取项目列表失败。");
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProjects(1, emptyFilters);
  }, [loadProjects]);

  function openCreateDialog() {
    setNewProjectName("");
    setCreateError("");
    setCreateOpen(true);
  }

  async function createProject() {
    if (creatingRef.current) return;
    const name = newProjectName.trim();
    if (!name) {
      setCreateError("请输入项目名称。");
      return;
    }

    creatingRef.current = true;
    setCreating(true);
    setCreateError("");
    try {
      const response = await fetch("/api/admin/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "创建项目失败。");
      if (!result.id) throw new Error("项目已创建，但接口没有返回项目编号。");
      setCreateOpen(false);
      router.push(`/member/dashboard/admin/projects/${encodeURIComponent(result.id)}`);
    } catch (createProjectError) {
      setCreateError(createProjectError instanceof Error ? createProjectError.message : "创建项目失败。");
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  }

  async function updateStatus(project: AdminProject, status: ProjectStatus) {
    if (statusBusyRef.current) return;
    statusBusyRef.current = true;
    setBusyId(project.id);
    setError("");
    try {
      const response = await fetch(`/api/admin/projects/${encodeURIComponent(project.id)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "If-Match": project.updatedAt },
        body: JSON.stringify({ status }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "更新项目状态失败。");
      if (status === "unpublished") {
        setUnpublishTarget(null);
        setUnpublishError("");
      }
      await loadProjects(page, filters);
    } catch (statusError) {
      const message = statusError instanceof Error ? statusError.message : "更新项目状态失败。";
      if (status === "unpublished" && unpublishTarget?.id === project.id) setUnpublishError(message);
      else {
        setError(message);
        window.requestAnimationFrame(() => {
          errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
          errorRef.current?.focus({ preventScroll: true });
        });
      }
    } finally {
      statusBusyRef.current = false;
      setBusyId("");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">项目广场</h1>
          <p className="text-muted-foreground">维护项目内容、公开状态与官网首页推荐顺序。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => void loadProjects(page, filters)}
            disabled={loading}
          >
            <RefreshCw className="h-4 w-4" />刷新
          </Button>
          <Button ref={createTriggerRef} onClick={openCreateDialog}>
            <Plus className="h-4 w-4" />新增项目
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-4 w-4" />筛选项目
          </CardTitle>
          <CardDescription>草稿与已下架项目不会出现在公开项目广场。</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-[160px_180px_minmax(180px,1fr)_auto_auto] md:items-end">
            <label className="grid gap-2 text-sm">
              <span className="text-muted-foreground">状态</span>
              <select
                className="h-9 rounded-md border bg-background px-3"
                value={draftFilters.status}
                onChange={event => setDraftFilters({ ...draftFilters, status: event.target.value })}
              >
                <option value="">全部状态</option>
                <option value="draft">草稿</option>
                <option value="pending_review">待终审</option>
                <option value="published">已发布</option>
                <option value="unpublished">已下架</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm">
              <span className="text-muted-foreground">首页推荐</span>
              <select
                className="h-9 rounded-md border bg-background px-3"
                value={draftFilters.featured}
                onChange={event => setDraftFilters({ ...draftFilters, featured: event.target.value })}
              >
                <option value="">全部项目</option>
                <option value="true">仅推荐项目</option>
                <option value="false">仅非推荐项目</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm">
              <span className="text-muted-foreground">关键词</span>
              <Input
                placeholder="项目名称、负责人、简介或方向"
                value={draftFilters.search}
                onChange={event => setDraftFilters({ ...draftFilters, search: event.target.value })}
                onKeyDown={event => {
                  if (event.key === "Enter") {
                    setFilters(draftFilters);
                    void loadProjects(1, draftFilters);
                  }
                }}
              />
            </label>
            <Button onClick={() => {
              setFilters(draftFilters);
              void loadProjects(1, draftFilters);
            }}>搜索</Button>
            <Button variant="ghost" onClick={() => {
              setDraftFilters(emptyFilters);
              setFilters(emptyFilters);
              void loadProjects(1, emptyFilters);
            }}>重置</Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div ref={errorRef} role="alert" tabIndex={-1} className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>项目记录</CardTitle>
            <CardDescription>共 {total} 个项目，首页最多推荐 6 个。</CardDescription>
          </div>
          <FolderKanban className="h-5 w-5 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th scope="col" className="p-3">项目</th>
                  <th scope="col" className="p-3">阶段 / 方向</th>
                  <th scope="col" className="p-3">首页推荐</th>
                  <th scope="col" className="p-3">状态</th>
                  <th scope="col" className="p-3">更新时间</th>
                  <th scope="col" className="p-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">正在加载项目...</td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">暂无符合条件的项目。</td></tr>
                ) : items.map(project => (
                  <tr key={project.id} className="border-t align-top hover:bg-muted/30">
                    <td className="p-3">
                      <div className="flex gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-muted/40">
                          <FileImage className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        </div>
                        <div>
                          <div className="font-medium">{project.name}</div>
                          <div className="max-w-[360px] text-xs text-muted-foreground">{project.summary || "尚未填写项目简介"}</div>
                          <div className="mt-1 font-mono text-[11px] text-muted-foreground">/{project.slug}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      <div>{projectStageLabels[project.stage] || project.stage || "-"}</div>
                      <div className="text-xs text-muted-foreground">{project.focus || "未填写方向"}</div>
                    </td>
                    <td className="p-3">
                      {project.featured ? (
                        <Badge variant="outline" className="gap-1">
                          <Star className="h-3 w-3 fill-current" />第 {project.featuredOrder} 位
                        </Badge>
                      ) : <span className="text-muted-foreground">-</span>}
                    </td>
                    <td className="p-3">
                      <Badge variant={statusVariants[project.status]}>
                        {projectStatusLabels[project.status]}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap p-3 text-muted-foreground">{formatDate(project.updatedAt)}</td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/member/dashboard/admin/projects/${encodeURIComponent(project.id)}`}>
                            <Pencil className="h-3.5 w-3.5" />编辑
                          </Link>
                        </Button>
                        {project.status === "published" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={Boolean(busyId)}
                            onClick={event => {
                              unpublishTriggerRef.current = event.currentTarget;
                              setUnpublishError("");
                              setUnpublishTarget(project);
                            }}
                          >下架</Button>
                        ) : canPublish ? (
                          <Button asChild size="sm">
                            <Link href={`/member/dashboard/admin/projects/${encodeURIComponent(project.id)}`}>
                              查看并终审
                            </Link>
                          </Button>
                        ) : project.status === "pending_review" ? (
                          <span className="self-center text-xs text-muted-foreground">等待超级管理员终审</span>
                        ) : (
                          <Button
                            size="sm"
                            disabled={Boolean(busyId)}
                            onClick={() => void updateStatus(project, "pending_review")}
                          >{busyId === project.id ? "提交中..." : "提交终审"}</Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>第 {page} / {totalPages} 页</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => void loadProjects(page - 1, filters)}>上一页</Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => void loadProjects(page + 1, filters)}>下一页</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={open => { if (!creating) setCreateOpen(open); }}>
        <DialogContent onCloseAutoFocus={event => { event.preventDefault(); createTriggerRef.current?.focus(); }}>
          <DialogHeader>
            <DialogTitle>新增项目</DialogTitle>
            <DialogDescription>先创建一条草稿，再进入独立编辑页补充内容和封面。</DialogDescription>
          </DialogHeader>
          <label className="grid gap-2 text-sm" htmlFor="new-project-name">
            <span>项目名称 *</span>
            <Input
              id="new-project-name"
              autoFocus
              disabled={creating}
              value={newProjectName}
              onChange={event => {
                setNewProjectName(event.target.value);
                setCreateError("");
              }}
              onKeyDown={event => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void createProject();
                }
              }}
              placeholder="请输入项目名称"
            />
          </label>
          {createError && <p role="alert" className="text-sm text-destructive">{createError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>取消</Button>
            <Button onClick={() => void createProject()} disabled={creating}>
              {creating ? "创建中..." : "创建并编辑"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(unpublishTarget)} onOpenChange={open => { if (!open && !busyId) { setUnpublishTarget(null); setUnpublishError(""); } }}>
        <DialogContent
          onOpenAutoFocus={event => { event.preventDefault(); unpublishTitleRef.current?.focus(); }}
          onCloseAutoFocus={event => { event.preventDefault(); unpublishTriggerRef.current?.focus(); }}
        >
          <DialogHeader>
            <DialogTitle ref={unpublishTitleRef} tabIndex={-1}>确认下架项目</DialogTitle>
            <DialogDescription>
              下架“{unpublishTarget?.name}”后，它会立即从官网首页、项目广场和公开详情页消失。项目资料仍会保留，可再次编辑和发布。
            </DialogDescription>
          </DialogHeader>
          {unpublishError && <p role="alert" className="text-sm text-destructive">{unpublishError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setUnpublishTarget(null); setUnpublishError(""); }} disabled={Boolean(busyId)}>取消</Button>
            <Button
              variant="destructive"
              disabled={!unpublishTarget || Boolean(busyId)}
              onClick={() => {
                if (unpublishTarget) void updateStatus(unpublishTarget, "unpublished");
              }}
            >{busyId ? "下架中..." : "确认下架"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
