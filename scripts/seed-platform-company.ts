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
    // The Fee Free logo (shown on DIRECT invoices). This is the same green
    // FF-rocket mark already in use; a superadmin can change it anytime at
    // /superadmin/settings/company → "Logo URL".
    const FF_LOGO = "https://1onxkssoxjxfkvnp.public.blob.vercel-storage.com/reseller/cmp91sarx00010alc8fcf2di8/1782195727492-0e9nic.png";
    const existing = await prisma.platformSettings.findUnique({
      where: { id: "singleton" },
      select: { companyLegalName: true, companyLogoUrl: true },
    }).catch(() => null);
    // Only fill fields that are empty — never overwrite a superadmin's edit.
    const data: Record<string, string> = {};
    if (!existing?.companyLegalName?.trim()) data.companyLegalName = "Fee Free Ordering Inc.";
    if (!existing?.companyLogoUrl?.trim()) data.companyLogoUrl = FF_LOGO;
    if (Object.keys(data).length === 0) {
      console.log(`Nothing to seed — companyLegalName + companyLogoUrl already set.`);
      return;
    }
    await prisma.platformSettings.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", ...data },
      update: data,
    });
    console.log(`✅ Seeded: ${Object.keys(data).join(", ")} (legal name "Fee Free Ordering Inc.", no tax number — Canada).`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
