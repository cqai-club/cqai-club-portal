import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolResult, type Tool } from "@modelcontextprotocol/sdk/types.js";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import {
  ActivityError, activityInputSchema, cancelActivityRegistration, createActivity, getManagedActivity,
  getPublicActivity, listActivityRegistrations, listManagedActivities, listMyActivityRegistrations,
  listPublicActivities, managedActivityFilters, publishActivity, registerForActivity, serializeActivity, updateActivity,
} from "@/lib/club-activities";
import { PluginSubmissionError, createPluginSubmission, listPluginSubmissions, reviewPluginSubmission, serializePluginSubmission } from "@/lib/plugin-submissions";
import { pluginDbData, pluginInputSchema, serializePlugin } from "@/lib/plugin-market";
import { requireMcpPermission, type McpActor } from "@/lib/mcp/auth";
import { mcpOrigin } from "@/lib/mcp/config";
import { McpBusinessError, requestHash, runMcpWrite } from "@/lib/mcp/operations";
import { validateNpmPackage, type NpmPackageValidation } from "@/lib/mcp/npm-package";
import { prisma } from "@/lib/site/prisma";

const id = z.string().uuid();
const requestKey = z.string().min(8).max(128).regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/);
const sourceSchema = z.object({
  key: z.string().min(1).max(180).regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/@-]*$/),
  url: z.url().max(2048).refine(value => { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; }).optional(),
  title: z.string().trim().max(300).optional(),
}).strict();
const activityPermission = "activity:publish";
const pluginPermission = "plugin:admin";

type Data = Record<string, unknown>;
type Definition = { tool: Tool; permission?: string; invoke: (args: unknown) => Promise<Data> };

function link(path: string) { return new URL(path, mcpOrigin()).href; }
function activityResult<T extends { id: string; status: string }>(value: T) {
  const manageUrl = link("/member/dashboard/admin/activities");
  const publicUrl = value.status === "draft" ? null : link(`/activities/${value.id}`);
  return { ...value, url: publicUrl ?? manageUrl, publicUrl, manageUrl };
}

async function submissionResult(submissionId: string, actor: McpActor, db: Prisma.TransactionClient = prisma, admin = false) {
  const submission = await db.pluginSubmission.findFirst({
    where: { id: submissionId, ...(admin ? {} : { submittedByIssuer: actor.issuer, submittedBySub: actor.sub }) },
    include: { plugin: true },
  });
  if (!submission) throw new McpBusinessError(404, "SUBMISSION_NOT_FOUND", "投稿不存在。");
  return {
    ...serializePluginSubmission(submission),
    marketStatus: submission.plugin?.status ?? null,
    url: link("/api/v1/me/plugin-submissions"),
    marketUrl: submission.plugin?.status === "published" ? link("/v1/plugins") : null,
    marketId: submission.pluginId,
  };
}

/** Deterministic field validation; semantic extraction stays in the local Skill. */
function prepareActivity(article: string, fields: Data = {}, source?: z.infer<typeof sourceSchema>) {
  const heading = /^#\s+(.+)$/m.exec(article)?.[1]?.trim();
  const provided = { ...(heading ? { title: heading } : {}), ...fields, content: typeof fields.content === "string" ? fields.content : article };
  const parsed = activityInputSchema.safeParse(provided);
  const required = ["title", "summary", "mode", "location", "startsAt", "endsAt", "registrationOpensAt", "registrationClosesAt", "capacity"];
  return {
    ready: parsed.success,
    missingFields: required.filter(field => !(field in provided) || (provided as Data)[field] === "" || (provided as Data)[field] == null),
    validationErrors: parsed.success ? [] : parsed.error.issues.map(issue => ({ field: issue.path.join("."), message: issue.message })),
    provided: parsed.success ? parsed.data : provided,
    source: source ?? { key: `article:${requestHash(article)}` },
  };
}

