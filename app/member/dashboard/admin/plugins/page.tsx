"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Package, Pencil, Plus, RefreshCw, Search, Store } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type PluginStatus = "draft" | "published" | "unpublished";

type PluginRecord = {
  id: string;
  status: PluginStatus;
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
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
};

type PluginForm = Omit<PluginRecord, "id" | "status" | "createdAt" | "updatedAt" | "publishedAt" | "categories" | "keywords" | "compatibilityHosts"> & {
  categories: string;
  keywords: string;
  compatibilityHosts: string;
};

type Filters = { status: string; search: string };
const emptyFilters: Filters = { status: "", search: "" };
const statusLabels: Record<PluginStatus, string> = { draft: "草稿", published: "已发布", unpublished: "已下架" };
const statusVariants: Record<PluginStatus, BadgeProps["variant"]> = { draft: "secondary", published: "default", unpublished: "outline" };

const emptyForm: PluginForm = {
  packageName: "",
  displayName: "",
  summary: "",
  description: "",
  categories: "",
  keywords: "",
  repositoryUrl: "",
  homepageUrl: "",
  iconUrl: "",
  compatibilityApiVersion: "",
  compatibilityHosts: "",
};

function pluginJsonPrompt(repositoryUrl: string) {
  const address = repositoryUrl.trim() || "请替换为公开 GitHub 插件仓库地址";
  return `你是 DSH/CQAI 插件市场元数据整理助手。请访问并分析下面的公开 GitHub 仓库，生成一个可直接导入 CQAI 插件市场的 JSON 对象。

仓库地址：${address}

要求：
1. 只输出一个合法 JSON 对象，不要 Markdown 代码围栏、解释文字或多个对象。
2. 确认根目录 package.json 存在，并且包含 dsh.bundle.patch；如果不是 DSH 插件，不要编造信息。
3. 准确读取 npm 包名、插件名称、简介、README 说明、分类、关键词、仓库地址、主页、图标和兼容信息。
4. packageName 必须是有效 npm 包名；URL 必须使用 HTTPS；分类使用小写 ID。
5. JSON 尽量使用以下字段：packageName、displayName、summary、description、categories、keywords、repositoryUrl、homepageUrl、iconUrl、compatibilityApiVersion、compatibilityHosts。
6. summary 不超过 1000 个字符，description 不超过 5000 个字符；categories、keywords、compatibilityHosts 使用字符串数组。

请返回类似下面的结构：
{
  "packageName": "example-package",
  "displayName": "Example Plugin",
  "summary": "一句话简介",
  "description": "详细说明",
  "categories": ["productivity"],
  "keywords": ["dsh", "cqai"],
  "repositoryUrl": "${address}",
  "homepageUrl": "https://example.com",
  "iconUrl": "https://example.com/icon.png",
  "compatibilityApiVersion": "1.0.0",
  "compatibilityHosts": ["dsh-desktop"]
}`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN");
}

function listInput(value: string) {
  return [...new Set(value.split(/[,，\n]/).map(item => item.trim()).filter(Boolean))];
}

function formFromPlugin(plugin: PluginRecord): PluginForm {
  return {
    packageName: plugin.packageName,
    displayName: plugin.displayName,
    summary: plugin.summary,
    description: plugin.description,
    categories: plugin.categories.join(", "),
    keywords: plugin.keywords.join(", "),
    repositoryUrl: plugin.repositoryUrl,
    homepageUrl: plugin.homepageUrl,
    iconUrl: plugin.iconUrl,
    compatibilityApiVersion: plugin.compatibilityApiVersion,
    compatibilityHosts: plugin.compatibilityHosts.join(", "),
  };
}

function payloadFromForm(form: PluginForm) {
  return {
    packageName: form.packageName.trim(),
    displayName: form.displayName.trim(),
    summary: form.summary.trim(),
    description: form.description.trim(),
    categories: listInput(form.categories),
    keywords: listInput(form.keywords),
    repositoryUrl: form.repositoryUrl.trim(),
    homepageUrl: form.homepageUrl.trim(),
    iconUrl: form.iconUrl.trim(),
    compatibilityApiVersion: form.compatibilityApiVersion.trim(),
    compatibilityHosts: listInput(form.compatibilityHosts),
  };
}

