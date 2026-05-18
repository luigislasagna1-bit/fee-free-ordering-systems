import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaNeon } from "@prisma/adapter-neon";

/**
 * Prisma client construction.
 *
 * Prisma 7 uses driver adapters even for first-party Postgres. We pick the
 * adapter based on the connection string:
 *
 *   - Neon connection strings (host contains "neon.tech") → PrismaNeon adapter,
 *     which speaks Neon's HTTP-based serverless protocol. This avoids the
 *     `channel_binding=require` incompatibility that the standard pg driver
 *     hit on Vercel + Neon pooled connections, and is faster to cold-start
 *     on serverless (no TCP handshake).
 *
 *   - Any other Postgres host → PrismaPg adapter (standard node-postgres).
 *     Used for local development against vanilla Postgres or non-Neon hosts.
 *
 * DATABASE_URL is read once at module load. The global singleton pattern
 * stops HMR from opening new connection pools on every dev-server file change.
 */

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    if (process.env.NODE_ENV === "production") {
      // eslint-disable-next-line no-console
      console.error("[prisma init] DATABASE_URL is missing — Prisma will fail to connect.");
    }
    throw new Error("DATABASE_URL is not set. Add it to .env.local — see .env.example.");
  }

  const isNeon = /\.neon\.tech([:/?]|$)/i.test(connectionString);
  const adapter = isNeon
    ? new PrismaNeon({ connectionString })
    : new PrismaPg({ connectionString });

  return new PrismaClient({ adapter } as any);
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
