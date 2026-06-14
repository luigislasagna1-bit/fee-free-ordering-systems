/**
 * READ-ONLY: verify the prod DB has the Reservation.alertAt column before
 * pushing R2 part B code. Luigi 2026-06-14.
 *   npx tsx scripts/check-reservation-alertat.ts
 */
import { readFileSync } from "node:fs";
import { config as dotenvConfig } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

function resolveUrl(): string {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*#\s*DATABASE_URL\s*=\s*"([^"]+)"/);
    if (m) return m[1];
  }
  dotenvConfig({ path: ".env.local" });
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  throw new Error("No DATABASE_URL");
}

async function main() {
  const url = resolveUrl();
  console.log(`Checking: ${url.replace(/:[^:@]+@/, ":****@")}`);
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  try {
    await prisma.reservation.findFirst({ select: { id: true, alertAt: true } });
    console.log("OK  PROD has Reservation.alertAt — safe to push R2 part B code.");
  } catch (e: any) {
    console.log("MISSING  PROD does NOT have Reservation.alertAt yet:", String(e?.message).slice(0, 140));
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
