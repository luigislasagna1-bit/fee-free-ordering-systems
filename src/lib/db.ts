import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 uses driver adapters even for first-party Postgres. The pg adapter
// wraps the standard `pg` Node driver and gives Prisma a connection it can
// stream queries through. DATABASE_URL is read once at module load — the
// global singleton pattern below stops HMR from opening a new connection
// pool on every dev-server file change.

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    // Log on prod boot so a missing env var is obvious in Vercel logs
    // instead of silently failing inside Prisma. Only fires once per cold
    // start in production — not on every request.
    if (process.env.NODE_ENV === "production") {
      // eslint-disable-next-line no-console
      console.error("[prisma init] DATABASE_URL is missing — Prisma will fail to connect.");
    }
    throw new Error("DATABASE_URL is not set. Add it to .env.local — see .env.example.");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter } as any);
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
