/**
 * Seed the platform legal-entity identity on PlatformSettings so the invoice
 * ISSUER value is config-driven (not just the code fallback). Idempotent —
 * only fills fields that are currently empty, so a superadmin edit is never
 * overwritten. Luigi 2026-07-02: "Fee Free Ordering Inc." (Canada, no VAT).
 *   npx tsx scripts/seed-platform-company.ts                      # active DB (dev)
 *   npx tsx scripts/run-on-prod.ts scripts/seed-platform-company.ts  # prod
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  try {
    const existing = await prisma.platformSettings.findUnique({
      where: { id: "singleton" },
      select: { companyLegalName: true },
    }).catch(() => null);
    if (existing?.companyLegalName?.trim()) {
      console.log(`companyLegalName already set ("${existing.companyLegalName}") — leaving as-is.`);
      return;
    }
    await prisma.platformSettings.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", companyLegalName: "Fee Free Ordering Inc." },
      update: { companyLegalName: "Fee Free Ordering Inc." },
    });
    console.log(`✅ Set PlatformSettings.companyLegalName = "Fee Free Ordering Inc." (no tax number — Canada).`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