function definitions(actor: McpActor): Definition[] {
  const result: Definition[] = [];
  function add<S extends z.ZodType>(name: string, description: string, schema: S, invoke: (args: z.infer<S>) => Promise<Data>, options: { permission?: string; write?: boolean; destructive?: boolean } = {}) {
    result.push({
      permission: options.permission,
      tool: {
        name, description,
        inputSchema: z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as Tool["inputSchema"],
        annotations: { readOnlyHint: !options.write, destructiveHint: options.destructive ?? false, idempotentHint: true, openWorldHint: ["club_validate_plugin_package", "club_submit_plugin", "club_update_market_plugin", "club_publish_market_plugin"].includes(name) },
      },
      invoke: async args => {
        if (options.permission) requireMcpPermission(actor, options.permission);
        const parsed = schema.safeParse(args ?? {});
        if (!parsed.success) throw new McpBusinessError(400, "INVALID_ARGUMENTS", "工具参数不完整或无效。", {
          validationErrors: parsed.error.issues.map(issue => ({ field: issue.path.join("."), message: issue.message })),
        });
        return invoke(parsed.data);
      },
    });
  }
  const empty = z.object({}).strict();
  const writeActivity = { permission: activityPermission, write: true };
  const writePlugin = { permission: pluginPermission, write: true };

  add("club_list_activities", "查询官网公开活动及其状态、时间和报名条件。", z.object({ limit: z.number().int().min(1).max(100).default(30) }).strict(), async ({ limit }) => {
    const data = await listPublicActivities(limit);
    return { items: data.items.map(activityResult) };
  });
  add("club_get_activity", "读取公开活动的真实状态与 Markdown 详情。", z.object({ id }).strict(), async ({ id }) => activityResult(await getPublicActivity(id)));
  add("club_list_managed_activities", "查询可管理的官网活动；管理范围与官网 activity:publish 权限一致。", z.object({
    page: z.number().int().min(1).max(1_000_000).default(1), limit: z.number().int().min(1).max(100).default(20),
    status: z.enum(managedActivityFilters).default("all"), search: z.string().trim().max(200).default(""),
  }).strict(), async ({ page, limit, status, search }) => {
    const data = await listManagedActivities({ page, limit, filter: status, search });
    return { ...data, items: data.items.map(activityResult) };
  }, { permission: activityPermission });
  add("club_get_managed_activity", "读取活动草稿或已发布活动，用于编辑和发布后核验。", z.object({ id }).strict(), async ({ id }) => {
    const activity = await getManagedActivity(id);
    const sources = await prisma.clubMcpSource.findMany({ where: { activityId: id }, select: { sourceKey: true, sourceUrl: true, title: true } });
    return { ...activityResult(activity), sources };
  }, { permission: activityPermission });
  add("club_prepare_activity", "把文章正文作为 Markdown 活动详情，校验 Skill 提取的字段并列出全部待补项；此工具不保存或发布。", z.object({
    article: z.string().min(1).max(20_000), fields: z.record(z.string(), z.unknown()).optional(), source: sourceSchema.optional(),
  }).strict(), async ({ article, fields, source }) => prepareActivity(article, fields, source));
  add("club_create_activity", "保存完整活动草稿，保留文章来源。相同 requestKey 返回原结果；同一 source.key 不会创建第二个活动。", z.object({
    input: activityInputSchema, source: sourceSchema.optional(), requestKey,
  }).strict(), async ({ input, source, requestKey }) => runMcpWrite(actor, "club_create_activity", requestKey, { input, source }, async tx => {
    if (source) {
      const existing = await tx.clubMcpSource.findUnique({ where: { actorIssuer_actorSub_sourceKey: { actorIssuer: actor.issuer, actorSub: actor.sub, sourceKey: source.key } }, include: { activity: true } });
      if (existing) {
        if (existing.activity.deletedAt) throw new McpBusinessError(409, "SOURCE_ALREADY_USED", "此文章来源关联的活动已删除，请明确新活动的来源键。", { activityId: existing.activityId });
        return { ...activityResult(serializeActivity(existing.activity)), source: { key: existing.sourceKey, url: existing.sourceUrl, title: existing.title }, sourceReused: true };
      }
    }
    const activity = await createActivity(input, actor, tx);
    if (source) await tx.clubMcpSource.create({ data: { actorIssuer: actor.issuer, actorSub: actor.sub, sourceKey: source.key, sourceUrl: source.url, title: source.title, activityId: activity.id } });
    return { ...activityResult(activity), source: source ?? null, sourceReused: false };
  }), writeActivity);
  add("club_update_activity", "编辑活动的完整字段；复用官网状态、时间和容量校验。", z.object({ id, input: activityInputSchema, requestKey }).strict(),
    async ({ id, input, requestKey }) => runMcpWrite(actor, "club_update_activity", requestKey, { id, input }, async tx => activityResult(await updateActivity(id, input, actor, tx))), writeActivity);
  add("club_publish_activity", "按用户明确授权发布活动草稿。返回已发布状态与官网链接；重试不会重复发布或重写发布时间。", z.object({ id, requestKey }).strict(),
    async ({ id, requestKey }) => runMcpWrite(actor, "club_publish_activity", requestKey, { id }, async tx => {
      const existing = await tx.clubActivity.findFirst({ where: { id, deletedAt: null } });
      if (existing?.status === "published") return activityResult(serializeActivity(existing));
      return activityResult(await publishActivity(id, actor, tx));
    }), writeActivity);
  const registrationSchema = z.object({ id, requestKey }).strict();
  async function registrationResult(id: string, tx: Prisma.TransactionClient) {
    const registration = await tx.clubActivityRegistration.findUnique({ where: { activityId_userIssuer_userSub: { activityId: id, userIssuer: actor.issuer, userSub: actor.sub } } });
    return {
      id: registration?.id ?? null, activityId: id, status: registration?.status ?? "not_registered",
      registered: registration?.status === "confirmed", url: link(`/activities/${id}`),
    };
  }
  add("club_register_activity", "以当前登录用户报名；报名时间、活动状态、容量及重复报名规则与官网一致。", registrationSchema,
    async ({ id, requestKey }) => runMcpWrite(actor, "club_register_activity", requestKey, { id }, async tx => {
      await registerForActivity(id, actor, tx); return registrationResult(id, tx);
    }), { write: true });
  add("club_cancel_registration", "取消当前登录用户的活动报名；重复取消不会重复减少名额。", registrationSchema,
    async ({ id, requestKey }) => runMcpWrite(actor, "club_cancel_registration", requestKey, { id }, async tx => {
      await cancelActivityRegistration(id, actor, tx); return registrationResult(id, tx);
    }), { write: true, destructive: true });
  add("club_my_registrations", "查询当前登录用户的报名记录、真实状态和活动链接。", empty, async () => {
    const data = await listMyActivityRegistrations(actor);
    return { items: data.items.map(item => ({ ...item, activity: activityResult(item.activity), url: link(`/activities/${item.activity.id}`) })) };
  });
  add("club_activity_registrations", "查询活动的已确认报名名单；需要官网活动管理权限。", z.object({ id }).strict(), async ({ id }) => listActivityRegistrations(id), { permission: activityPermission });
  add("club_validate_plugin_package", "验证公开 npm 包名称、最新版本及下载地址，不下载或执行代码，不发布 npm 包。", z.object({ packageName: pluginInputSchema.shape.packageName }).strict(),
    async ({ packageName }) => ({ ...await validateNpmPackage(packageName) }));
  add("club_submit_plugin", "提交插件资料到官网审核队列。不会执行 npm 发布、审核或市场上架；requestKey 在重试时必须保持不变。", z.object({ input: pluginInputSchema, requestKey }).strict(),
    async ({ input, requestKey }) => {
      let npm: NpmPackageValidation;
      return runMcpWrite(actor, "club_submit_plugin", requestKey, { input }, async tx => {
        const submission = await createPluginSubmission(input, actor, tx);
        return { ...await submissionResult(submission.id, actor, tx), npm };
      }, async () => { npm = await validateNpmPackage(input.packageName); });
    }, { write: true });
  add("club_my_plugin_submissions", "查询本人投稿及审核备注、关联市场条目的实际状态；approved 表示审核通过，不代表上架。", empty, async () => {
    const items = await prisma.pluginSubmission.findMany({ where: { submittedByIssuer: actor.issuer, submittedBySub: actor.sub }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100, select: { id: true } });
    return { items: await Promise.all(items.map(item => submissionResult(item.id, actor))) };
  });
  add("club_get_plugin_submission", "查询本人某项投稿的审核结果和关联市场状态；不能读取其他用户的投稿。", z.object({ id }).strict(), async ({ id }) => submissionResult(id, actor));

  if (process.env.CQAI_MCP_ADMIN_TOOLS_ENABLED === "true") {
    add("club_list_plugin_submissions", "管理员查询投稿审核队列。", z.object({ status: z.enum(["pending", "approved", "rejected", "all"]).default("pending"), page: z.number().int().min(1).max(1_000_000).default(1), limit: z.number().int().min(1).max(100).default(20) }).strict(),
      async ({ status, page, limit }) => { const data = await listPluginSubmissions(status, page, limit); return { ...data, data: await Promise.all(data.data.map(item => submissionResult(item.id, actor, prisma, true))) }; }, { permission: pluginPermission });
    add("club_review_plugin_submission", "管理员审核投稿。approve 仅创建市场草稿；reject 必须提供退回原因。", z.object({ id, decision: z.enum(["approve", "reject"]), note: z.string().trim().max(1000).regex(/^[^\u0000-\u001f\u007f-\u009f]*$/).default(""), requestKey }).strict(),
      async ({ id, decision, note, requestKey }) => runMcpWrite(actor, "club_review_plugin_submission", requestKey, { id, decision, note }, async tx => {
        if (decision === "reject" && !note) throw new McpBusinessError(400, "REVIEW_NOTE_REQUIRED", "退回投稿时请填写原因。");
        await reviewPluginSubmission(id, decision, note, actor, tx);
        return submissionResult(id, actor, tx, true);
      }), writePlugin);
    add("club_update_market_plugin", "管理员编辑市场条目资料；保持其现有上架状态。", z.object({ id, input: pluginInputSchema, requestKey }).strict(),
      async ({ id, input, requestKey }) => {
        let npm: NpmPackageValidation;
        return runMcpWrite(actor, "club_update_market_plugin", requestKey, { id, input }, async tx => {
          const existing = await tx.plugin.findUnique({ where: { id } });
          if (!existing) throw new McpBusinessError(404, "PLUGIN_NOT_FOUND", "市场插件不存在。");
          const plugin = await tx.plugin.update({ where: { id }, data: pluginDbData(input) });
          return { ...serializePlugin(plugin), npm, url: link("/member/dashboard/admin/plugins"), marketUrl: plugin.status === "published" ? link("/v1/plugins") : null };
        }, async () => { npm = await validateNpmPackage(input.packageName); });
      }, writePlugin);
    add("club_publish_market_plugin", "管理员正式上架已有市场条目；重复执行保持原发布时间。此操作不会发布 npm 包。", z.object({ id, requestKey }).strict(),
      async ({ id, requestKey }) => {
        let npm: NpmPackageValidation | undefined;
        return runMcpWrite(actor, "club_publish_market_plugin", requestKey, { id }, async tx => {
          const current = await tx.plugin.findUnique({ where: { id } });
          if (!current) throw new McpBusinessError(404, "PLUGIN_NOT_FOUND", "市场插件不存在。");
          if (current.status !== "published" && npm?.name !== current.packageName) throw new McpBusinessError(409, "PLUGIN_CHANGED", "插件资料已变化，请用相同 requestKey 重试。");
          const plugin = current.status === "published" ? current : await tx.plugin.update({ where: { id }, data: { status: "published", publishedAt: new Date() } });
          return { ...serializePlugin(plugin), ...(npm ? { npm } : {}), url: link("/member/dashboard/admin/plugins"), marketUrl: link("/v1/plugins") };
        }, async () => {
          const current = await prisma.plugin.findUnique({ where: { id } });
          if (!current) throw new McpBusinessError(404, "PLUGIN_NOT_FOUND", "市场插件不存在。");
          if (current.status !== "published") npm = await validateNpmPackage(current.packageName);
        });
      }, writePlugin);
  }
  return result;
}