type JsonObject = Record<string, unknown>;

function asJsonObject(value: unknown): JsonObject | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as JsonObject : null;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function stringList(value: unknown) {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string").flatMap(item => listInput(item));
  return typeof value === "string" ? listInput(value) : [];
}

function normalizeJsonPlugin(value: unknown): PluginForm {
  const root = asJsonObject(value);
  if (!root) throw new Error("JSON 必须是一个对象。");

  const rawItems = root.items;
  if (Array.isArray(rawItems) && rawItems.length !== 1) {
    throw new Error("请粘贴单个插件 JSON，不要粘贴包含多个插件的目录响应。");
  }
  const source = (Array.isArray(rawItems) ? asJsonObject(rawItems[0]) : null) ?? asJsonObject(root.item) ?? asJsonObject(root.plugin) ?? root;
  if (!source) throw new Error("没有找到有效的插件对象。");

  const packageInfo = asJsonObject(source.package);
  const repository = asJsonObject(source.repository);
  const media = asJsonObject(source.media);
  const mediaIcon = asJsonObject(media?.icon);
  const compatibility = asJsonObject(source.compatibility);
  const packageName = firstString(source.packageName, source.package, packageInfo?.name, source.name);
  const displayName = firstString(source.displayName, source.name, packageInfo?.displayName, packageName);
  const summary = firstString(source.summary, source.description);
  const description = firstString(source.description, source.summary);
  const categories = stringList(source.categories ?? source.category);
  const keywords = stringList(source.keywords ?? source.tags);
  const repositoryUrl = firstString(source.repositoryUrl, repository?.url);
  const homepageUrl = firstString(source.homepageUrl, source.homepage, packageInfo?.homepage);
  const iconUrl = firstString(source.iconUrl, mediaIcon?.url, media?.icon);
  const compatibilityApiVersion = firstString(source.compatibilityApiVersion, compatibility?.apiVersion, compatibility?.api_version);
  const compatibilityHosts = stringList(source.compatibilityHosts ?? compatibility?.hosts);

  if (!packageName || !displayName || !summary) {
    throw new Error("JSON 至少需要 packageName（或 package.name）、displayName（或 name）和 summary（或 description）。");
  }

  return {
    packageName,
    displayName,
    summary,
    description,
    categories: categories.join(", "),
    keywords: keywords.join(", "),
    repositoryUrl,
    homepageUrl,
    iconUrl,
    compatibilityApiVersion,
    compatibilityHosts: compatibilityHosts.join(", "),
  };
}

