import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 uses driver adapters even for first-party Postgres. The pg adapter
// wraps the standard `pg` Node driver and gives Prisma a connection it can
// stream queries through. DATABASE_URL is read once at module load — the
// global singleton pattern below stops HMR from opening a new connection
// pool on every dev-server file change.

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  // Diagnostic: in production, log whether DATABASE_URL is present so a
  // "missing env var" misconfiguration is visible in Vercel logs instead of
  // failing silently inside NextAuth.
  if (process.env.NODE_ENV === "production") {
    const masked = connectionString
      ? connectionString.replace(/:[^:@]+@/, ":****@").slice(0, 80) + "…"
      : "(undefined)";
    // eslint-disable-next-line no-console
    console.error("[prisma init] DATABASE_URL:", masked);
  }
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Add it to .env.local — see .env.example.");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter } as any);
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
