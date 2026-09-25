"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ExternalLink,
  ImagePlus,
  LockKeyhole,
  Save,
  Star,
} from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProjectCoverCropDialog } from "@/components/project-cover-crop-dialog";
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
import { Label } from "@/components/ui/label";
import {
  PROJECT_COVER_MAX_BYTES,
  type CroppedProjectCover,
} from "@/lib/client/project-cover";
import {
  type AdminProject,
  type ProjectStatus,
  type PublicContactType,
  projectStageLabels,
  projectStatusLabels,
} from "../types";
import { useProjectPublishPermission } from "../project-permissions";

type ProjectForm = {
  name: string;
  slug: string;
  ownerName: string;
  summary: string;
  description: string;
  stage: string;
  focus: string;
  collaborationNeeds: string;
  demoUrl: string;
  internalContact: string;
  publicContactType: PublicContactType;
  publicContactValue: string;
  featured: boolean;
  featuredOrder: string;
};

const statusVariants: Record<ProjectStatus, BadgeProps["variant"]> = {
  draft: "secondary",
  pending_review: "outline",
  published: "default",
  unpublished: "outline",
};

function formFromProject(project: AdminProject): ProjectForm {
  return {
    name: project.name || "",
    slug: project.slug || "",
    ownerName: project.ownerName || "",
    summary: project.summary || "",
    description: project.description || "",
    stage: project.stage || "",
    focus: project.focus || "",
    collaborationNeeds: project.collaborationNeeds || "",
    demoUrl: project.demoUrl || "",
    internalContact: project.internalContact || "",
    publicContactType: project.sourceSubmissionId ? "club" : project.publicContactType || "club",
    publicContactValue: project.sourceSubmissionId ? "" : project.publicContactValue || "",
    featured: Boolean(project.featured),
    featuredOrder: project.featuredOrder ? String(project.featuredOrder) : "",
  };
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN");
}

function humanFileSize(size: number | null) {
  if (!size) return "";
  return size >= 1024 * 1024
    ? `${(size / 1024 / 1024).toFixed(1)} MB`
    : `${Math.ceil(size / 1024)} KB`;
}

