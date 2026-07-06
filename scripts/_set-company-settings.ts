/* Set the platform company/invoicing identity (PlatformSettings singleton).
 * Only touches the fields passed as flags — everything else (logo URL,
 * address, registry no) is preserved. Run against PROD via:
 *   npx tsx scripts/run-on-prod.ts scripts/_set-company-settings.ts
 * (Luigi 2026-07-03: legal name + GST/HST + website; address/registry pending.)
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);

const data = {
  companyLegalName: "Fee Free Ordering Inc.",
  companyTaxId: "GST/HST No: 809409832RT0001",
  companyWebsite: "www.feefreeordering.com",
};

async function main() {
  const before = await prisma.platformSettings.findUnique({
    where: { id: "singleton" },
    select: {
      companyLegalName: true, companyTaxId: true, companyAddress: true,
      companySupportEmail: true, companyLogoUrl: true, companyRegistryNo: true, companyWebsite: true,
    },
  });
  console.log("before:", before);
  const after = await prisma.platformSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
    select: {
      companyLegalName: true, companyTaxId: true, companyAddress: true,
      companySupportEmail: true, companyLogoUrl: true, companyRegistryNo: true, companyWebsite: true,
    },
  });
  console.log("after:", after);
}
main().finally(() => prisma.$disconnect());
