import { Prisma, type PluginSubmission } from "@prisma/client";

import type { ActivityActor } from "@/lib/club-activities";
import { pluginDbData, pluginInputSchema, type PluginInput } from "@/lib/plugin-market";
import { prisma } from "@/lib/site/prisma";

export const PLUGIN_SUBMISSION_STATUSES = ["pending", "approved", "rejected"] as const;
export type PluginSubmissionStatus = (typeof PLUGIN_SUBMISSION_STATUSES)[number];

export class PluginSubmissionError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = "PluginSubmissionError";
  }
}

export function parsePluginSubmission(value: unknown): PluginInput {
  const parsed = pluginInputSchema.safeParse(value);
  if (!parsed.success) {
    throw new PluginSubmissionError(400, "INVALID_PLUGIN", parsed.error.issues[0]?.message ?? "插件信息无效。");
  }
  return parsed.data;
}

export function serializePluginSubmission(submission: PluginSubmission) {
  const input = parsePluginSubmission(JSON.parse(submission.payloadJson) as unknown);
  return {
    id: submission.id,
    status: submission.status,
    ...input,
    submittedByName: submission.submittedByName,
    reviewNote: submission.reviewNote,
    pluginId: submission.pluginId,
    createdAt: submission.createdAt.toISOString(),
    updatedAt: submission.updatedAt.toISOString(),
    reviewedAt: submission.reviewedAt?.toISOString() ?? null,
  };
}

export async function createPluginSubmission(input: PluginInput, actor: ActivityActor, database: Prisma.TransactionClient = prisma) {
  const existing = await database.plugin.findUnique({ where: { packageName: input.packageName }, select: { id: true } });
  if (existing) throw new PluginSubmissionError(409, "PLUGIN_EXISTS", "该 npm 包已在插件市场中。");

  try {
    const submission = await database.pluginSubmission.create({
      data: {
        packageName: input.packageName,
        payloadJson: JSON.stringify(input),
        submittedByIssuer: actor.issuer,
        submittedBySub: actor.sub,
        submittedByName: actor.displayName,
      },
    });
    return serializePluginSubmission(submission);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new PluginSubmissionError(409, "SUBMISSION_PENDING", "该 npm 包已有待审核投稿。");
    }
    throw error;
  }
}

export async function listMyPluginSubmissions(actor: ActivityActor) {
  const submissions = await prisma.pluginSubmission.findMany({
    where: { submittedByIssuer: actor.issuer, submittedBySub: actor.sub },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100,
  });
  return submissions.map(serializePluginSubmission);
}

export async function listPluginSubmissions(status: PluginSubmissionStatus | "all" = "pending", page = 1, limit = 20) {
  const where = status === "all" ? undefined : { status };
  const [total, submissions] = await prisma.$transaction([
    prisma.pluginSubmission.count({ where }),
    prisma.pluginSubmission.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * limit,
    take: limit,
    }),
  ]);
  return { data: submissions.map(serializePluginSubmission), total, page, totalPages: Math.ceil(total / limit) };
}

export async function reviewPluginSubmission(
  id: string,
  decision: "approve" | "reject",
  note: string,
  reviewer: ActivityActor,
  transaction?: Prisma.TransactionClient,
) {
  const reviewedAt = new Date();
  try {
    const review = async (tx: Prisma.TransactionClient) => {
      const current = await tx.pluginSubmission.findUnique({ where: { id } });
      if (!current) throw new PluginSubmissionError(404, "SUBMISSION_NOT_FOUND", "投稿不存在。");
      if (current.status !== "pending") throw new PluginSubmissionError(409, "ALREADY_REVIEWED", "该投稿已审核。");

      let pluginId: string | null = null;
      if (decision === "approve") {
        const input = parsePluginSubmission(JSON.parse(current.payloadJson) as unknown);
        // Approval only creates a draft. Publication remains an explicit admin action.
        const plugin = await tx.plugin.create({ data: { ...pluginDbData(input), status: "draft" } });
        pluginId = plugin.id;
      }

      const result = await tx.pluginSubmission.updateMany({
        where: { id, status: "pending" },
        data: {
          status: decision === "approve" ? "approved" : "rejected",
          reviewedAt,
          reviewedByIssuer: reviewer.issuer,
          reviewedBySub: reviewer.sub,
          reviewNote: note || null,
          pluginId,
        },
      });
      if (result.count !== 1) throw new PluginSubmissionError(409, "ALREADY_REVIEWED", "该投稿已审核。");
      const updated = await tx.pluginSubmission.findUniqueOrThrow({ where: { id } });
      return serializePluginSubmission(updated);
    };
    return await (transaction ? review(transaction) : prisma.$transaction(review));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new PluginSubmissionError(409, "PLUGIN_EXISTS", "该 npm 包已在插件市场中。");
    }
    throw error;
  }
}