export default function PluginMarketAdminPage() {
  const [draftFilters, setDraftFilters] = useState<Filters>(emptyFilters);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [items, setItems] = useState<PluginRecord[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<PluginRecord | null | undefined>(undefined);
  const [form, setForm] = useState<PluginForm>(emptyForm);
  const [sourceUrl, setSourceUrl] = useState("/catalog-source.json");
  const [jsonMode, setJsonMode] = useState(false);
  const [promptMode, setPromptMode] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [promptRepositoryUrl, setPromptRepositoryUrl] = useState("");
  const [promptCopyMessage, setPromptCopyMessage] = useState("");

  const loadPlugins = useCallback(async (targetPage = 1, activeFilters = filters) => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: String(targetPage), limit: "20" });
    if (activeFilters.status) params.set("status", activeFilters.status);
    if (activeFilters.search.trim()) params.set("search", activeFilters.search.trim());
    try {
      const response = await fetch(`/api/admin/plugins?${params.toString()}`);
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "获取插件列表失败。");
      setItems(result.data || []);
      setTotal(result.total || 0);
      setPage(result.page || targetPage);
      setTotalPages(result.totalPages || 0);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "获取插件列表失败。");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void loadPlugins(1, filters);
  }, [filters, loadPlugins]);

  useEffect(() => {
    setSourceUrl(`${window.location.origin}/catalog-source.json`);
  }, []);

  function openCreate() {
    setEditor(null);
    setForm(emptyForm);
    setError("");
    setJsonMode(false);
    setPromptMode(false);
    setJsonText("");
    setJsonError("");
    setCopyMessage("");
    setPromptRepositoryUrl("");
  }

  function openEdit(plugin: PluginRecord) {
    setEditor(plugin);
    setForm(formFromPlugin(plugin));
    setError("");
    setJsonMode(false);
    setPromptMode(false);
    setJsonText("");
    setJsonError("");
    setCopyMessage("");
    setPromptRepositoryUrl("");
  }

  async function copyJson(value: unknown) {
    try {
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(typeof value === "string" ? value : JSON.stringify(value, null, 2));
      setCopyMessage("JSON 已复制。");
    } catch {
      setCopyMessage("复制失败，请检查浏览器剪贴板权限。");
    }
  }

  async function copyPrompt() {
    try {
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(pluginJsonPrompt(promptRepositoryUrl));
      setPromptCopyMessage("提示词已复制。");
    } catch {
      setPromptCopyMessage("复制失败，请检查浏览器剪贴板权限。");
    }
  }

  async function saveJsonPlugin() {
    setSaving(true);
    setError("");
    setJsonError("");
    try {
      let importedForm: PluginForm;
      try {
        importedForm = normalizeJsonPlugin(JSON.parse(jsonText));
      } catch (parseError) {
        throw new Error(parseError instanceof Error ? parseError.message : "JSON 格式无效。");
      }

      const response = await fetch("/api/admin/plugins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadFromForm(importedForm)),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "JSON 插件添加失败。");
      setEditor(undefined);
      setJsonText("");
      await loadPlugins(page, filters);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "JSON 插件添加失败。";
      setJsonError(message);
    } finally {
      setSaving(false);
    }
  }

  async function savePlugin() {
    setSaving(true);
    setError("");
    const isEditing = editor !== null && editor !== undefined;
    const url = isEditing ? `/api/admin/plugins/${encodeURIComponent(editor.id)}` : "/api/admin/plugins";
    try {
      const response = await fetch(url, {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadFromForm(form)),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "保存插件失败。");
      setEditor(undefined);
      await loadPlugins(page, filters);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存插件失败。");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(plugin: PluginRecord) {
    const nextStatus: PluginStatus = plugin.status === "published" ? "unpublished" : "published";
    if (nextStatus === "unpublished" && !window.confirm(`确定下架“${plugin.displayName}”吗？`)) return;
    const response = await fetch(`/api/admin/plugins/${encodeURIComponent(plugin.id)}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(result.error || "更新插件状态失败。");
      return;
    }
    await loadPlugins(page, filters);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">插件市场</h1>
          <p className="text-muted-foreground">维护 DSH Desktop 可读取的 CQAI 官方插件目录。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void loadPlugins(page)} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" />刷新</Button>
          <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />新增插件</Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Store className="h-4 w-4" />目录来源</CardTitle>
          <CardDescription>在 DSH Desktop 的 CQAI 市场中添加以下地址：</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/30 p-3 text-sm">
            <code className="break-all">{sourceUrl}</code>
            <a href="/catalog-source.json" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline"><ExternalLink className="h-3.5 w-3.5" />查看</a>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Search className="h-4 w-4" />筛选插件</CardTitle>
          <CardDescription>草稿和已下架插件不会出现在公开目录中。</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-[180px_minmax(180px,1fr)_auto_auto] md:items-end">
            <label className="grid gap-2 text-sm"><span className="text-muted-foreground">状态</span><select className="h-10 rounded-md border bg-background px-3" value={draftFilters.status} onChange={event => setDraftFilters({ ...draftFilters, status: event.target.value })}><option value="">全部状态</option><option value="draft">草稿</option><option value="published">已发布</option><option value="unpublished">已下架</option></select></label>
            <label className="grid gap-2 text-sm"><span className="text-muted-foreground">关键词</span><Input placeholder="包名、名称或简介" value={draftFilters.search} onChange={event => setDraftFilters({ ...draftFilters, search: event.target.value })} /></label>
            <Button onClick={() => { setFilters(draftFilters); void loadPlugins(1, draftFilters); }}>搜索</Button>
            <Button variant="ghost" onClick={() => { setDraftFilters(emptyFilters); setFilters(emptyFilters); void loadPlugins(1, emptyFilters); }}>重置</Button>
          </div>
        </CardContent>
      </Card>

      {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>}

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0"><div><CardTitle>插件记录</CardTitle><CardDescription>共 {total} 个插件</CardDescription></div><Package className="h-5 w-5 text-muted-foreground" /></CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead className="bg-muted/50 text-muted-foreground"><tr><th className="p-3">插件</th><th className="p-3">npm 包</th><th className="p-3">分类</th><th className="p-3">状态</th><th className="p-3">更新时间</th><th className="p-3">操作</th></tr></thead>
              <tbody>
                {loading ? <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">正在加载插件...</td></tr> : items.length === 0 ? <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">暂无插件记录。</td></tr> : items.map(plugin => (
                  <tr key={plugin.id} className="border-t align-top hover:bg-muted/30">
                    <td className="p-3"><div className="font-medium">{plugin.displayName}</div><div className="max-w-[360px] text-xs text-muted-foreground">{plugin.summary}</div></td>
                    <td className="p-3 font-mono text-xs">{plugin.packageName}</td>
                    <td className="p-3"><div className="flex max-w-[180px] flex-wrap gap-1">{plugin.categories.length ? plugin.categories.map(category => <Badge key={category} variant="outline">{category}</Badge>) : <span className="text-muted-foreground">-</span>}</div></td>
                    <td className="p-3"><Badge variant={statusVariants[plugin.status]}>{statusLabels[plugin.status]}</Badge></td>
                    <td className="whitespace-nowrap p-3 text-muted-foreground">{formatDate(plugin.updatedAt)}</td>
                    <td className="p-3"><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => openEdit(plugin)}><Pencil className="mr-1 h-3.5 w-3.5" />编辑</Button><Button variant={plugin.status === "published" ? "outline" : "default"} size="sm" onClick={() => void updateStatus(plugin)}>{plugin.status === "published" ? "下架" : "发布"}</Button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 0 && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground"><span>第 {page} / {totalPages} 页</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => void loadPlugins(page - 1)}>上一页</Button><Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => void loadPlugins(page + 1)}>下一页</Button></div></div>}
        </CardContent>
      </Card>

      <Dialog open={editor !== undefined} onOpenChange={open => { if (!open) setEditor(undefined); }}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader><DialogTitle>{editor ? "编辑插件" : "新增插件"}</DialogTitle><DialogDescription>字段会按 DSH Community Market 目录协议公开，保存后默认为草稿。</DialogDescription></DialogHeader>
          {!editor && <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-3 text-sm"><span className="text-muted-foreground">添加方式：</span><Button type="button" size="sm" variant={!jsonMode && !promptMode ? "secondary" : "outline"} onClick={() => { setJsonMode(false); setPromptMode(false); setJsonError(""); }}>填写表单</Button><Button type="button" size="sm" variant={jsonMode ? "secondary" : "outline"} onClick={() => { setJsonMode(true); setPromptMode(false); setJsonError(""); }}>JSON 快速添加</Button><Button type="button" size="sm" variant={promptMode ? "secondary" : "outline"} onClick={() => { setJsonMode(false); setPromptMode(true); setJsonError(""); }}>AI 生成插件 JSON</Button><span className="text-xs text-muted-foreground">先复制提示词到外部 AI，再回来粘贴 JSON。</span></div>}
          {promptMode && !editor ? <div className="w-full space-y-3"><label className="grid gap-2 text-sm"><span>仓库地址（会自动替换到提示词中）</span><Input value={promptRepositoryUrl} onChange={event => { setPromptRepositoryUrl(event.target.value); setPromptCopyMessage(""); }} placeholder="https://github.com/owner/plugin" /></label><textarea readOnly className="min-h-56 w-full rounded-md border bg-background px-3 py-2 text-xs leading-5" value={pluginJsonPrompt(promptRepositoryUrl)} /><div className="flex flex-wrap items-center gap-2"><Button type="button" variant="outline" onClick={() => void copyPrompt()}>复制提示词</Button><span className="text-xs text-muted-foreground">{promptCopyMessage} 复制后到外部 AI 生成 JSON，再点击上方“JSON 快速添加”。</span></div></div> : jsonMode && !editor ? <div className="space-y-3"><label className="grid gap-2 text-sm"><span>插件 JSON *</span><textarea className="min-h-72 rounded-md border bg-background px-3 py-2 font-mono text-xs" value={jsonText} onChange={event => { setJsonText(event.target.value); setJsonError(""); }} placeholder={'粘贴单个插件 JSON，例如：\n{\n  "packageName": "dsh-plugin-example",\n  "displayName": "Example Plugin",\n  "summary": "插件简介",\n  "categories": ["productivity"]\n}'} /></label><p className="text-xs text-muted-foreground">提交前会校验 JSON、必填字段、npm 包名、分类、URL 和字段长度；不符合规则的内容不会创建。</p>{jsonError && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{jsonError}</div>}</div> : <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm"><span>npm 包名 *</span><Input value={form.packageName} onChange={event => setForm({ ...form, packageName: event.target.value })} placeholder="dsh-plugin-example" /></label>
            <label className="grid gap-2 text-sm"><span>展示名称 *</span><Input value={form.displayName} onChange={event => setForm({ ...form, displayName: event.target.value })} placeholder="Example Plugin" /></label>
            <label className="grid gap-2 text-sm md:col-span-2"><span>一句话简介 *</span><Input value={form.summary} onChange={event => setForm({ ...form, summary: event.target.value })} /></label>
            <label className="grid gap-2 text-sm md:col-span-2"><span>详细说明</span><textarea className="min-h-24 rounded-md border bg-background px-3 py-2" value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></label>
            <label className="grid gap-2 text-sm"><span>分类</span><Input value={form.categories} onChange={event => setForm({ ...form, categories: event.target.value })} placeholder="productivity, interface" /><small className="text-muted-foreground">使用小写分类 ID，逗号分隔。</small></label>
            <label className="grid gap-2 text-sm"><span>关键词</span><Input value={form.keywords} onChange={event => setForm({ ...form, keywords: event.target.value })} placeholder="ai, automation" /></label>
            <label className="grid gap-2 text-sm"><span>仓库地址</span><Input value={form.repositoryUrl} onChange={event => setForm({ ...form, repositoryUrl: event.target.value })} placeholder="https://github.com/example/plugin" /></label>
            <label className="grid gap-2 text-sm"><span>主页地址</span><Input value={form.homepageUrl} onChange={event => setForm({ ...form, homepageUrl: event.target.value })} placeholder="https://example.com" /></label>
            <label className="grid gap-2 text-sm md:col-span-2"><span>图标地址</span><Input value={form.iconUrl} onChange={event => setForm({ ...form, iconUrl: event.target.value })} placeholder="https://cdn.example.com/plugin.png" /><small className="text-muted-foreground">门户会通过同域代理提供给 DSH；仅支持 HTTPS 图片，最大 1 MB。</small></label>
            <label className="grid gap-2 text-sm"><span>兼容 API 版本</span><Input value={form.compatibilityApiVersion} onChange={event => setForm({ ...form, compatibilityApiVersion: event.target.value })} placeholder="1.0" /></label>
            <label className="grid gap-2 text-sm"><span>兼容 Host</span><Input value={form.compatibilityHosts} onChange={event => setForm({ ...form, compatibilityHosts: event.target.value })} placeholder="dsh-desktop, dsh" /></label>
          </div>}
          <DialogFooter><span className="mr-auto self-center text-xs text-muted-foreground">{copyMessage}</span><Button variant="outline" onClick={() => setEditor(undefined)} disabled={saving}>取消</Button>{promptMode && !editor ? <Button variant="outline" onClick={() => void copyPrompt()}>复制提示词</Button> : jsonMode && !editor ? <><Button variant="outline" onClick={() => void copyJson(jsonText)} disabled={saving || !jsonText.trim()}>复制 JSON</Button><Button onClick={() => void saveJsonPlugin()} disabled={saving || !jsonText.trim()}>{saving ? "校验并添加中..." : "校验并直接添加"}</Button></> : <><Button variant="outline" onClick={() => void copyJson(payloadFromForm(form))} disabled={saving}>复制 JSON</Button><Button onClick={() => void savePlugin()} disabled={saving}>{saving ? "保存中..." : "保存"}</Button></>}</DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
