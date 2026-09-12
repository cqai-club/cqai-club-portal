"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, RefreshCw, Search, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type MemberRecord = {
  id: string;
  name: string;
  phone: string;
  wechat: string;
  organization: string;
  title: string;
  orgType: string;
  city: string;
  cityOther?: string | null;
  joinPurpose: string;
  joinPurposeOther?: string | null;
  roleIntent: string;
  provideResources: string[];
  provideResourcesOther?: string | null;
  needResources: string[];
  needResourcesOther?: string | null;
  isHighValue: boolean;
  createdAt: string;
};

type Filters = {
  isHighValue: string;
  orgType: string;
  city: string;
};

const emptyFilters: Filters = { isHighValue: "", orgType: "", city: "" };

function formatResources(resources: string[] | undefined, other?: string | null) {
  const values = Array.isArray(resources) ? [...resources] : [];
  if (other && values.includes("其他")) values.push(other);
  return values.length ? values.join("、") : "-";
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN");
}

export default function MemberApplicationsPage() {
  const [draftFilters, setDraftFilters] = useState<Filters>(emptyFilters);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadMembers = useCallback(async (targetPage = 1, activeFilters = filters) => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: String(targetPage), limit: "10" });
    if (activeFilters.isHighValue) params.set("isHighValue", activeFilters.isHighValue);
    if (activeFilters.orgType) params.set("orgType", activeFilters.orgType);
    if (activeFilters.city.trim()) params.set("city", activeFilters.city.trim());

    try {
      const response = await fetch(`/api/admin/members?${params.toString()}`);
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "获取会员申请失败。");
      setMembers(result.data || []);
      setTotal(result.total || 0);
      setPage(result.page || targetPage);
      setTotalPages(result.totalPages || 0);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "获取会员申请失败。");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void loadMembers(1, emptyFilters);
  }, [loadMembers]);

  async function exportMembers() {
    const response = await fetch("/api/admin/members/export");
    if (!response.ok) {
      setError("导出失败，请稍后重试。");
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "members.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">会员申请</h1>
          <p className="text-muted-foreground">查看和筛选俱乐部会员申请记录。</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void loadMembers(page)} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" />刷新
          </Button>
          <Button variant="outline" onClick={() => void exportMembers()}>
            <Download className="mr-2 h-4 w-4" />导出 CSV
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Search className="h-4 w-4" />筛选条件</CardTitle>
          <CardDescription>按会员价值、单位性质或城市缩小结果范围。</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-[180px_220px_minmax(180px,1fr)_auto_auto] md:items-end">
            <label className="grid gap-2 text-sm">
              <span className="text-muted-foreground">会员价值</span>
              <select className="h-10 rounded-md border bg-background px-3" value={draftFilters.isHighValue} onChange={event => setDraftFilters({ ...draftFilters, isHighValue: event.target.value })}>
                <option value="">全部</option>
                <option value="true">仅看高价值会员</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm">
              <span className="text-muted-foreground">单位性质</span>
              <select className="h-10 rounded-md border bg-background px-3" value={draftFilters.orgType} onChange={event => setDraftFilters({ ...draftFilters, orgType: event.target.value })}>
                <option value="">全部类别</option>
                <option>高校/科研院所</option>
                <option>国有企业</option>
                <option>民营企业</option>
                <option>外企</option>
                <option>政府/事业单位</option>
                <option>自由职业/创业者</option>
                <option>在校学生</option>
                <option>其他</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm">
              <span className="text-muted-foreground">城市</span>
              <input className="h-10 rounded-md border bg-background px-3" placeholder="输入城市搜索" value={draftFilters.city} onChange={event => setDraftFilters({ ...draftFilters, city: event.target.value })} />
            </label>
            <Button onClick={() => { setFilters(draftFilters); void loadMembers(1, draftFilters); }}>搜索</Button>
            <Button variant="ghost" onClick={() => { setDraftFilters(emptyFilters); setFilters(emptyFilters); void loadMembers(1, emptyFilters); }}>重置</Button>
          </div>
        </CardContent>
      </Card>

      {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>}

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>申请记录</CardTitle>
            <CardDescription>共 {total} 条记录</CardDescription>
          </div>
          <Users className="h-5 w-5 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[1000px] text-left text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="p-3">标识</th><th className="p-3">姓名及联系方式</th><th className="p-3">工作单位与性质</th><th className="p-3">加入目的</th><th className="p-3">提供与需求</th><th className="p-3">申请时间</th>
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">正在加载数据...</td></tr> : members.length === 0 ? <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">没有符合条件的申请记录。</td></tr> : members.map(member => (
                  <tr key={member.id} className="border-t align-top hover:bg-muted/30">
                    <td className="p-3">{member.isHighValue ? <Badge>VIP</Badge> : <span className="text-muted-foreground">-</span>}</td>
                    <td className="p-3"><div className="font-medium">{member.name}</div><div className="text-muted-foreground">📞 {member.phone}</div><div className="text-muted-foreground">💬 {member.wechat}</div></td>
                    <td className="p-3"><div className="font-medium">{member.organization}</div><div className="text-muted-foreground">{member.title} · {member.orgType}</div><div className="text-muted-foreground">城市：{member.city === "其他" ? member.cityOther : member.city}</div></td>
                    <td className="max-w-[220px] p-3"><div>{member.joinPurpose === "其他" ? member.joinPurposeOther : member.joinPurpose}</div><div className="text-xs text-muted-foreground">意向角色：{member.roleIntent}</div></td>
                    <td className="max-w-[260px] p-3 text-xs"><div><span className="font-medium text-green-600">提供：</span>{formatResources(member.provideResources, member.provideResourcesOther)}</div><div className="mt-1"><span className="font-medium text-red-500">需求：</span>{formatResources(member.needResources, member.needResourcesOther)}</div></td>
                    <td className="whitespace-nowrap p-3 text-muted-foreground">{formatDate(member.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 0 && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground"><span>第 {page} / {totalPages} 页</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => void loadMembers(page - 1)}>上一页</Button><Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => void loadMembers(page + 1)}>下一页</Button></div></div>}
        </CardContent>
      </Card>
    </div>
  );
}
