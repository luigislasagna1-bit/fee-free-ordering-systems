/**
 * READ-ONLY: what share of the voice menu payload is spent on items the agent
 * is NOT ALLOWED TO SELL? v1 transfers pizza-builder and combo items to a human,
 * yet their modifier trees still ride in the prompt on every turn.
 *   npx tsx scripts/run-on-prod.ts scripts/_diag-voice-menu-split-2026-08-10.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const SLUG = process.argv[2] || "luigis-lasagna-pizzeria";
const tok = (n: number) => Math.round(n / 4);

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const r = await prisma.restaurant.findFirst({ where: { slug: SLUG }, select: { id: true, name: true } });
  if (!r) return;

  const cats = await prisma.menuCategory.findMany({
    where: { restaurantId: r.id, isActive: true },
    include: {
      modifierGroups: { where: { menuItemId: null, isHidden: false }, include: { options: { where: { isAvailable: true } } } },
      menuItems: {
        where: { isAvailable: true },
        include: { variants: true, modifierGroups: { where: { isHidden: false }, include: { options: { where: { isAvailable: true } } } } },
      },
    },
  });

  const size = (o: unknown) => JSON.stringify(o).length;
  let sellableChars = 0, transferChars = 0, catModChars = 0;
  let sellableItems = 0, transferItems = 0, transferOptions = 0;

  for (const c of cats) {
    catModChars += size(c.modifierGroups);
    for (const it of c.menuItems) {
      const isTransfer = !!(it as any).isPizza || !!(it as any).isCombo || !!(it as any).pizzaConfig;
      const bytes = size(it);
      if (isTransfer) {
        transferItems++;
        transferChars += bytes;
        for (const g of it.modifierGroups) transferOptions += g.options.length;
      } else {
        sellableItems++;
        sellableChars += bytes;
      }
    }
  }

  const total = sellableChars + transferChars + catModChars;
  console.log(`restaurant: ${r.name}`);
  console.log(`\nSELLABLE by voice:  ${sellableItems} items — ${sellableChars} chars ≈ ${tok(sellableChars)} tokens`);
  console.log(`TRANSFER-ONLY:      ${transferItems} items (pizza/combo) — ${transferChars} chars ≈ ${tok(transferChars)} tokens, ${transferOptions} options`);
  console.log(`CATEGORY modifiers: ${catModChars} chars ≈ ${tok(catModChars)} tokens (shared topping pools — mostly pizza)`);
  console.log(`\ntotal ≈ ${tok(total)} tokens`);
  console.log(`waste (transfer-only + category modifier pools) = ${Math.round(((transferChars + catModChars) / total) * 100)}% of every turn`);

  const lean = tok(sellableChars);
  console.log(`\nIf the prompt carried only what voice can sell: ≈ ${lean} tokens/turn`);
  console.log(`  20-turn call cached, Sonnet 5: $${((lean * (1.25 + 19 * 0.1) * 3) / 1_000_000).toFixed(2)}`);
  console.log(`  20-turn call cached, Haiku 4.5: $${((lean * (1.25 + 19 * 0.1) * 1) / 1_000_000).toFixed(2)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
