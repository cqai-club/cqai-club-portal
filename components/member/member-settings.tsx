"use client";

import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useEffect, useState } from "react";
import { Plus, RefreshCw, Settings2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useTranslations } from "@/lib/i18n/client";
import { useToast } from "@/hooks/use-toast";
import type { MemberJoinResult, OrganizationBinding, OrganizationUser, OrganizationUserPage } from "@/lib/member/organization-types";

const base = "/member/api/admin/member-settings";
const inputStyle = "min-h-11 w-full rounded-lg border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const copy = {
  zh: { title: "会员设置", description: "管理会员组织、查看成员，并将现有用户加入组织。", members: "会员列表", config: "组织配置", configDescription: "配置会员组织的展示名称与 Logto 组织 ID。", refresh: "刷新", add: "添加成员", remove: "移除", removeTitle: "移除成员", removing: "正在移除…", confirmRemove: "确认移除", removed: "移除成功", removeDescription: "将此成员移出当前会员组织，其账号及其他组织成员关系保留。", newOrg: "新增组织配置", organization: "当前组织", search: "筛选", searchHint: "姓名、用户名、邮箱、手机号或用户 ID", loading: "正在读取…", empty: "暂无符合条件的成员。", setup: "请先验证并保存组织配置。", retry: "重试", view: "查看", user: "成员", contact: "联系方式", joined: "加入时间", action: "操作", previous: "上一页", next: "下一页", page: "页", total: "总数", synced: "最近同步", unknown: "暂未获取", cancel: "取消", save: "保存配置", saving: "正在保存…", verify: "验证组织", verified: "已验证", unverified: "待验证", name: "展示名称", orgId: "Logto 组织 ID", actualName: "Logto 组织名称", replace: "更换组织后，成员列表及添加目标将改变。更换创享会员组织还将改变项目征集和资料中心的访问范围。已有成员不会自动迁移。", confirmReplace: "我已核对新组织及变更影响", saved: "组织配置已保存。", existingUsers: "现有用户", selectPage: "全选本页可加入用户", selected: "已选择", clear: "清空选择", already: "已在组织内", available: "可以加入", limit: "每次最多选择 20 位用户。", join: "加入当前组织", joining: "正在加入…", added: "添加成功", people: "位成员", failed: "加入失败", pending: "结果待确认", retryJoin: "重试未完成成员", userId: "用户 ID", detail: "成员详情", memberOrgs: "所属会员组织", chooseOther: "管理组织配置", noUsers: "没有符合条件的现有用户。", failure: "请求失败，请重试。", copy: "复制 ID", copied: "已复制", creating: "新组织", membershipChanged: "组织配置已改变，请刷新后重新选择。" },
  en: { title: "Member settings", description: "Manage member organizations and add existing users.", members: "Members", config: "Organizations", configDescription: "Configure display names and Logto organization IDs.", refresh: "Refresh", add: "Add members", remove: "Remove", removeTitle: "Remove member", removing: "Removing…", confirmRemove: "Confirm removal", removed: "Member removed", removeDescription: "Remove this member from the selected organization. Their account and other memberships remain.", newOrg: "Add organization binding", organization: "Organization", search: "Filter", searchHint: "Name, username, email, phone or user ID", loading: "Loading…", empty: "No matching members.", setup: "Verify and save the organization first.", retry: "Retry", view: "View", user: "Member", contact: "Contact", joined: "Joined", action: "Actions", previous: "Previous", next: "Next", page: "Page", total: "Total", synced: "Last synced", unknown: "Unavailable", cancel: "Cancel", save: "Save binding", saving: "Saving…", verify: "Verify organization", verified: "Verified", unverified: "Not verified", name: "Display name", orgId: "Logto organization ID", actualName: "Logto organization name", replace: "Changing the organization changes the member list and add target. Changing the Chuangxiang member organization also changes access to project submissions and resources. Existing members are not moved.", confirmReplace: "I have checked the new organization and impact", saved: "Organization binding saved.", existingUsers: "Existing users", selectPage: "Select eligible users on this page", selected: "Selected", clear: "Clear selection", already: "Already a member", available: "Can be added", limit: "Select up to 20 users per operation.", join: "Add to organization", joining: "Adding…", added: "Members added", people: "members", failed: "Failed", pending: "Unconfirmed", retryJoin: "Retry unfinished users", userId: "User ID", detail: "Member details", memberOrgs: "Member organizations", chooseOther: "Manage organizations", noUsers: "No matching existing users.", failure: "Request failed. Please retry.", copy: "Copy ID", copied: "Copied", creating: "New organization", membershipChanged: "Organization binding changed. Refresh and select users again." },
};
function useCopy() { return copy[useTranslations().language]; }
export class MemberRequestError extends Error {
  constructor(message: string, readonly code?: string) { super(message); }
}
export async function memberRequest<T>(url: string, method = "GET", data?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { method, cache: "no-store", signal, headers: data === undefined ? undefined : { "Content-Type": "application/json" }, body: data === undefined ? undefined : JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) throw new MemberRequestError(result.error || "请求失败，请重试。", result.code);
  return result;
}
function useRemote<T>(url: string | null) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ key: string; data?: T; error?: string; loading: boolean }>({ key: "", loading: true });
  const key = `${url}:${revision}`;
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    void (async () => {
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setState({ key, loading: true });
      try {
        const data = await memberRequest<T>(url, "GET", undefined, controller.signal);
        if (!controller.signal.aborted) setState({ key, data, loading: false });
      } catch (error) {
        if (!controller.signal.aborted) setState({ key, error: error instanceof Error ? error.message : "读取失败。", loading: false });
      }
    })();
    return () => controller.abort();
  }, [url, key]);
  return { data: state.key === key ? state.data : undefined, error: state.key === key ? state.error : undefined, loading: Boolean(url) && (state.key !== key || state.loading), reload: () => setRevision(value => value + 1) };
}
function Feedback({ text, error = false }: { text?: string; error?: boolean }) {
  return text ? <p role={error ? "alert" : "status"} className={`rounded-lg border p-3 text-sm ${error ? "border-destructive/30 text-destructive" : "text-muted-foreground"}`}>{text}</p> : null;
}
function maskEmail(value: string | null) { return value?.replace(/^(.).*(@.*)$/, "$1***$2") || "—"; }
function maskPhone(value: string | null) { return value && value.length > 6 ? `${value.slice(0, 3)}****${value.slice(-4)}` : value || "—"; }
function formatDate(value?: string | null) { return value ? new Date(value).toLocaleString(undefined, { timeZone: "Asia/Shanghai" }) : "—"; }
function UserLabel({ user }: { user: OrganizationUser }) {
  return <div className="min-w-0"><p className="break-words font-medium">{user.name || user.username || user.id}</p><p className="break-all text-xs text-muted-foreground">{user.username ? `${user.username} · ` : ""}{user.id}</p></div>;
}
function Pager({ data, onPage, loading }: { data?: OrganizationUserPage; onPage: (page: number) => void; loading: boolean }) {
  const c = useCopy();
  return <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><span>{c.total}: {data?.total ?? c.unknown} · {c.page} {data?.page ?? 1}</span><div className="flex gap-2"><Button className="min-h-11" variant="outline" disabled={loading || !data || data.page <= 1} onClick={() => onPage((data?.page || 1) - 1)}>{c.previous}</Button><Button className="min-h-11" variant="outline" disabled={loading || !data?.hasNext} onClick={() => onPage((data?.page || 1) + 1)}>{c.next}</Button></div></div>;
}
function Filter({ onFilter }: { onFilter: (value: string) => void }) {
  const c = useCopy(); const [value, setValue] = useState("");
  return <form className="flex gap-2" onSubmit={event => { event.preventDefault(); onFilter(value.trim()); }}><Input onClear={() => onFilter("")} aria-label={c.searchHint} className={inputStyle} placeholder={c.searchHint} maxLength={100} value={value} onChange={event => setValue(event.target.value)} /><Button variant="outline" className="min-h-11" type="submit">{c.search}</Button></form>;
}
function BindingEditor({ binding, onSaved, onCancel, onBusyChange }: { binding?: OrganizationBinding; onSaved: () => void; onCancel?: () => void; onBusyChange?: (busy: boolean) => void }) {
  const c = useCopy(); const [name, setName] = useState(binding?.name || ""); const [organizationId, setOrganizationId] = useState(binding?.organizationId || "");
  const [verified, setVerified] = useState<{ id: string; name: string } | null>(null); const [confirmed, setConfirmed] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const changed = Boolean(binding && organizationId.trim() !== binding.organizationId);
  function setWorking(value: boolean) { setBusy(value); onBusyChange?.(value); }
  async function verify() {
    setWorking(true); setError(""); setVerified(null);
    try { const result = await memberRequest<{ organization: { id: string; name: string } }>(`${base}/verify`, "POST", { organizationId: organizationId.trim() }); setVerified(result.organization); }
    catch (error) { setError(error instanceof Error ? error.message : c.failure); } finally { setWorking(false); }
  }
  async function save() {
    setWorking(true); setError("");
    try {
      await memberRequest(`${base}/organizations`, binding ? "PATCH" : "POST", { ...(binding ? { id: binding.id, revision: binding.revision } : {}), name: name.trim(), organizationId: organizationId.trim(), confirmChange: confirmed });
      onSaved();
    } catch (error) { setError(error instanceof Error ? error.message : c.failure); } finally { setWorking(false); }
  }
  return <Card className="gap-4 p-5 sm:p-6"><h2 className="text-lg font-semibold">{binding?.name || c.creating}</h2><label className="grid gap-2 text-sm">{c.name}<Input className={inputStyle} disabled={busy} maxLength={80} value={name} onChange={event => setName(event.target.value)} /></label><label className="grid gap-2 text-sm">{c.orgId}<Input className={`${inputStyle} font-mono`} disabled={busy} maxLength={100} value={organizationId} onChange={event => { setOrganizationId(event.target.value); setVerified(null); setConfirmed(false); }} /></label><div className="flex flex-wrap items-center gap-3"><Button variant="outline" className="min-h-11" disabled={busy || !organizationId.trim()} onClick={() => void verify()}>{busy ? c.loading : c.verify}</Button><span className="text-sm text-muted-foreground">{verified ? `${c.verified} · ${verified.name}` : binding?.validatedAt && !changed ? `${c.verified} · ${binding.organizationName}` : c.unverified}</span></div>{changed && <div className="space-y-3 rounded-lg border p-3 text-sm"><p>{c.replace}</p><label className="flex min-h-11 items-center gap-3"><input type="checkbox" disabled={busy} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />{c.confirmReplace}</label></div>}<Feedback text={error} error /><div className="flex justify-end gap-2"><Button variant="outline" className="min-h-11" disabled={busy} onClick={onCancel || (() => { setName(binding?.name || ""); setOrganizationId(binding?.organizationId || ""); setVerified(null); setConfirmed(false); setError(""); })}>{c.cancel}</Button><Button className="min-h-11" disabled={busy || !name.trim() || verified?.id !== organizationId.trim() || (changed && !confirmed)} onClick={() => void save()}>{busy ? c.saving : c.save}</Button></div></Card>;
}
function AddMembers({ binding, onClose, onJoined }: { binding: OrganizationBinding; onClose: () => void; onJoined: () => void }) {
  const c = useCopy(); const [page, setPage] = useState(1); const [query, setQuery] = useState(""); const [selected, setSelected] = useState<Record<string, OrganizationUser>>({}); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [results, setResults] = useState<MemberJoinResult[]>([]);
  const users = useRemote<OrganizationUserPage>(`${base}/users?bindingId=${encodeURIComponent(binding.id)}&page=${page}&q=${encodeURIComponent(query)}`);
  const [stale, setStale] = useState(false);
  const { toast } = useToast();
  function select(user: OrganizationUser, checked: boolean) {
    setSelected(previous => { const next = { ...previous }; if (!checked) delete next[user.id]; else if (Object.keys(next).length < 20) next[user.id] = user; return next; });
  }
  async function join() {
    setBusy(true); setError("");
    try {
      const result = await memberRequest<{ results: MemberJoinResult[] }>(`${base}/members`, "POST", { bindingId: binding.id, revision: binding.revision, userIds: Object.keys(selected) });
      const unfinished = result.results.filter(item => item.state !== "joined");
      const joinedCount = result.results.length - unfinished.length;
      setResults(unfinished);
      setSelected(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => unfinished.some(item => item.userId === id))));
      if (joinedCount > 0) toast({ title: c.added, description: `${binding.name} · ${joinedCount} ${c.people}`, duration: 3000 });
      users.reload(); onJoined();
      if (!unfinished.length) onClose();
    } catch (error) { if (error instanceof MemberRequestError && error.code === "CONFIG_CHANGED") setStale(true); setError(error instanceof Error ? error.message : c.failure); }
    finally { setBusy(false); }
  }
  const eligible = users.data?.data.filter(user => !user.inOrganization) || [];
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent aria-describedby={undefined} className="member-center max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-2xl overflow-y-auto rounded-xl" onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onPointerDownOutside={event => { if (busy) event.preventDefault(); }}><DialogHeader><DialogTitle className="pr-6 break-words">{c.add} - {binding.name}</DialogTitle></DialogHeader><Filter onFilter={value => { setQuery(value); setPage(1); }} /><Feedback text={error || users.error} error />{users.error && <Button variant="outline" onClick={users.reload}>{c.retry}</Button>}<label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" disabled={busy || users.loading || !eligible.length || stale} checked={eligible.length > 0 && eligible.every(user => Boolean(selected[user.id]))} onChange={event => { const checked = event.target.checked; setSelected(previous => { const next = { ...previous }; for (const user of eligible) { if (!checked) delete next[user.id]; else if (Object.keys(next).length < 20) next[user.id] = user; } return next; }); }} />{c.selectPage}</label><div className="max-h-[32dvh] overflow-y-auto rounded-lg border">{users.loading ? <p role="status" className="p-5 text-sm">{c.loading}</p> : !users.data?.data.length ? <p className="p-5 text-sm">{c.noUsers}</p> : users.data.data.map(user => (
  <label key={user.id} className="grid min-h-16 grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)_auto] items-center gap-3 border-b p-3 last:border-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
    <div className="flex min-w-0 items-center gap-3">
      <input type="checkbox" className="shrink-0" aria-label={`${c.add}: ${user.name || user.username || user.id}`} checked={Boolean(selected[user.id])} disabled={busy || stale || user.inOrganization || (!selected[user.id] && Object.keys(selected).length >= 20)} onChange={event => select(user, event.target.checked)} />
      <UserLabel user={user} />
    </div>
    <div className="min-w-0 break-all text-xs text-muted-foreground">
      <p>{maskEmail(user.primaryEmail)}</p>
      <p>{maskPhone(user.primaryPhone)}</p>
    </div>
    <span className="text-right text-xs text-muted-foreground">{user.inOrganization ? c.already : c.available}</span>
  </label>
))}</div><Pager data={users.data} onPage={setPage} loading={users.loading || busy} /><div className="flex flex-wrap items-center gap-2 text-sm"><span>{c.selected}: {Object.keys(selected).length} / 20</span><Button variant="ghost" disabled={busy} onClick={() => setSelected({})}>{c.clear}</Button></div><div className="flex flex-wrap gap-2">{Object.values(selected).map(user => <Button key={user.id} variant="outline" className="max-w-full whitespace-normal text-xs" disabled={busy} onClick={() => select(user, false)} aria-label={`${c.cancel}: ${user.name || user.id}`}>{user.name || user.username || user.id} ×</Button>)}</div>{results.length > 0 && <div role="status" className="space-y-2 text-sm">{results.map(item => <p className="break-all" key={item.userId}>{item.userId}: {item.state === "unknown" ? c.pending : c.failed}{item.error ? ` · ${item.error}` : ""}</p>)}</div>}<DialogFooter><Button className="min-h-11" variant="outline" disabled={busy} onClick={onClose}>{c.cancel}</Button><Button className="min-h-11" disabled={busy || stale || !Object.keys(selected).length} onClick={() => void join()}>{busy ? c.joining : results.length && Object.keys(selected).length ? c.retryJoin : c.join}</Button></DialogFooter></DialogContent></Dialog>;
}
function Detail({ userId, binding, onClose, onOther }: { userId: string; binding: OrganizationBinding; onClose: () => void; onOther: () => void }) {
  const c = useCopy(); const detail = useRemote<{ user: OrganizationUser; bindings: OrganizationBinding[] }>(`${base}/users/${encodeURIComponent(userId)}?bindingId=${encodeURIComponent(binding.id)}`); const [copied, setCopied] = useState(false);
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="member-center max-h-[90dvh] w-[calc(100%_-_2rem)] overflow-y-auto rounded-xl"><DialogHeader><DialogTitle>{c.detail}</DialogTitle><DialogDescription>{binding.name}</DialogDescription></DialogHeader><Feedback text={detail.error} error />{detail.error && <Button variant="outline" onClick={detail.reload}>{c.retry}</Button>}{detail.loading && <p role="status">{c.loading}</p>}{detail.data && <div className="space-y-4"><UserLabel user={detail.data.user} /><dl className="space-y-3 text-sm"><div><dt>{c.contact}</dt><dd className="break-all text-muted-foreground">{detail.data.user.primaryEmail || "—"} · {detail.data.user.primaryPhone || "—"}</dd></div><div><dt>{c.memberOrgs}</dt><dd>{detail.data.bindings.map(item => item.name).join("、")}</dd></div></dl><Button variant="outline" onClick={() => { void navigator.clipboard.writeText(userId).then(() => setCopied(true)).catch(() => setCopied(false)); }}>{copied ? c.copied : c.copy}</Button><Button variant="outline" onClick={onOther}>{c.chooseOther}</Button></div>}</DialogContent></Dialog>;
}
function RemoveMember({ user, binding, onClose, onRemoved }: { user: OrganizationUser; binding: OrganizationBinding; onClose: () => void; onRemoved: () => void }) {
  const c = useCopy();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  async function remove() {
    setBusy(true); setError("");
    try {
      await memberRequest(`${base}/members`, "DELETE", { bindingId: binding.id, revision: binding.revision, userId: user.id });
      toast({ title: c.removed, description: `${user.name || user.username || user.id} - ${binding.name}`, duration: 3000 });
      onRemoved(); onClose();
    } catch (error) {
      if (error instanceof MemberRequestError && error.code === "CONFIG_CHANGED") setStale(true);
      setError(error instanceof Error ? error.message : c.failure);
    } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
      <DialogContent className="member-center max-h-[90dvh] w-[calc(100%_-_2rem)] overflow-y-auto rounded-xl" onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onPointerDownOutside={event => { if (busy) event.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle className="pr-6 break-words">{c.removeTitle} - {binding.name}</DialogTitle>
          <DialogDescription>{c.removeDescription}</DialogDescription>
        </DialogHeader>
        <UserLabel user={user} />
        <Feedback text={error} error />
        <DialogFooter>
          <Button variant="outline" className="min-h-11" disabled={busy} onClick={onClose}>{c.cancel}</Button>
          <Button variant="destructive" className="min-h-11" disabled={busy || stale} onClick={() => void remove()}>{busy ? c.removing : c.confirmRemove}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function Members({ binding, onConfig }: { binding: OrganizationBinding; onConfig: () => void }) {
  const c = useCopy(); const [page, setPage] = useState(1); const [query, setQuery] = useState(""); const [adding, setAdding] = useState(false); const [detail, setDetail] = useState<string | null>(null); const [removing, setRemoving] = useState<OrganizationUser | null>(null);
  const members = useRemote<OrganizationUserPage & { synchronizedAt: string }>(binding.validatedAt ? `${base}/members?bindingId=${encodeURIComponent(binding.id)}&page=${page}&q=${encodeURIComponent(query)}` : null);
  if (!binding.validatedAt) return <Card className="items-start p-6"><p>{c.setup}</p><Button onClick={onConfig}>{c.config}</Button></Card>;
  return <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{c.synced}: {formatDate(members.data?.synchronizedAt)}</p><div className="flex gap-2"><Button variant="outline" className="min-h-11" disabled={members.loading} onClick={members.reload}><RefreshCw aria-hidden="true" className="size-4" />{c.refresh}</Button><Button className="min-h-11" onClick={() => setAdding(true)}><Plus aria-hidden="true" className="size-4" />{c.add}</Button></div></div><Filter onFilter={value => { setQuery(value); setPage(1); }} /><Feedback text={members.error} error />{members.error && <Button variant="outline" onClick={members.reload}>{c.retry}</Button>}<Card className="gap-0 overflow-hidden p-0">{members.loading ? <p role="status" className="p-6">{c.loading}</p> : !members.data?.data.length ? <p className="p-6">{c.empty}</p> : <><table className="hidden w-full text-left text-sm md:table"><thead className="bg-muted/50"><tr><th className="p-4">{c.user}</th><th>{c.contact}</th><th>{c.joined}</th><th className="pr-4">{c.action}</th></tr></thead><tbody>{members.data.data.map(user => <tr className="border-t" key={user.id}><td className="max-w-64 p-4"><UserLabel user={user} /></td><td className="max-w-48 break-all pr-3">{maskEmail(user.primaryEmail)}<br />{maskPhone(user.primaryPhone)}</td><td className="pr-3">{formatDate(user.joinedAt)}</td><td className="pr-4"><div className="flex shrink-0 flex-wrap gap-2"><Button variant="outline" className="min-h-11" onClick={() => setDetail(user.id)}>{c.view}</Button><Button variant="outline" className="min-h-11 text-destructive hover:text-destructive" onClick={() => setRemoving(user)} aria-label={`${c.remove}: ${user.name || user.username || user.id}`}>{c.remove}</Button></div></td></tr>)}</tbody></table><div className="md:hidden">{members.data.data.map(user => <div className="space-y-3 border-b p-4 last:border-0" key={user.id}><UserLabel user={user} /><p className="break-all text-sm text-muted-foreground">{maskEmail(user.primaryEmail)} · {maskPhone(user.primaryPhone)}</p><div className="flex flex-wrap items-center justify-between gap-3"><span className="min-w-0 break-words text-xs">{binding.name} · {formatDate(user.joinedAt)}</span><div className="flex shrink-0 flex-wrap gap-2"><Button variant="outline" className="min-h-11" onClick={() => setDetail(user.id)}>{c.view}</Button><Button variant="outline" className="min-h-11 text-destructive hover:text-destructive" onClick={() => setRemoving(user)} aria-label={`${c.remove}: ${user.name || user.username || user.id}`}>{c.remove}</Button></div></div></div>)}</div></>}</Card><Pager data={members.data} onPage={setPage} loading={members.loading} />{removing && <RemoveMember user={removing} binding={binding} onClose={() => setRemoving(null)} onRemoved={() => { if (members.data?.data.length === 1 && page > 1) setPage(value => value - 1); else members.reload(); }} />}{adding && <AddMembers binding={binding} onClose={() => setAdding(false)} onJoined={members.reload} />}{detail && <Detail userId={detail} binding={binding} onClose={() => setDetail(null)} onOther={() => { setDetail(null); onConfig(); }} />}</div>;
}
export default function MemberSettings() {
  const c = useCopy();
  const bindings = useRemote<{ data: OrganizationBinding[] }>(`${base}/organizations`);
  const [selected, setSelected] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [configBusy, setConfigBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState("");
  const current = selected === null ? bindings.data?.data[0] : bindings.data?.data.find(item => item.id === selected);

  function saved() { setNotice(c.saved); setCreating(false); bindings.reload(); }
  function changeConfigOpen(open: boolean) {
    if (configBusy) return;
    setConfigOpen(open);
    if (!open) setCreating(false);
  }

  return (
    <Sheet open={configOpen} onOpenChange={changeConfigOpen}>
      <div className="space-y-6">
        <header className="flex flex-col justify-between gap-6 lg:flex-row lg:items-start">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-widest text-primary">CQAI CLUB</p>
            <h1 className="mt-2 flex items-center gap-3 text-2xl font-semibold"><Users aria-hidden="true" className="size-6" />{c.title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{c.description}</p>
          </div>
          <div className="flex w-full shrink-0 flex-col gap-3 sm:w-auto sm:flex-row sm:items-end">
            <label className="grid min-w-0 gap-2 text-sm sm:w-72">
              <span className="sr-only">{c.organization}</span>
              <NativeSelect clearable={false} className={inputStyle} value={current?.id || ""} disabled={bindings.loading || !bindings.data?.data.length} onChange={event => setSelected(event.target.value)}>
                {!bindings.data?.data.length && <option value="">{bindings.loading ? c.loading : c.unknown}</option>}
                {bindings.data?.data.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </NativeSelect>
            </label>
            <SheetTrigger asChild>
              <Button variant="outline" className="min-h-11 shrink-0"><Settings2 aria-hidden="true" className="size-4" />{c.config}</Button>
            </SheetTrigger>
          </div>
        </header>
        <Feedback text={notice} />
        <Feedback text={bindings.error} error />
        {bindings.error && <Button variant="outline" onClick={bindings.reload}>{c.retry}</Button>}
        {bindings.loading && <p role="status">{c.loading}</p>}
        <section aria-label={c.members}>
          {current && <Members key={`${current.id}:${current.revision}`} binding={current} onConfig={() => setConfigOpen(true)} />}
        </section>
      </div>
      <SheetContent
        side="right"
        className="member-center flex h-dvh w-full flex-col gap-0 p-0 sm:max-w-xl motion-reduce:animate-none motion-reduce:transition-none [&>button]:flex [&>button]:size-11 [&>button]:items-center [&>button]:justify-center"
        onEscapeKeyDown={event => { if (configBusy) event.preventDefault(); }}
        onPointerDownOutside={event => { if (configBusy) event.preventDefault(); }}
      >
        <SheetHeader className="shrink-0 border-b px-5 py-6 pr-16 text-left sm:px-6 sm:pr-16">
          <SheetTitle>{c.config}</SheetTitle>
          <SheetDescription>{c.configDescription}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:p-6">
          <Feedback text={notice} />
          <Feedback text={bindings.error} error />
          {bindings.error && <Button variant="outline" className="mt-4" onClick={bindings.reload}>{c.retry}</Button>}
          {bindings.loading ? <p role="status" className="mt-4 text-sm">{c.loading}</p> : (
            <fieldset disabled={configBusy} className="mt-4 min-w-0 space-y-5">
              {bindings.data?.data.map(item => <BindingEditor key={`${item.id}:${item.revision}`} binding={item} onSaved={saved} onBusyChange={setConfigBusy} />)}
              {creating ? <BindingEditor onSaved={saved} onCancel={() => setCreating(false)} onBusyChange={setConfigBusy} /> : (
                <Button variant="outline" className="min-h-11 w-full" onClick={() => setCreating(true)}><Plus aria-hidden="true" className="size-4" />{c.newOrg}</Button>
              )}
            </fieldset>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
