/** READ-ONLY: inspect today's orders for luigis — item count, notes, and any
 *  unusual/long/non-ASCII content that could blow up the print-bitmap render on
 *  the old Android tablet. Targets PROD (dawn-tree). */
import { readFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

function prodUrl(): string | null {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*#?\s*DATABASE_URL\s*=\s*"([^"]+)"/);
    if (m && m[1].includes("dawn-tree")) return m[1];
  }
  return null;
}

async function main() {
  const url = prodUrl();
  if (!url) { console.error("no prod (dawn-tree) URL found"); process.exit(1); }
  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: url! }) } as any);
  try {
    const r = await prisma.restaurant.findFirst({
      where: { slug: "luigis-lasagna-pizzeria" }, select: { id: true, name: true },
    });
    if (!r) { console.log("restaurant not found"); return; }
    // Today (America/Toronto ~ UTC-4): look back 36h to be safe.
    const since = new Date(Date.now() - 36 * 3600 * 1000);
    const orders = await prisma.order.findMany({
      where: { restaurantId: r.id, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      select: {
        orderNumber: true, createdAt: true, status: true, type: true,
        customerName: true, notes: true, total: true,
        items: { select: { name: true, quantity: true, notes: true, modifiers: true, variantName: true, bundleItems: true } },
      },
    });
    console.log(`${r.name}: ${orders.length} order(s) in the last 36h\n`);
    for (const o of orders) {
      const optionsText = o.items.map((i) => JSON.stringify(i.modifiers ?? "") + JSON.stringify(i.bundleItems ?? "")).join("");
      const allText = [o.notes ?? "", ...o.items.map((i) => `${i.name} ${i.notes ?? ""}`), optionsText].join(" ");
      const nonAscii = [...allText].filter((c) => c.charCodeAt(0) > 127);
      console.log(`— ${o.orderNumber}  ${o.createdAt.toISOString().slice(0, 16)}  ${o.status}/${o.type}  ${o.customerName ?? ""}`);
      console.log(`    items=${o.items.length}  totalQty=${o.items.reduce((n, i) => n + (i.quantity ?? 1), 0)}  ticketTextLen=${allText.length}  nonAsciiChars=${nonAscii.length}${nonAscii.length ? " [" + [...new Set(nonAscii)].slice(0, 20).join("") + "]" : ""}`);
      if (o.notes) console.log(`    order-notes(${o.notes.length}): ${JSON.stringify(o.notes.slice(0, 120))}`);
      for (const i of o.items) {
        const optLen = JSON.stringify(i.selectedOptions ?? "").length;
        if ((i.notes && i.notes.length > 40) || optLen > 300) {
          console.log(`      • ${i.name} x${i.quantity}  noteLen=${i.notes?.length ?? 0}  optionsJsonLen=${optLen}`);
        }
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
