/**
 * READ-ONLY: dump one order's full state + the same customer's other recent
 * orders, to diagnose an unexpected cancellation. No mutations.
 *   npx tsx scripts/run-on-prod.ts scripts/_dump-order.ts ORD-178033673
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const arg = process.argv[2] || "ORD-178033673";
const bare = arg.replace(/^ORD-/i, "");
const candidates = [...new Set([arg, bare, `ORD-${bare}`])];

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  let order: any = null;
  for (const c of candidates) {
    order = await prisma.order.findFirst({ where: { orderNumber: c } });
    if (order) break;
  }
  if (!order) {
    console.log(`No order found for "${arg}" (tried: ${candidates.join(", ")})`);
    await prisma.$disconnect();
    return;
  }

  console.log(`\n=== ORDER ${order.orderNumber} — full state ===`);
  for (const k of Object.keys(order).sort()) {
    const v = order[k];
    if (v == null) continue;
    const s = typeof v === "string" ? v : v instanceof Date ? v.toISOString() : JSON.stringify(v);
    if (s.length > 0) console.log(`  ${k}: ${s.slice(0, 400)}`);
  }

  // Same customer's other recent orders — to see the "good" re-order right after.
  const or: any[] = [];
  if (order.customerEmail) or.push({ customerEmail: order.customerEmail });
  if (order.customerPhone) or.push({ customerPhone: order.customerPhone });
  if (or.length) {
    const others = await prisma.order.findMany({
      where: { restaurantId: order.restaurantId, id: { not: order.id }, OR: or },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        orderNumber: true, status: true, paymentMethod: true, paymentStatus: true,
        type: true, total: true, createdAt: true, notifiedAt: true,
      },
    });
    console.log(`\n=== SAME CUSTOMER — other recent orders (${others.length}) ===`);
    for (const o of others as any[]) {
      console.log(
        `  ${o.orderNumber} | status=${o.status} | pay=${o.paymentMethod}/${o.paymentStatus} | ${o.type} | $${o.total} | placed ${o.createdAt.toISOString()} | notified=${o.notifiedAt ? o.notifiedAt.toISOString() : "NEVER"}`,
      );
    }
  }

  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
