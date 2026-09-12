import { PrismaClient } from "@prisma/client";

/**
 * Prisma singleton shared by the official-site API route handlers.
 * Reuses the client across hot-reloads in dev to avoid exhausting SQLite
 * connections; production keeps a single process-wide instance.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
