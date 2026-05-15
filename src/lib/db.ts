import { PrismaClient } from "@/generated/prisma/client";
import path from "node:path";

function createPrismaClient(): PrismaClient {
  const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");
  // Fallback to the project-root dev.db (matches .env's DATABASE_URL="file:./dev.db")
  // rather than the legacy prisma/dev.db location, so a missing .env doesn't
  // silently route us to an empty database.
  const dbUrl = process.env.DATABASE_URL || `file:${path.join(process.cwd(), "dev.db")}`;
  const adapter = new PrismaBetterSqlite3({ url: dbUrl });
  return new PrismaClient({ adapter } as any);
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
