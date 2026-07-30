/** E2E setup for the reorder sold-out fix: find a dev demo order with 2+ distinct
 *  menu items, flag ONE of them sold out, print the status-page URL + expectations.
 *  Rerun with RESET=1 to clear the flag afterwards. */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
config({ path: ".env.local" }); config({ path: ".env" });

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const p = new PrismaClient({ adapter } as any);

  const r = await p.restaurant.findFirst({ where: { slug: "demo-pizza-palace" }, select: { id: true, slug: true } });
  if (!r) { console.log("demo-pizza-palace not found"); return; }

  if (process.env.RESET === "1") {
    const n = await p.menuItem.updateMany({ where: { category: { restaurantId: r.id }, isSoldOut: true }, data: { isSoldOut: false } });
    console.log(`reset: cleared isSoldOut on ${n.count} item(s)`);
    return;
  }

  // Newest order with >= 2 distinct real menu items (skip bundle wrapper rows).
  const orders = await p.order.findMany({
    where: { restaurantId: r.id },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: { id: true, orderNumber: true, createdAt: true, items: { select: { menuItemId: true, name: true } } },
  });
  const pick = orders.find(o => new Set(o.items.map(i => i.menuItemId).filter(Boolean)).size >= 2);
  if (!pick) { console.log("no order with 2+ distinct items found"); return; }
  const ids = [...new Set(pick.items.map(i => i.menuItemId).filter(Boolean))] as string[];
  const soldOutTarget = ids[0];
  await p.menuItem.update({ where: { id: soldOutTarget }, data: { isSoldOut: true } });
  const names = Object.fromEntries((await p.menuItem.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map(m => [m.id, m.name]));
  console.log(`order #${pick.orderNumber} (${pick.id}) items:`);
  for (const id of ids) console.log(`  ${id === soldOutTarget ? "SOLD OUT →" : "kept     →"} ${names[id]}`);
  console.log(`\nstatus page: http://localhost:3001/order/${r.slug}/status/${pick.id}`);
  console.log(`expect on Reorder: kept item(s) added; 1 dropped with the sold-out banner.`);
}
main();
