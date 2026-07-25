/** READ-ONLY: dump one order's item detail (modifiers/bundle sizes) to see WHY
 *  its kitchen ticket is huge. Targets PROD. Usage: pass order number below. */
import { readFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const ORDER_NUMBER = "ORD-336535031";

function prodUrl(): string | null {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*#?\s*DATABASE_URL\s*=\s*"([^"]+)"/);
    if (m && m[1].includes("dawn-tree")) return m[1];
  }
  return null;
}

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: prodUrl()! }) } as any);
  try {
    const o = await prisma.order.findFirst({
      where: { orderNumber: ORDER_NUMBER },
      select: {
        orderNumber: true, notes: true,
        items: { select: { name: true, quantity: true, variantName: true, notes: true, modifiers: true, bundleItems: true } },
      },
    });
    if (!o) { console.log("not found"); return; }
    for (const [n, i] of o.items.entries()) {
      const modJson = JSON.stringify(i.modifiers ?? null);
      const bundleJson = JSON.stringify(i.bundleItems ?? null);
      console.log(`\n### item ${n + 1}: ${i.name} x${i.quantity} (${i.variantName ?? "-"})`);
      console.log(`  modifiers JSON len=${modJson.length}`);
      console.log(`  bundleItems JSON len=${bundleJson.length}`);
      // How many "lines" would this print? Count array elements at top level.
      const mod = i.modifiers as any;
      if (Array.isArray(mod)) console.log(`  modifiers top-level entries: ${mod.length}`);
      const bun = i.bundleItems as any;
      if (Array.isArray(bun)) console.log(`  bundleItems top-level entries: ${bun.length}`);
      // Print a truncated peek so we can see the shape.
      console.log(`  modifiers peek: ${modJson.slice(0, 600)}`);
      if (bundleJson !== "null") console.log(`  bundleItems peek: ${bundleJson.slice(0, 400)}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
