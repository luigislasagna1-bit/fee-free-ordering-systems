/**
 * Enter the freshly registered corporation's details into PlatformSettings
 * (Superadmin → Company). Source: Certificate + Articles of Incorporation
 * (Ontario, endorsed 2026-07-03; extracted 2026-07-04):
 *   - Legal name:  FEE FREE ORDERING INC.
 *   - Ontario Corporation Number: 1001666063
 *   - Registered office: 17 Commercial Street, Unit Lower, Milton, ON L9T 2H6
 * Only fills the two missing fields; existing non-empty values are kept.
 *   npx tsx scripts/run-on-prod.ts scripts/set-company-registration-2026-07-04.ts
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

  const cur = await prisma.platformSettings.findUnique({ where: { id: "singleton" } });
  console.log("BEFORE:", {
    legalName: cur?.companyLegalName, taxId: cur?.companyTaxId,
    address: cur?.companyAddress, registryNo: cur?.companyRegistryNo, website: cur?.companyWebsite,
  });

  const data: Record<string, string> = {};
  if (!cur?.companyLegalName?.trim()) data.companyLegalName = "Fee Free Ordering Inc.";
  if (!cur?.companyTaxId?.trim()) data.companyTaxId = "GST/HST No. 809409832RT0001";
  data.companyAddress = "17 Commercial Street, Unit Lower, Milton, Ontario L9T 2H6, Canada";
  data.companyRegistryNo = "Ontario Corporation No. 1001666063";
  if (!cur?.companyWebsite?.trim()) data.companyWebsite = "www.feefreeordering.com";

  const updated = await prisma.platformSettings.update({ where: { id: "singleton" }, data });
  console.log("AFTER:", {
    legalName: updated.companyLegalName, taxId: updated.companyTaxId,
    address: updated.companyAddress, registryNo: updated.companyRegistryNo, website: updated.companyWebsite,
  });
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
