/** READ-ONLY: how many stores run auto-accept, and how many customers got the wrong email. */
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

  const autoStores = await prisma.restaurant.findMany({
    where: { autoAcceptOrders: true },
    select: { id: true, name: true, slug: true, createdAt: true },
  });
  const totalStores = await prisma.restaurant.count();
  console.log(`STORES total=${totalStores} autoAccept=${autoStores.length}`);
  for (const s of autoStores) console.log(`  AUTO ${s.slug} (${s.name})`);

  // Orders that were RELEASED (customer emailed) while already accepted — i.e. got
  // the "awaiting confirmation" copy on an order the kitchen had already taken.
  const ids = autoStores.map((s) => s.id);
  if (ids.length) {
    const since = new Date(Date.now() - 90 * 86400_000);
    const affected = await prisma.order.count({
      where: { restaurantId: { in: ids }, notifiedAt: { not: null }, acceptedAt: { not: null }, createdAt: { gte: since } },
    });
    const all = await prisma.order.count({
      where: { restaurantId: { in: ids }, notifiedAt: { not: null }, createdAt: { gte: since } },
    });
    console.log(`ORDERS(90d, auto-accept stores) released=${all} of which already-accepted-at-release=${affected}`);

    // Distinct customers who received it.
    const rows = await prisma.order.findMany({
      where: { restaurantId: { in: ids }, notifiedAt: { not: null }, acceptedAt: { not: null }, createdAt: { gte: since } },
      select: { customerEmail: true },
    });
    const emails = new Set(rows.map((r) => (r.customerEmail || "").toLowerCase()).filter(Boolean));
    console.log(`DISTINCT customers who got the wrong copy (90d): ${emails.size}`);

    // Earliest affected order still on record — how long has this been happening?
    const first = await prisma.order.findFirst({
      where: { restaurantId: { in: ids }, notifiedAt: { not: null }, acceptedAt: { not: null } },
      orderBy: { createdAt: "asc" },
      select: { orderNumber: true, createdAt: true },
    });
    console.log(`EARLIEST affected order: ${first?.orderNumber} @ ${first?.createdAt?.toISOString()}`);
  }

  // Sanity: any order where preparationTime disagrees with (estimatedReady - createdAt)?
  // That is the second defect's fingerprint — the email quoted a different number.
  const skew = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
    `SELECT COUNT(*)::bigint AS n FROM "Order"
      WHERE "preparationTime" IS NOT NULL
        AND "estimatedReady" IS NOT NULL
        AND "scheduledFor" IS NULL
        AND ABS(EXTRACT(EPOCH FROM ("estimatedReady" - "createdAt"))/60 - "preparationTime") > 2`,
  );
  console.log(`ORDERS where stored prep != (estimatedReady - createdAt): ${skew?.[0]?.n}`);

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
