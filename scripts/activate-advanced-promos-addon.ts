/**
 * Make the Advanced Promo Marketing add-on visible/purchasable in the
 * restaurant Add-ons store by flipping its catalog row to isActive=true.
 * Idempotent — safe to re-run.
 *   npx tsx scripts/run-on-prod.ts scripts/activate-advanced-promos-addon.ts
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

  const row = await prisma.addOn.findUnique({
    where: { slug: "advanced_promos" },
    select: { id: true, name: true, isActive: true, comingSoon: true, monthlyPriceCents: true, stripePriceId: true },
  });
  if (!row) throw new Error("advanced_promos AddOn row not found.");

  // Safety: don't surface a card that can't actually be purchased.
  if (!row.stripePriceId) throw new Error("advanced_promos has no stripePriceId — cannot make purchasable.");
  if (row.monthlyPriceCents <= 0) throw new Error("advanced_promos monthlyPriceCents <= 0 — set a real price first.");

  if (row.isActive) {
    console.log(`Already active — "${row.name}" is visible in the store. Nothing to do.`);
  } else {
    await prisma.addOn.update({
      where: { id: row.id },
      data: { isActive: true, comingSoon: false },
    });
    console.log(`✅ "${row.name}" is now ACTIVE — it will appear in the Add-ons store for every restaurant.`);
  }

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