export default function ProjectEditorPage() {
  const canPublish = useProjectPublishPermission();
  const params = useParams<{ id: string }>();
  const projectId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [project, setProject] = useState<AdminProject | null>(null);
  const [form, setForm] = useState<ProjectForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState("");
  const [coverCropSource, setCoverCropSource] = useState<File | null>(null);
  const [coverCropOpen, setCoverCropOpen] = useState(false);
  const [coverCompression, setCoverCompression] = useState<{
    originalSize: number;
    resultSize: number;
    width: number;
    height: number;
  } | null>(null);
  const [unpublishOpen, setUnpublishOpen] = useState(false);
  const [unpublishError, setUnpublishError] = useState("");
  const coverPreviewRef = useRef("");
  const coverInputRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement | null>(null);
  const unpublishTriggerRef = useRef<HTMLButtonElement | null>(null);
  const unpublishTitleRef = useRef<HTMLHeadingElement | null>(null);

  const loadProject = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/projects/${encodeURIComponent(projectId)}`);
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "获取项目详情失败。");
      setProject(result);
      setForm(formFromProject(result));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "获取项目详情失败。");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadProject();
    return () => {
      if (coverPreviewRef.current) URL.revokeObjectURL(coverPreviewRef.current);
    };
  }, [loadProject]);

  function setField<K extends keyof ProjectForm>(field: K, value: ProjectForm[K]) {
    setForm(current => current ? { ...current, [field]: value } : current);
    setError("");
    setSuccess("");
  }

  function reportError(message: string) {
    setError(message);
    window.requestAnimationFrame(() => {
      errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      errorRef.current?.focus({ preventScroll: true });
    });
  }

  function selectCover(file: File | undefined) {
    setError("");
    setSuccess("");
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      if (coverInputRef.current) coverInputRef.current.value = "";
      reportError("封面仅支持 JPG 或 PNG 图片。");
      return;
    }
    if (file.size > PROJECT_COVER_MAX_BYTES) {
      if (coverInputRef.current) coverInputRef.current.value = "";
      reportError("封面大小不能超过 5MB。");
      return;
    }
    setCoverCropSource(file);
    setCoverCropOpen(true);
  }

  function closeCoverCrop() {
    setCoverCropOpen(false);
    setCoverCropSource(null);
    if (coverInputRef.current) coverInputRef.current.value = "";
  }

  function applyCroppedCover(result: CroppedProjectCover) {
    if (!coverCropSource) return;
    if (coverPreviewRef.current) URL.revokeObjectURL(coverPreviewRef.current);
    const preview = URL.createObjectURL(result.file);
    coverPreviewRef.current = preview;
    setCoverPreview(preview);
    setCoverFile(result.file);
    setCoverCompression({
      originalSize: coverCropSource.size,
      resultSize: result.file.size,
      width: result.width,
      height: result.height,
    });
    setCoverCropOpen(false);
    setCoverCropSource(null);
    if (coverInputRef.current) coverInputRef.current.value = "";
  }

  function clearPendingCover() {
    if (coverPreviewRef.current) {
      URL.revokeObjectURL(coverPreviewRef.current);
      coverPreviewRef.current = "";
    }
    setCoverPreview("");
    setCoverFile(null);
    setCoverCompression(null);
    setCoverCropSource(null);
    setCoverCropOpen(false);
    if (coverInputRef.current) coverInputRef.current.value = "";
  }

  function projectPayload(currentForm: ProjectForm) {
    return {
      name: currentForm.name.trim(),
      slug: currentForm.slug.trim(),
      ownerName: currentForm.ownerName.trim(),
      summary: currentForm.summary.trim(),
      description: currentForm.description.trim(),
      stage: currentForm.stage,
      focus: currentForm.focus.trim(),
      collaborationNeeds: currentForm.collaborationNeeds.trim(),
      demoUrl: currentForm.demoUrl.trim(),
      internalContact: currentForm.internalContact.trim(),
      publicContactType: currentForm.publicContactType,
      publicContactValue: ["email", "url"].includes(currentForm.publicContactType)
        ? currentForm.publicContactValue.trim()
        : "",
      featured: currentForm.featured,
      featuredOrder: currentForm.featured
        ? Number.parseInt(currentForm.featuredOrder, 10) || null
        : null,
    };
  }

  function validateForPublish(currentForm: ProjectForm) {
    if (!currentForm.name.trim()) return "请填写项目名称。";
    if (!currentForm.summary.trim()) return "发布前请填写一句话简介。";
    if (!currentForm.description.trim()) return "发布前请填写详细介绍。";
    if (!coverFile && !project?.coverOriginalName && !project?.coverUrl) return "发布前请上传项目封面。";
    if (!["build", "pilot", "live"].includes(currentForm.stage)) return "请先选择开发中、试运行或正式上线。";
    return "";
  }

  async function saveProject(nextStatus?: "published" | "pending_review") {
    if (!form || !project) return;
    setError("");
    setSuccess("");

    if (!form.name.trim()) {
      reportError("请填写项目名称。");
      return;
    }
    if (nextStatus) {
      const validationError = validateForPublish(form);
      if (validationError) {
        reportError(validationError);
        return;
      }
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/admin/projects/${encodeURIComponent(project.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "If-Match": project.updatedAt },
        body: JSON.stringify(projectPayload(form)),
      });
      let updated = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(updated.error || "保存项目失败。");
      setProject(updated);

      if (coverFile) {
        const coverData = new FormData();
        coverData.append("cover", coverFile);
        const coverResponse = await fetch(`/api/admin/projects/${encodeURIComponent(project.id)}/cover`, {
          method: "PUT",
          headers: { "If-Match": updated.updatedAt },
          body: coverData,
        });
        const coverResult = await coverResponse.json().catch(() => ({}));
        if (!coverResponse.ok) throw new Error(coverResult.error || "项目资料已保存，但封面上传失败。");
        updated = coverResult;
        setProject(updated);
        clearPendingCover();
      }

      if (nextStatus) {
        const statusResponse = await fetch(`/api/admin/projects/${encodeURIComponent(project.id)}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "If-Match": updated.updatedAt },
          body: JSON.stringify({ status: nextStatus }),
        });
        const statusResult = await statusResponse.json().catch(() => ({}));
        if (!statusResponse.ok) throw new Error(statusResult.error || "项目资料已保存，但状态更新失败。");
        updated = statusResult;
        setProject(updated);
      }

      setProject(updated);
      setForm(formFromProject(updated));
      setSuccess(
        nextStatus === "published"
          ? "项目已发布，公开页面已即时更新。"
          : nextStatus === "pending_review"
            ? "项目已提交终审，审核通过前不会公开。"
          : project.status === "published"
            ? "项目已保存，公开页面已即时更新。"
            : "项目草稿已保存。"
      );
    } catch (saveError) {
      reportError(saveError instanceof Error ? saveError.message : "保存项目失败。");
    } finally {
      setSaving(false);
    }
  }

  async function unpublishProject() {
    if (!project) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/admin/projects/${encodeURIComponent(project.id)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "If-Match": project.updatedAt },
        body: JSON.stringify({ status: "unpublished" }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "下架项目失败。");
      setProject(result);
      setForm(current => current ? { ...current, featured: false, featuredOrder: "1" } : current);
      setUnpublishOpen(false);
      setUnpublishError("");
      setSuccess("项目已下架，并已从公开页面和首页推荐中移除。");
    } catch (statusError) {
      setUnpublishError(statusError instanceof Error ? statusError.message : "下架项目失败。");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="py-16 text-center text-sm text-muted-foreground">正在加载项目详情...</div>;
  }

  if (!project || !form) {
    return (
      <div className="space-y-4">
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error || "未找到该项目。"}
        </div>
        <Button asChild variant="outline"><Link href="/member/dashboard/admin/projects"><ArrowLeft className="h-4 w-4" />返回项目列表</Link></Button>
      </div>
    );
  }

  const imageUrl = coverPreview || project.coverUrl;
  const publicContactNeedsValue = form.publicContactType === "email" || form.publicContactType === "url";
  const canEdit = project.status !== "published" || canPublish;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Button asChild variant="ghost" size="sm" className="-ml-3">
            <Link href="/member/dashboard/admin/projects"><ArrowLeft className="h-4 w-4" />返回项目列表</Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">编辑项目</h1>
            <Badge variant={statusVariants[project.status]}>{projectStatusLabels[project.status]}</Badge>
            {project.sourceSubmissionId && <Badge variant="outline">来自资料征集</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            最近更新：{formatDate(project.updatedAt)}{project.publishedAt ? ` · 首次发布：${formatDate(project.publishedAt)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          {project.status === "published" && project.slug && (
            <Button asChild variant="outline">
              <Link href={`/projects/${encodeURIComponent(project.slug)}`} target="_blank">
                <ExternalLink className="h-4 w-4" />查看公开页
              </Link>
            </Button>
          )}
          {canEdit && <Button variant="outline" onClick={() => void saveProject()} disabled={saving}>
            <Save className="h-4 w-4" />{saving ? "保存中..." : "保存"}
          </Button>}
          {project.status === "published" ? (
            <Button variant="destructive" onClick={event => { unpublishTriggerRef.current = event.currentTarget; setUnpublishError(""); setUnpublishOpen(true); }} disabled={saving}>下架</Button>
          ) : canPublish ? (
            <Button onClick={() => void saveProject("published")} disabled={saving}>
              {saving ? "发布中..." : "保存并审核发布"}
            </Button>
          ) : project.status === "pending_review" ? (
            <span className="self-center text-sm text-muted-foreground">等待超级管理员终审</span>
          ) : (
            <Button onClick={() => void saveProject("pending_review")} disabled={saving}>
              {saving ? "提交中..." : "保存并提交终审"}
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div ref={errorRef} role="alert" tabIndex={-1} className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div role="status" className="rounded-md border border-green-600/30 bg-green-600/10 p-4 text-sm text-green-700 dark:text-green-400">
          {success}
        </div>
      )}

      <fieldset disabled={saving || !canEdit} className="contents">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>基本信息</CardTitle>
              <CardDescription>名称、简介、阶段和方向会显示在项目卡片及详情页。</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="project-name">项目名称 *</Label>
                <Input id="project-name" value={form.name} onChange={event => setField("name", event.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="project-owner">项目负责人</Label>
                <Input id="project-owner" value={form.ownerName} onChange={event => setField("ownerName", event.target.value)} placeholder="姓名 / 团队名称" />
              </div>
              <div className="grid gap-2 md:col-span-2">
                <Label htmlFor="project-slug">公开链接标识 *</Label>
                <div className="flex items-center gap-2">
                  <span className="hidden text-sm text-muted-foreground sm:inline">/projects/</span>
                  <Input
                    id="project-slug"
                    value={form.slug}
                    disabled={project.slugLocked}
                    onChange={event => setField("slug", event.target.value)}
                    aria-describedby="project-slug-help"
                  />
                </div>
                <p id="project-slug-help" className="flex items-center gap-1 text-xs text-muted-foreground">
                  {project.slugLocked ? <><LockKeyhole className="h-3 w-3" />项目首次发布后链接已锁定，避免已分享地址失效。</> : "仅使用小写字母、数字和连字符；首次发布后将锁定。"}
                </p>
              </div>
              <div className="grid gap-2 md:col-span-2">
                <Label htmlFor="project-summary">一句话简介 *</Label>
                <Input id="project-summary" value={form.summary} onChange={event => setField("summary", event.target.value)} placeholder="用一句话说清项目为谁创造什么价值" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="project-stage">项目阶段</Label>
                <select
                  id="project-stage"
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                  value={form.stage}
                  onChange={event => setField("stage", event.target.value)}
                >
                  <option value="">暂不展示</option>
                  {Object.entries(projectStageLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <p className="text-xs text-muted-foreground">对外发布须选择开发中、试运行或正式上线；构想验证仅用于草稿。</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="project-focus">AI 技术 / 应用方向</Label>
                <Input id="project-focus" value={form.focus} onChange={event => setField("focus", event.target.value)} placeholder="例如：智能体、视觉识别、AI+文旅" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>项目内容</CardTitle>
              <CardDescription>详细介绍为发布必填项；合作需求和演示链接可选。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="project-description">详细介绍 *</Label>
                <textarea id="project-description" className="min-h-48 rounded-md border bg-background px-3 py-2 text-sm" value={form.description} onChange={event => setField("description", event.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="project-needs">期望对接 / 合作方向</Label>
                <textarea id="project-needs" className="min-h-28 rounded-md border bg-background px-3 py-2 text-sm" value={form.collaborationNeeds} onChange={event => setField("collaborationNeeds", event.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="project-demo-url">官网 / 演示链接</Label>
                <Input id="project-demo-url" type="url" value={form.demoUrl} onChange={event => setField("demoUrl", event.target.value)} placeholder="https://" />
                <p className="text-xs text-muted-foreground">公开链接仅支持 HTTPS。</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>联系信息</CardTitle>
              <CardDescription>内部联系方式仅供管理员对接，绝不会由公开接口返回。</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2 md:col-span-2">
                <Label htmlFor="project-internal-contact">内部联系方式</Label>
                <Input id="project-internal-contact" value={form.internalContact} onChange={event => setField("internalContact", event.target.value)} placeholder="手机号、微信或内部备注" />
                <p className="text-xs text-muted-foreground">从资料征集导入的手机号或微信仅保存在这里。</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="public-contact-type">公开联系入口</Label>
                <select
                  id="public-contact-type"
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                  value={form.publicContactType}
                  onChange={event => setField("publicContactType", event.target.value as PublicContactType)}
                  disabled={Boolean(project.sourceSubmissionId)}
                >
                  <option value="club">联系俱乐部</option>
                  <option value="email">公开邮箱</option>
                  <option value="url">HTTPS 联系链接</option>
                  <option value="none">不展示</option>
                </select>
                {project.sourceSubmissionId && <p className="text-xs text-muted-foreground">会员提交项目统一由俱乐部对接，不公开提交人的联系方式。</p>}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="public-contact-value">公开联系内容{publicContactNeedsValue ? " *" : ""}</Label>
                <Input
                  id="public-contact-value"
                  type={form.publicContactType === "email" ? "email" : form.publicContactType === "url" ? "url" : "text"}
                  value={form.publicContactValue}
                  onChange={event => setField("publicContactValue", event.target.value)}
                  disabled={!publicContactNeedsValue}
                  placeholder={form.publicContactType === "email" ? "name@example.com" : form.publicContactType === "url" ? "https://" : "无需填写"}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ImagePlus className="h-4 w-4" />项目封面 *</CardTitle>
              <CardDescription>支持 JPG / PNG，原图最大 5MB。上传前会按 16:10 裁剪并压缩为 JPEG。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                className="flex aspect-[8/5] items-center justify-center overflow-hidden rounded-lg border bg-muted/40 bg-cover bg-center"
                style={imageUrl ? { backgroundImage: `url(${JSON.stringify(imageUrl).slice(1, -1)})` } : undefined}
                role="img"
                aria-label={imageUrl ? `${form.name}项目封面预览` : "尚未上传项目封面"}
              >
                {!imageUrl && <div className="text-center text-sm text-muted-foreground"><ImagePlus className="mx-auto mb-2 h-8 w-8" />尚未上传封面</div>}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="project-cover">{project.coverOriginalName || coverFile ? "重新选择并裁剪" : "选择图片并裁剪"}</Label>
                <Input
                  ref={coverInputRef}
                  id="project-cover"
                  type="file"
                  accept="image/jpeg,image/png"
                  disabled={saving}
                  onChange={event => selectCover(event.target.files?.[0])}
                />
              </div>
              {coverFile && coverCompression ? (
                <p className="break-all text-xs text-muted-foreground">
                  原图 {humanFileSize(coverCompression.originalSize)}
                  {` → 裁剪压缩后 ${humanFileSize(coverCompression.resultSize)}`}
                  {` · JPEG ${coverCompression.width} × ${coverCompression.height}`}
                </p>
              ) : project.coverOriginalName ? (
                <p className="break-all text-xs text-muted-foreground">
                  {project.coverOriginalName}
                  {` · ${humanFileSize(project.coverSize)}`}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Star className="h-4 w-4" />首页推荐</CardTitle>
              <CardDescription>首页最多推荐 6 个已发布项目，按推荐顺序从小到大展示。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border"
                  checked={form.featured}
                  onChange={event => setField("featured", event.target.checked)}
                />
                <span><strong className="block font-medium">推荐到官网首页</strong><span className="text-muted-foreground">第 7 个推荐会被服务端阻止并提示调整。</span></span>
              </label>
              <div className="grid gap-2">
                <Label htmlFor="featured-order">推荐顺序</Label>
                <Input
                  id="featured-order"
                  type="number"
                  min={1}
                  max={6}
                  step={1}
                  value={form.featuredOrder}
                  disabled={!form.featured}
                  placeholder="留空则自动选择空位"
                  onChange={event => setField("featuredOrder", event.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>发布信息</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between gap-4"><span className="text-muted-foreground">当前状态</span><Badge variant={statusVariants[project.status]}>{projectStatusLabels[project.status]}</Badge></div>
              <div className="flex justify-between gap-4"><span className="text-muted-foreground">创建时间</span><span className="text-right">{formatDate(project.createdAt)}</span></div>
              <div className="flex justify-between gap-4"><span className="text-muted-foreground">发布时间</span><span className="text-right">{formatDate(project.publishedAt)}</span></div>
              <div className="flex justify-between gap-4"><span className="text-muted-foreground">终审时间</span><span className="text-right">{formatDate(project.reviewedAt)}</span></div>
              {project.reviewedBy && <div className="flex justify-between gap-4"><span className="text-muted-foreground">终审人 ID</span><span className="text-right break-all">{project.reviewedBy}</span></div>}
            </CardContent>
          </Card>
        </div>
      </div>
      </fieldset>

      <div className="sticky bottom-4 flex flex-wrap justify-end gap-2 rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur">
        <Button variant="outline" onClick={() => void saveProject()} disabled={saving || !canEdit}>
          <Save className="h-4 w-4" />{saving ? "保存中..." : "保存项目"}
        </Button>
        {project.status === "published" ? (
          <Button variant="destructive" onClick={event => { unpublishTriggerRef.current = event.currentTarget; setUnpublishError(""); setUnpublishOpen(true); }} disabled={saving}>下架项目</Button>
        ) : canPublish ? (
          <Button onClick={() => void saveProject("published")} disabled={saving}>{saving ? "发布中..." : "保存并审核发布"}</Button>
        ) : project.status === "pending_review" ? (
          <span className="self-center text-sm text-muted-foreground">等待超级管理员终审</span>
        ) : (
          <Button onClick={() => void saveProject("pending_review")} disabled={saving}>{saving ? "提交中..." : "保存并提交终审"}</Button>
        )}
      </div>

      <Dialog open={unpublishOpen} onOpenChange={open => { if (!saving) { setUnpublishOpen(open); if (!open) setUnpublishError(""); } }}>
        <DialogContent
          onOpenAutoFocus={event => { event.preventDefault(); unpublishTitleRef.current?.focus(); }}
          onCloseAutoFocus={event => { event.preventDefault(); unpublishTriggerRef.current?.focus(); }}
        >
          <DialogHeader>
            <DialogTitle ref={unpublishTitleRef} tabIndex={-1}>确认下架项目</DialogTitle>
            <DialogDescription>
              下架“{project.name}”后，它会立即从官网首页、项目广场和公开详情页消失。项目资料仍会保留，可再次编辑和发布。
            </DialogDescription>
          </DialogHeader>
          {unpublishError && <p role="alert" className="text-sm text-destructive">{unpublishError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setUnpublishOpen(false); setUnpublishError(""); }} disabled={saving}>取消</Button>
            <Button variant="destructive" onClick={() => void unpublishProject()} disabled={saving}>{saving ? "下架中..." : "确认下架"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProjectCoverCropDialog
        open={coverCropOpen}
        file={coverCropSource}
        returnFocusRef={coverInputRef}
        onOpenChange={open => {
          if (!open) closeCoverCrop();
        }}
        onConfirm={applyCroppedCover}
      />
    </div>
  );
}
