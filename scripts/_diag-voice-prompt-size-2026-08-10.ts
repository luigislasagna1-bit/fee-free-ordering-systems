/**
 * READ-ONLY: how big is the menu payload Nabil re-sends on every turn, before
 * and after the 2026-08-10 cost fix (pizza/combo build trees removed)?
 *   npx tsx scripts/run-on-prod.ts scripts/_diag-voice-prompt-size-2026-08-10.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const SLUG = process.argv[2] || "luigis-lasagna-pizzeria";
/** Rough but consistent: ~4 chars per token for JSON + English. */
const tok = (s: string) => Math.round(s.length / 4);
/** Cost of a 20-turn call: 1 cache write (1.25x) + 19 cache reads (0.1x). */
const callCost = (tokens: number, perMTok: number) =>
  ((tokens * (1.25 + 19 * 0.1) * perMTok) / 1_000_000).toFixed(2);

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const r = await prisma.restaurant.findFirst({ where: { slug: SLUG }, select: { id: true, name: true } });
  if (!r) { console.log("no restaurant", SLUG); return; }

  const cats = await prisma.menuCategory.findMany({
    where: { restaurantId: r.id, isActive: true },
    orderBy: { sortOrder: "asc" },
    include: {
      modifierGroups: {
        where: { menuItemId: null, isHidden: false },
        include: { options: { where: { isAvailable: true } } },
      },
      menuItems: {
        where: { isAvailable: true },
        include: {
          variants: true,
          modifierGroups: { where: { isHidden: false }, include: { options: { where: { isAvailable: true } } } },
        },
      },
    },
  });

  const grp = (gs: any[]) =>
    gs.map((g) => ({
      name: g.name,
      options: g.options.map((o: any) => ({ modifierOptionId: o.id, name: o.name, priceAdjustment: o.priceAdjustment })),
    }));

  const build = (trim: boolean) =>
    cats.map((c) => ({
      category: c.name,
      items: c.menuItems.map((it: any) => {
        const transferOnly = !!it.pizzaConfig || !!it.comboConfig;
        const drop = trim && transferOnly;
        return {
          menuItemId: it.id,
          name: it.name,
          description: it.description ?? null,
          price: it.price,
          isPizza: !!it.pizzaConfig,
          isCombo: !!it.comboConfig,
          variants: drop ? [] : it.variants.map((v: any) => ({ variantId: v.id, name: v.name, price: v.price })),
          modifierGroups: drop ? [] : [...grp(it.modifierGroups), ...grp(c.modifierGroups)],
        };
      }),
    }));

  const before = JSON.stringify(build(false));
  const after = JSON.stringify(build(true));
  const bt = tok(before);
  const at = tok(after);

  let transferItems = 0;
  let transferOptions = 0;
  for (const c of cats) {
    for (const it of c.menuItems as any[]) {
      if (it.pizzaConfig || it.comboConfig) {
        transferItems++;
        for (const g of it.modifierGroups) transferOptions += g.options.length;
      }
    }
  }

  console.log(`restaurant: ${r.name}`);
  console.log(`transfer-only items (pizza/combo — voice hands these to a human): ${transferItems}, carrying ${transferOptions} modifier options\n`);
  console.log(`BEFORE: ${before.length} chars ≈ ${bt} tokens per turn`);
  console.log(`AFTER:  ${after.length} chars ≈ ${at} tokens per turn  (${Math.round((1 - at / bt) * 100)}% smaller)\n`);
  console.log(`20-turn call, UNCACHED Sonnet 5 (what it cost):  $${((bt * 20 * 3) / 1_000_000).toFixed(2)}`);
  console.log(`20-turn call, cached, Sonnet 5, before trim:     $${callCost(bt, 3)}`);
  console.log(`20-turn call, cached, Sonnet 5, after trim:      $${callCost(at, 3)}`);
  console.log(`20-turn call, cached, Haiku 4.5, after trim:     $${callCost(at, 1)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
