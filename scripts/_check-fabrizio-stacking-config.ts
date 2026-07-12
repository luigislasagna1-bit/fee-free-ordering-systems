/**
 * READ-ONLY prod check for the exclusive-stacking report (Fabrizio, TODO 🟠):
 * print every active promotion on ristorante-test with its stackingRule +
 * type — the fix is deployed, so if his symptoms persist the likely cause is
 * config (bundle not actually flagged "exclusive", or a promo mislabeled
 * "master"). No writes.
 *   npx tsx scripts/run-on-prod.ts scripts/_check-fabrizio-stacking-config.ts
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

  const restaurants = await prisma.restaurant.findMany({
    where: { slug: { contains: "ristorante" } },
    select: { id: true, name: true, slug: true, parentRestaurantId: true, useBrandMenu: true },
    take: 3,
  });

  for (const r of restaurants) {
    console.log(`\n=== ${r.name} (${r.slug}) parent=${r.parentRestaurantId ?? "-"} useBrandMenu=${r.useBrandMenu} ===`);
    const promos = await prisma.promotion.findMany({
      where: { restaurantId: r.id },
      select: {
        id: true, name: true, promotionType: true, stackingRule: true, isActive: true,
        autoApply: true, minimumOrder: true, highlightThreshold: true, startsAt: true, endsAt: true,
      },
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
      take: 30,
    });
    for (const p of promos) {
      console.log(
        `  ${(p.stackingRule ?? "?").padEnd(9)} ${p.promotionType.padEnd(24)} active=${String(p.isActive).padEnd(5)} auto=${String(p.autoApply).padEnd(5)} min=${String(p.minimumOrder ?? 0).padEnd(6)} "${p.name}"` +
        (p.startsAt || p.endsAt ? ` window=${p.startsAt?.toISOString().slice(0, 10) ?? "-"}..${p.endsAt?.toISOString().slice(0, 10) ?? "-"}` : "")
      );
    }
  }

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
