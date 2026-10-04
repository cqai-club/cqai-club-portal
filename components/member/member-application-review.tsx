"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { memberRequest, MemberRequestError } from "./member-settings";
import type { OrganizationBinding } from "@/lib/member/organization-types";
export interface ReviewableApplication {
  id: string;
  name: string;
  phone: string;
  organization: string;
  title: string;
  userSub: string | null;
  userIssuer: string | null;
  reviewStatus: string;
  reviewNote: string | null;
  membershipState: string;
  membershipError: string | null;
  membershipOrganizationId: string | null;
  reviewedAt: string | null;
}
export function reviewLabel(application: Pick<ReviewableApplication, "reviewStatus" | "membershipState">) {
  if (application.reviewStatus === "rejected") return "未通过";
  if (application.reviewStatus !== "approved") return "待审核";
  if (application.membershipState === "joined") return "已通过 · 已确认加入";
  if (application.membershipState === "processing") return "已通过 · 正在加入";
  if (application.membershipState === "unknown") return "已通过 · 结果待确认";
  return "已通过 · 加入失败";
}
export default function ApplicationReview({ application, onClose, onDone }: { application: ReviewableApplication; onClose: () => void; onDone: () => void }) {
  const [binding, setBinding] = useState<OrganizationBinding | null>(null); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [note, setNote] = useState(application.reviewNote || ""); const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [confirmChange, setConfirmChange] = useState(false); const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void memberRequest<{ data: OrganizationBinding[] }>("/member/api/admin/member-settings/organizations", "GET", undefined, controller.signal).then(result => { if (!controller.signal.aborted) { setBinding(result.data.find(item => item.id === "innovation") || null); setLoading(false); } }).catch(error => { if (!controller.signal.aborted) { setError(error instanceof Error ? error.message : "组织配置无法读取。"); setLoading(false); } });
    return () => controller.abort();
  }, [reload]);
  const changed = Boolean(binding && application.membershipOrganizationId && binding.organizationId !== application.membershipOrganizationId);
  async function review(action: "approve" | "reject" | "retry") {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await memberRequest<{ result?: { state: string; error?: string } }>(`/member/api/admin/member-settings/applications/${application.id}/review`, "POST", { action, reviewNote: note, confirmOrganizationChange: confirmChange, ...(binding && action !== "reject" ? { bindingRevision: binding.revision, bindingOrganizationId: binding.organizationId } : {}) });
      setNotice(action === "reject" ? "已记录审核未通过。" : result.result?.state === "joined" ? "已通过，并确认加入创享会员组织。" : result.result?.error || "加入组织尚未完成，可重试。");
      onDone();
    } catch (error) { setError(error instanceof Error ? error.message : "审核失败。"); if (error instanceof MemberRequestError && (error.code === "ORGANIZATION_CHANGED" || error.code === "CONFIG_CHANGED")) { setConfirmChange(false); setReload(value => value + 1); } }
    finally { setBusy(false); }
  }
  const canJoin = Boolean(!loading && binding?.validatedAt && application.userSub && application.userIssuer && (!changed || confirmChange));
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="member-center max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-xl overflow-y-auto rounded-xl" onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onPointerDownOutside={event => { if (busy) event.preventDefault(); }}><DialogHeader><DialogTitle>创享会员申请审核</DialogTitle><DialogDescription>审核通过后，系统自动将申请人加入创享会员组织。</DialogDescription></DialogHeader><dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">申请人</dt><dd>{application.name} · {application.phone}</dd></div><div><dt className="text-muted-foreground">单位</dt><dd>{application.organization} · {application.title}</dd></div><div className="sm:col-span-2"><dt className="text-muted-foreground">绑定账号</dt><dd className="break-all font-mono text-xs">{application.userSub || "历史申请未绑定账号，不能自动加入组织。"}</dd></div><div><dt className="text-muted-foreground">审核状态</dt><dd>{reviewLabel(application)}</dd></div><div><dt className="text-muted-foreground">审核时间</dt><dd>{application.reviewedAt ? new Date(application.reviewedAt).toLocaleString(undefined, { timeZone: "Asia/Shanghai" }) : "—"}</dd></div></dl><div className="space-y-2 rounded-lg border p-3 text-sm">{loading ? "正在读取组织配置…" : <><p>目标组织：{binding?.name || "未配置"}</p><p className="break-all font-mono text-xs">{binding?.organizationId || "—"}</p>{!binding?.validatedAt && <Link className="text-primary underline" href="/member/dashboard/admin/member-settings">先验证并保存组织配置</Link>}</>}{changed && <><p>组织已从 {application.membershipOrganizationId} 变更，重试将加入以上新组织。</p><label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={confirmChange} disabled={busy} onChange={event => setConfirmChange(event.target.checked)} />我已核对新组织并确认重试目标</label></>}</div><label className="grid gap-2 text-sm">审核说明（申请人可见）<textarea className="min-h-24 rounded-lg border bg-background p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" maxLength={500} disabled={busy || application.reviewStatus !== "pending"} value={note} onChange={event => setNote(event.target.value)} /></label>{application.membershipError && <p role="status" className="text-sm text-muted-foreground">{application.membershipError}</p>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}{notice && <p role="status" className="text-sm">{notice}</p>}<DialogFooter><Button variant="outline" className="min-h-11" disabled={busy} onClick={onClose}>关闭</Button>{application.reviewStatus === "pending" ? <><Button variant="outline" className="min-h-11" disabled={busy} onClick={() => void review("reject")}>不通过</Button><Button className="min-h-11" disabled={busy || !canJoin} onClick={() => void review("approve")}>{busy ? "正在通过并加入…" : "审核通过"}</Button></> : application.reviewStatus === "approved" && <Button className="min-h-11" disabled={busy || !canJoin} onClick={() => void review("retry")}>{busy ? "正在确认并加入…" : application.membershipState === "joined" ? "重新确认成员关系" : "重试加入"}</Button>}</DialogFooter></DialogContent></Dialog>;
}