export function requiredToolPermission(name: string, actor: McpActor): string | undefined {
  return definitions(actor).find(item => item.tool.name === name)?.permission;
}

function failure(error: unknown): CallToolResult {
  const known = error instanceof ActivityError || error instanceof PluginSubmissionError;
  const data = {
    code: known ? error.code : "MCP_INTERNAL_ERROR",
    error: known ? error.message : "工具执行失败，请用相同 requestKey 重试或查询真实记录。",
    ...(error instanceof McpBusinessError ? error.details : {}),
  };
  if (!known) console.error("CQAI MCP tool failed:", error);
  return { isError: true, structuredContent: data, content: [{ type: "text", text: JSON.stringify(data) }] };
}

/** A fresh server per HTTP request keeps actor identity out of shared sessions. */
export function createClubMcpServer(actor: McpActor): Server {
  const server = new Server({ name: "cqai-club", version: "1.0.0" }, { capabilities: { tools: {} }, instructions: "复用官网身份权限。发布和报名须符合用户授权。所有写操作需要稳定 requestKey；失败重试保持该键。操作重放返回原结果快照，随后用查询工具读取当前状态。投稿批准只产生市场草稿，正式上架需管理员独立执行。" });
  const tools = definitions(actor);
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: tools.map(item => item.tool) }));
  server.setRequestHandler(CallToolRequestSchema, async request => {
    const tool = tools.find(item => item.tool.name === request.params.name);
    if (!tool) return failure(new McpBusinessError(404, "TOOL_NOT_FOUND", "工具不存在或当前部署未启用。"));
    try {
      const data = await tool.invoke(request.params.arguments);
      return { structuredContent: data, content: [{ type: "text", text: JSON.stringify(data) }] };
    } catch (error) { return failure(error); }
  });
  return server;
}
