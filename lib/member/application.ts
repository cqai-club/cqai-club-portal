import type { MemberApplication } from "@prisma/client";
import { isOrganizationMember } from "@/lib/logto/organization-api";
import { NextResponse } from "next/server";
import { z } from "zod";
import { memberIdentity as applicationIdentity, assertMemberOrigin as assertApplicationOrigin, MemberSessionError as ApplicationError } from "./session";
import { prisma } from "@/lib/site/prisma";
import { rateLimit, sanitizeData, trustedClientIp } from "@/lib/site/api-helpers";
import { applicationOptions, type MemberApplicationDTO } from "./application-fields";

export type { MemberApplicationDTO, MemberApplicationPayload } from "./application-fields";

const requiredText = (max: number) => z.string().trim().min(1, "缺少必填字段").max(max, "内容超出长度限制");
const optionalText = (max: number) => z.string().trim().max(max, "内容超出长度限制").default("");
const selections = (options: readonly [string, ...string[]], max = options.length) =>
  z.array(z.enum(options)).min(1, "请至少选择一项").max(max, "选择数量超出限制")
    .refine(values => new Set(values).size === values.length, "请勿重复选择");

const applicationSchema = z.object({
  name: requiredText(80),
  phone: z.string().trim().regex(/^1[3-9]\d{9}$/, "无效的手机号码"),
  wechat: requiredText(80),
  email: z.string().trim().max(254, "邮箱地址过长").refine(value => !value || z.email().safeParse(value).success, "无效的邮箱地址").default(""),
  organization: requiredText(200),
  title: requiredText(100),
  orgType: z.enum(applicationOptions.orgType),
  orgTypeOther: optionalText(200),
  provideRes: selections(applicationOptions.provideRes),
  provideResOther: optionalText(200),
  needRes: selections(applicationOptions.needRes, 3),
  needResOther: optionalText(200),
  purpose: z.enum(applicationOptions.purpose),
  purposeOther: optionalText(200),
  events: selections(applicationOptions.events),
  eventsOther: optionalText(200),
  timePref: z.enum(applicationOptions.timePref),
  city: z.enum(applicationOptions.city),
  cityOther: optionalText(200),
  roleIntent: z.enum(applicationOptions.roleIntent),
  bio: optionalText(100),
  privacy: z.enum(applicationOptions.privacy),
}).superRefine((data, context) => {
  for (const [selection, detail] of [
    ["orgType", "orgTypeOther"],
    ["provideRes", "provideResOther"],
    ["needRes", "needResOther"],
    ["purpose", "purposeOther"],
    ["events", "eventsOther"],
    ["city", "cityOther"],
  ] as const) {
    const value = data[selection];
    if ((Array.isArray(value) ? value.includes("其他") : value === "其他") && !data[detail]) {
      context.addIssue({ code: "custom", path: [detail], message: "选择其他时请填写具体内容" });
    }
  }
});


function stringArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function applicationDTO(application: MemberApplication): MemberApplicationDTO {
  return {
    id: application.id,
    createdAt: application.createdAt.toISOString(),
    reviewStatus: application.reviewStatus,
    reviewNote: application.reviewNote || "",
    membershipState: application.membershipState,
    membershipActive: null,
    name: application.name,
    phone: application.phone,
    wechat: application.wechat,
    email: application.email || "",
    organization: application.organization,
    title: application.title,
    orgType: application.orgType,
    orgTypeOther: application.orgTypeOther || "",
    provideRes: stringArray(application.provideResources),
    provideResOther: application.provideResourcesOther || "",
    needRes: stringArray(application.needResources),
    needResOther: application.needResourcesOther || "",
    purpose: application.joinPurpose,
    purposeOther: application.joinPurposeOther || "",
    events: stringArray(application.expectEvents),
    eventsOther: application.expectEventsOther || "",
    timePref: application.timePreference,
    city: application.city,
    cityOther: application.cityOther || "",
    roleIntent: application.roleIntent,
    bio: application.bio || "",
    privacy: application.privacyPreference,
  };
}

function errorResponse(error: unknown): NextResponse {
  if (error instanceof ApplicationError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  }
  console.error("Member application error:", error);
  return NextResponse.json({ error: "内部服务器错误", code: "INTERNAL_ERROR" }, { status: 500, headers: { "Cache-Control": "no-store" } });
}

