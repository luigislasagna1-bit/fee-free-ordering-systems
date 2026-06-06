/**
 * Inspect AddOn catalog rows (visibility/price/stripe) to explain why an
 * add-on does or doesn't appear in the restaurant Add-ons store.
 *   npx tsx scripts/run-on-prod.ts scripts/diag-addon-row.ts [slug]
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const slug = (process.argv[2] || "").trim();
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const rows = await prisma.addOn.findMany({
    where: slug ? { slug } : {},
    orderBy: { displayOrder: "asc" },
    select: {
      slug: true, name: true, isActive: true, comingSoon: true,
      monthlyPriceCents: true, yearlyPriceCents: true, trialDays: true,
      stripePriceId: true, stripeProductId: true, displayOrder: true,
      enabledFeatures: true,
    },
  });
  for (const r of rows) {
    console.log(`\n${r.slug}  "${r.name}"`);
    console.log(`  isActive=${r.isActive}  comingSoon=${r.comingSoon}  displayOrder=${r.displayOrder}`);
    console.log(`  monthly=${r.monthlyPriceCents}  yearly=${r.yearlyPriceCents}  trialDays=${r.trialDays}`);
    console.log(`  stripePriceId=${r.stripePriceId ?? "(none)"}  stripeProductId=${r.stripeProductId ?? "(none)"}`);
    console.log(`  features=${r.enabledFeatures}`);
    const listed = r.isActive;
    console.log(`  >>> shows in store: ${listed ? "YES" : "NO (isActive=false)"}${r.comingSoon ? " — but Coming Soon (subscribe disabled)" : ""}`);
  }
  console.log(`\nTotal rows: ${rows.length}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
