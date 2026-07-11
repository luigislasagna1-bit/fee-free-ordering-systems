/**
 * Read-only: dump the AddOn catalog (slug, name, price, active, comingSoon)
 * — the source of truth for the marketing-pricing audit.
 *   npx tsx scripts/run-on-prod.ts scripts/_dump-addon-catalog.ts
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
  const rows = await prisma.addOn.findMany({
    orderBy: { displayOrder: "asc" },
    select: { slug: true, name: true, monthlyPriceCents: true, yearlyPriceCents: true, isActive: true, comingSoon: true },
  });
  for (const r of rows) {
    console.log(
      `${r.slug.padEnd(26)} "${r.name}"`.padEnd(62) +
      ` $${(r.monthlyPriceCents / 100).toFixed(2)}/mo` +
      (r.yearlyPriceCents ? ` $${(r.yearlyPriceCents / 100).toFixed(2)}/yr` : "") +
      `  active=${r.isActive} comingSoon=${r.comingSoon}`,
    );
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