export async function getMemberApplication(request: Request): Promise<NextResponse> {
  try {
    const identity = await applicationIdentity(request);
    const application = await prisma.memberApplication.findUnique({
      where: { userIssuer_userSub: identity },
    });
    const dto = application ? applicationDTO(application) : null;
    if (dto && application?.reviewStatus === "approved" && application.userSub) {
      const binding = await prisma.memberOrganizationBinding.findUnique({ where: { id: "innovation" } });
      if (!binding?.validatedAt || application.membershipOrganizationId !== binding.organizationId) dto.membershipActive = false;
      else {
        try { dto.membershipActive = await isOrganizationMember(binding.organizationId, application.userSub); }
        catch { dto.membershipActive = null; }
      }
    }
    return NextResponse.json({ application: dto }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function submitMemberApplication(request: Request): Promise<NextResponse> {
  try {
    const identity = await applicationIdentity(request);
    assertApplicationOrigin(request);
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") || "")) {
      throw new ApplicationError(415, "INVALID_CONTENT_TYPE", "请使用 JSON 提交申请。");
    }
    const ip = trustedClientIp(request);
    if (!rateLimit("apply", ip, 5, 60_000)) {
      throw new ApplicationError(429, "RATE_LIMITED", "请求过于频繁，请稍后再试。");
    }
    let rawData: unknown;
    try {
      const body = await request.text();
      if (Buffer.byteLength(body) > 16_384) {
        throw new ApplicationError(413, "PAYLOAD_TOO_LARGE", "申请内容过长。");
      }
      rawData = JSON.parse(body);
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError(400, "INVALID_JSON", "申请数据格式无效。");
    }
    const parsed = applicationSchema.safeParse(rawData);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return NextResponse.json({
        error: issue.message,
        code: "VALIDATION_ERROR",
        field: issue.path[0] || "",
      }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    const data = sanitizeData(parsed.data);
    const existing = await prisma.memberApplication.findUnique({ where: { userIssuer_userSub: identity } });
    if (existing) {
      throw new ApplicationError(409, "ALREADY_SUBMITTED", "当前账号已提交入会申请。");
    }
    const phoneApplication = await prisma.memberApplication.findUnique({ where: { phone: data.phone } });
    if (phoneApplication) {
      throw new ApplicationError(409, "PHONE_ALREADY_USED", "该手机号已提交过申请，请联系俱乐部核实。");
    }
    const application = await prisma.memberApplication.create({
      data: {
        ...identity,
        name: data.name,
        phone: data.phone,
        wechat: data.wechat,
        email: data.email || null,
        organization: data.organization,
        title: data.title,
        orgType: data.orgType,
        orgTypeOther: data.orgType === "其他" ? data.orgTypeOther : null,
        provideResources: JSON.stringify(data.provideRes),
        provideResourcesOther: data.provideRes.includes("其他") ? data.provideResOther : null,
        needResources: JSON.stringify(data.needRes),
        needResourcesOther: data.needRes.includes("其他") ? data.needResOther : null,
        joinPurpose: data.purpose,
        joinPurposeOther: data.purpose === "其他" ? data.purposeOther : null,
        expectEvents: JSON.stringify(data.events),
        expectEventsOther: data.events.includes("其他") ? data.eventsOther : null,
        timePreference: data.timePref,
        city: data.city,
        cityOther: data.city === "其他" ? data.cityOther : null,
        roleIntent: data.roleIntent,
        bio: data.bio || null,
        privacyPreference: data.privacy,
        isHighValue: data.provideRes.includes("资金/投资") || data.provideRes.includes("产业场景/业务需求") || data.roleIntent === "愿意成为理事/合作单位",
        ipAddress: ip === "unknown" ? null : ip,
      },
    });
    return NextResponse.json({ success: true, application: applicationDTO(application) }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    // Both unique indexes also close concurrent submission races.
    if (error instanceof Error && "code" in error && error.code === "P2002") {
      try {
        const identity = await applicationIdentity(request);
        const existing = await prisma.memberApplication.findUnique({ where: { userIssuer_userSub: identity } });
        return errorResponse(existing
          ? new ApplicationError(409, "ALREADY_SUBMITTED", "当前账号已提交入会申请。")
          : new ApplicationError(409, "PHONE_ALREADY_USED", "该手机号已提交过申请，请联系俱乐部核实。"));
      } catch (identityError) {
        return errorResponse(identityError);
      }
    }
    return errorResponse(error);
  }
}
