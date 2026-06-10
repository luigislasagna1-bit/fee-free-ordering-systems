/**
 * Diagnostic: for restaurants with a marketplace listing, print whether the
 * channel picker will show — i.e. the real isOnMarketplace() result (listing
 * isListed + payg, OR monthly + an active add-on granting marketplace_listing).
 * Read-only.
 *   npx tsx scripts/run-on-prod.ts scripts/check-marketplace-status.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaNeon } from "@prisma/adapter-neon";

config({ path: ".env.local" });
config({ path: ".env" });

const url = process.argv[2] || process.env.DATABASE_URL;
if (!url) { console.error("No DATABASE_URL"); process.exit(1); }
const GRANTING = ["active", "trialing"];

async function main() {
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url!);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url! }) : new PrismaPg({ connectionString: url! });
  const prisma = new PrismaClient({ adapter } as any);
  try {
    const rows = await prisma.restaurant.findMany({
      where: { marketplaceListing: { isListed: true } },
      select: {
        id: true, name: true, slug: true,
        marketplaceListing: { select: { isListed: true, billingMode: true } },
      },
    });
    for (const r of rows) {
      const l = r.marketplaceListing!;
      // Replicate hasFeature("marketplace_listing")
      const addOns = await prisma.restaurantAddOn.findMany({
        where: { restaurantId: r.id, status: { in: GRANTING } },
        select: { status: true, addOn: { select: { name: true, enabledFeatures: true } } },
      });
      const feats = new Set<string>();
      for (const a of addOns) { try { for (const f of JSON.parse(a.addOn.enabledFeatures || "[]")) feats.add(f); } catch {} }
      const hasMp = feats.has("marketplace_listing");
      const onMp = l.billingMode === "payg" ? true : hasMp;
      console.log(`${onMp ? "✅ PICKER SHOWS" : "❌ picker hidden"} — ${r.name} (${r.slug}) — mode:${l.billingMode}, active add-ons:[${addOns.map((a) => a.addOn.name).join(", ") || "none"}], marketplace_listing granted: ${hasMp}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
