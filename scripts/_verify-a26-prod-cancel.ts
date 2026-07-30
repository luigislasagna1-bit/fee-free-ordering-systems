/** Read-only PROD check for A26: find Luigi's most recent customer-cancelled
 *  order on his live store and print status, attribution, payment fields —
 *  proves the guest self-cancel prod test he just ran landed correctly. */
import { readFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

const env = readFileSync(".env.local", "utf8");
const urls: string[] = [];
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^\s*#?\s*DATABASE_URL\s*=\s*"([^"]+)"/);
  if (m && !urls.includes(m[1])) urls.push(m[1]);
}

async function main() {
  for (const url of urls) {
    const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
    const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
    const p = new PrismaClient({ adapter } as any);
    try {
      const candidates = await p.restaurant.findMany({
        where: { OR: [{ customDomain: { contains: "luigi" } }, { slug: { contains: "luigi" } }, { name: { contains: "Luigi" } }] },
        select: { id: true, name: true, slug: true, customDomain: true, _count: { select: { orders: true } } },
      });
      if (candidates.length === 0) { console.log(`DB ${url.slice(30, 55)}…: no Luigi store`); continue; }
      for (const c of candidates) console.log(`candidate: "${c.name}" slug=${c.slug} domain=${c.customDomain} orders=${c._count.orders}`);
      const r = candidates.sort((a, b) => b._count.orders - a._count.orders)[0];
      const orders = await p.order.findMany({
        where: { restaurantId: r.id, cancelledBy: "customer" },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: {
          orderNumber: true, status: true, cancelledBy: true, createdAt: true,
          placedWhileClosed: true, paymentMethod: true, paymentStatus: true, total: true,
          paymentIntentId: true,
        },
      });
      console.log(`\nstore "${r.name}" (${r.slug}) — ${orders.length} customer-cancelled order(s):`);
      for (const o of orders) {
        console.log(` #${o.orderNumber} ${o.createdAt.toISOString().slice(0, 16)} status=${o.status} closed=${o.placedWhileClosed} pay=${o.paymentMethod}/${o.paymentStatus} total=${o.total} pi=${o.paymentIntentId ? o.paymentIntentId.slice(0, 12) + "…" : "none"}`);
      }
    } catch (e: any) {
      console.log(`DB error: ${String(e?.message).slice(0, 120)}`);
    } finally {
      await p.$disconnect();
    }
  }
}
main();
