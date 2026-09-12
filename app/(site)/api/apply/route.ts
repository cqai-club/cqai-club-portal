/**
 * POST /api/apply
 * Official-club member application intake. Mirrors the original Express
 * `/api/apply` handler: phone validation, required-field checks, xss
 * sanitization, high-value-member flagging, Prisma insert, P2002 duplicate
 * handling — plus the 1-minute / 5-request-per-IP rate limit.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/site/prisma";
import {
  rateLimit,
  sanitizeData,
} from "@/lib/site/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APPLY_WINDOW_MS = 60 * 1000;
const APPLY_MAX = 5;

const requiredStringFields = [
  "name",
  "wechat",
  "organization",
  "title",
  "orgType",
  "purpose",
  "timePref",
  "city",
  "roleIntent",
  "privacy",
];

function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  const ip = clientIp(request);
  if (!rateLimit("apply", ip, APPLY_MAX, APPLY_WINDOW_MS)) {
    return NextResponse.json(
      { error: "请求过于频繁，请稍后再试。" },
      { status: 429 }
    );
  }

  try {
    let rawData: Record<string, unknown>;
    try {
      rawData = await request.json();
    } catch {
      rawData = {};
    }

    // Basic validation
    if (
      typeof rawData.phone !== "string" ||
      !/^1[3-9]\d{9}$/.test(rawData.phone)
    ) {
      return NextResponse.json({ error: "无效的手机号码" }, { status: 400 });
    }

    if (
      requiredStringFields.some(
        field => typeof rawData[field] !== "string" || !String(rawData[field] ?? "").trim()
      )
    ) {
      return NextResponse.json({ error: "缺少必填字段" }, { status: 400 });
    }

    const data = sanitizeData(rawData) as Record<string, unknown>;

    // Business Logic: Identify High-Value Members
    // Rules: provision of '资金/投资' or '产业场景/业务需求' or roleIntent uses
    // '愿意成为理事/合作单位'.
    const provideRes = Array.isArray(data.provideRes)
      ? (data.provideRes as string[])
      : [];
    if (provideRes.length < 1) {
      return NextResponse.json(
        { error: "请至少选择一项可提供的资源" },
        { status: 400 }
      );
    }

    let isHighValue = false;
    if (
      provideRes.includes("资金/投资") ||
      provideRes.includes("产业场景/业务需求") ||
      data.roleIntent === "愿意成为理事/合作单位"
    ) {
      isHighValue = true;
    }

    // Check constraints: needResources between 1 and 3
    const needRes = Array.isArray(data.needRes) ? (data.needRes as string[]) : [];
    if (needRes.length < 1 || needRes.length > 3) {
      return NextResponse.json(
        { error: "希望链接的资源请选择1-3项" },
        { status: 400 }
      );
    }

    const events = Array.isArray(data.events) ? (data.events as string[]) : [];
    if (events.length < 1) {
      return NextResponse.json(
        { error: "请至少选择一项期待活动" },
        { status: 400 }
      );
    }

    await prisma.memberApplication.create({
      data: {
        name: String(data.name),
        phone: String(data.phone),
        wechat: String(data.wechat),
        email: data.email ? String(data.email) : undefined,
        organization: String(data.organization),
        title: String(data.title),
        orgType: String(data.orgType),
        orgTypeOther: data.orgTypeOther ? String(data.orgTypeOther) : undefined,
        provideResources: JSON.stringify(provideRes),
        provideResourcesOther: data.provideResOther
          ? String(data.provideResOther)
          : undefined,
        needResources: JSON.stringify(needRes),
        needResourcesOther: data.needResOther
          ? String(data.needResOther)
          : undefined,
        joinPurpose: String(data.purpose),
        joinPurposeOther: data.purposeOther ? String(data.purposeOther) : undefined,
        expectEvents: JSON.stringify(events),
        expectEventsOther: data.eventsOther ? String(data.eventsOther) : undefined,
        timePreference: String(data.timePref),
        city: String(data.city),
        cityOther: data.cityOther ? String(data.cityOther) : undefined,
        roleIntent: String(data.roleIntent),
        bio: data.bio ? String(data.bio) : undefined,
        privacyPreference: String(data.privacy),
        isHighValue,
        ipAddress: ip === "unknown" ? undefined : ip,
      },
    });

    return NextResponse.json(
      { success: true, isHighValue },
      { status: 201 }
    );
  } catch (error) {
    console.error("Apply error:", error);
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "P2002") {
      return NextResponse.json(
        { error: "该手机号码已提交过申请" },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "内部服务器错误" }, { status: 500 });
  }
}
