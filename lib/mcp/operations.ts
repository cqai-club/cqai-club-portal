import { createHash } from "node:crypto";
import { Prisma, type ClubMcpOperation } from "@prisma/client";

import { ActivityError, type ActivityActor } from "@/lib/club-activities";
import { prisma } from "@/lib/site/prisma";

export class McpBusinessError extends ActivityError {
  constructor(status: number, code: string, message: string, readonly details: Record<string, unknown> = {}) {
    super(status, code, message);
  }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function requestHash(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function resultOf(operation: ClubMcpOperation, hash: string, replayed: boolean) {
  if (operation.requestHash !== hash) {
    throw new McpBusinessError(409, "IDEMPOTENCY_CONFLICT", "此 requestKey 已用于不同的请求，请为新操作使用新键。");
  }
  return {
    ...JSON.parse(operation.resultJson) as Record<string, unknown>,
    operation: { id: operation.id, requestKey: operation.requestKey, replayed, completedAt: operation.createdAt.toISOString() },
  };
}

/** Reserve the key before the write; the reservation, result and business data
 * commit together. Unique constraints also serialize competing processes. */
export async function runMcpWrite(
  actor: ActivityActor,
  tool: string,
  requestKey: string,
  args: unknown,
  perform: (tx: Prisma.TransactionClient) => Promise<Record<string, unknown>>,
  preflight?: () => Promise<void>,
) {
  const key = { actorIssuer: actor.issuer, actorSub: actor.sub, tool, requestKey };
  const where = { actorIssuer_actorSub_tool_requestKey: key };
  const hash = requestHash(args);
  let prepared = false;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const saved = await prisma.clubMcpOperation.findUnique({ where });
    if (saved) return resultOf(saved, hash, true);
    if (!prepared && preflight) { await preflight(); prepared = true; }
    try {
      const operation = await prisma.$transaction(async (tx) => {
        const reserved = await tx.clubMcpOperation.create({ data: { ...key, requestHash: hash } });
        const result = await perform(tx);
        return tx.clubMcpOperation.update({ where: { id: reserved.id }, data: { resultJson: JSON.stringify(result) } });
      }, { maxWait: 5_000, timeout: 10_000 });
      return resultOf(operation, hash, false);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034", "P1008"].includes(error.code)) {
        const saved = await prisma.clubMcpOperation.findUnique({ where });
        if (saved) return resultOf(saved, hash, true);
        if (error.code !== "P2002" && attempt < 3) {
          await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1)));
          continue;
        }
        if (error.code !== "P2002") throw new McpBusinessError(503, "MCP_BUSY", "服务暂时繁忙，请用相同 requestKey 重试。");
      }
      throw error;
    }
  }
  throw new McpBusinessError(503, "MCP_BUSY", "服务暂时繁忙，请用相同 requestKey 重试。");
}
