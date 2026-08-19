/**
 * Seed Luigi's day-deal pairings — now with MANY-to-ONE pizza matching.
 *
 *   npx tsx scripts/seed-nabil-day-deals-all-pizzas.ts            # dry run
 *   npx tsx scripts/seed-nabil-day-deals-all-pizzas.ts --write
 *   npx tsx scripts/seed-nabil-day-deals-all-pizzas.ts --write --prod
 *
 * Phase 1: explicit 1:1 pairings (sandwiches, wings, fish) — same as before.
 * Phase 2: pizza specials fan out to ALL same-size pizzas on the menu.
 *
 * Uses the compound unique @@unique([dealItemId, standardItemId]) for upserts.
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { variantsCorrespond } from "../src/lib/voice/variant-match";

const SLUG = "luigis-lasagna-pizzeria";
const WRITE = process.argv.includes("--write");
const PROD = process.argv.includes("--prod");

/** Explicit 1:1 pairings: [deal name, deal category, standard name, standard category] */
const EXPLICIT: Array<[string, string, string, string]> = [
  ["Wednesday - WING Day (20% OFF)", "Daily Deals", "Chicken Wings", "PEOPLE PLEASERS"],
  ["Thursday - Philly Cheese Steak", "Daily Deals", "Philly Cheese Steak", "SANDWICHES"],
  ["Thursday - Chicken Cheese Steak", "Daily Deals", "Chicken Cheese Steak", "SANDWICHES"],
  ["Thursday - Veal Cutlet Sandwich", "Daily Deals", "Veal Cutlet Sandwich", "SANDWICHES"],
  ["Thursday - Chicken Parm Sandwich", "Daily Deals", "Chicken Parm Sandwich", "SANDWICHES"],
  ["Thursday - Crispy Chicken Sandwich", "Daily Deals", "Crispy Chicken Sandwich", "SANDWICHES"],
  ["Thursday - Smash Burger", "Daily Deals", "Smash Burger", "SANDWICHES"],
  ["Thursday - Fish on a Bun", "Daily Deals", "Fish on a Bun", "SANDWICHES"],
  ["Friday - Fish on a Bun", "Daily Deals", "Fish on a Bun", "SANDWICHES"],
  ["Friday - Fish & Chips", "Daily Deals", "Fish & Chips", "PEOPLE PLEASERS"],
];

/** Pizza specials that should fan out to ALL matching-size pizzas.
 *  [deal name, deal category, pizza category to scan] */
const PIZZA_FANOUT: Array<[string, string, string]> = [
  ["Monday - Medium Pizza Special", "Daily Deals", "PIZZAS"],
  ["Tuesday - Large Pizza Special", "Daily Deals", "PIZZAS"],
];

function connectionString(): string {
  const env = readFileSync(".env.local", "utf8");
  const urls: string[] = [];
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^\s*#?\s*DATABASE_URL\s*=\s*"([^"]+)"/);
    if (m && !urls.includes(m[1])) urls.push(m[1]);
  }
  if (!urls.length) throw new Error("No DATABASE_URL found in .env.local");
  return PROD ? (urls[1] ?? urls[0]) : urls[0];
}

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaNeon({ connectionString: connectionString() }),
  } as never);

  const restaurant = await prisma.restaurant.findFirst({
    where: { slug: SLUG },
    select: { id: true, name: true },
  });
  if (!restaurant) throw new Error(`Restaurant "${SLUG}" not found on this branch`);
  console.log(`${WRITE ? "WRITING" : "DRY RUN"} — ${restaurant.name} (${PROD ? "PROD" : "DEV"})\n`);

  const find = (name: string, category: string) =>
    prisma.menuItem.findFirst({
      where: { restaurantId: restaurant.id, name, isAvailable: true, category: { name: category } },
      select: {
        id: true, name: true, price: true, fulfilDays: true,
        variants: { select: { name: true, price: true }, orderBy: { sortOrder: "asc" } },
      },
    });

  let ok = 0;
  let skipped = 0;

  const upsertPairing = async (
    dealId: string, dealName: string,
    stdId: string, stdName: string,
    saving: string,
  ) => {
    console.log(`  PAIR  ${stdName} → ${dealName}  saves ${saving}`);
    if (WRITE) {
      await prisma.menuItemDeal.upsert({
        where: { dealItemId_standardItemId: { dealItemId: dealId, standardItemId: stdId } },
        create: { restaurantId: restaurant.id, dealItemId: dealId, standardItemId: stdId, active: true },
        update: { active: true },
      });
    }
    ok++;
  };

  // ── Phase 1: explicit 1:1 pairings ──────────────────────────────────
  console.log("── Explicit pairings ──");
  for (const [dealName, dealCat, stdName, stdCat] of EXPLICIT) {
    const [deal, std] = await Promise.all([find(dealName, dealCat), find(stdName, stdCat)]);
    if (!deal || !std) {
      console.log(`  SKIP  ${dealName} — missing: ${!deal ? `deal` : ""}${!deal && !std ? " + " : ""}${!std ? `standard` : ""}`);
      skipped++;
      continue;
    }
    if (!variantsCorrespond(std.variants, deal.variants)) {
      console.log(`  SKIP  ${dealName} — sizes don't match`);
      skipped++;
      continue;
    }
    const saving = std.variants.length
      ? std.variants.map((sv) => {
          const dv = deal.variants.find((d) => d.name.toLowerCase().replace(/[^a-z0-9]+/g, "") === sv.name.toLowerCase().replace(/[^a-z0-9]+/g, ""));
          return `${sv.name} $${(sv.price - (dv?.price ?? sv.price)).toFixed(2)}`;
        }).join(", ")
      : `$${(std.price - deal.price).toFixed(2)}`;
    await upsertPairing(deal.id, dealName, std.id, stdName, saving);
  }

  // ── Phase 2: pizza fanout ───────────────────────────────────────────
  console.log("\n── Pizza fanout ──");
  for (const [dealName, dealCat, pizzaCat] of PIZZA_FANOUT) {
    const deal = await find(dealName, dealCat);
    if (!deal) {
      console.log(`  SKIP  ${dealName} — not found`);
      skipped++;
      continue;
    }
    console.log(`  Deal: ${dealName} ($${deal.price.toFixed(2)}) days=${deal.fulfilDays ?? "any"}`);

    const allPizzas = await prisma.menuItem.findMany({
      where: {
        restaurantId: restaurant.id,
        isAvailable: true,
        isSoldOut: false,
        isHidden: false,
        category: { name: pizzaCat },
        id: { not: deal.id },
      },
      select: {
        id: true, name: true, price: true,
        variants: { select: { name: true, price: true }, orderBy: { sortOrder: "asc" } },
      },
      orderBy: { name: "asc" },
    });

    for (const pizza of allPizzas) {
      if (!variantsCorrespond(pizza.variants, deal.variants)) continue;

      const dearer = deal.variants.length
        ? deal.variants.some((dv) => {
            const sv = pizza.variants.find((s) => s.name.toLowerCase().replace(/[^a-z0-9]+/g, "") === dv.name.toLowerCase().replace(/[^a-z0-9]+/g, ""));
            return !sv || dv.price >= sv.price;
          })
        : deal.price >= pizza.price;
      if (dearer) continue;

      const saving = pizza.variants.length
        ? pizza.variants.map((sv) => {
            const dv = deal.variants.find((d) => d.name.toLowerCase().replace(/[^a-z0-9]+/g, "") === sv.name.toLowerCase().replace(/[^a-z0-9]+/g, ""));
            return `${sv.name} $${(sv.price - (dv?.price ?? sv.price)).toFixed(2)}`;
          }).join(", ")
        : `$${(pizza.price - deal.price).toFixed(2)}`;

      await upsertPairing(deal.id, dealName, pizza.id, pizza.name, saving);
    }
  }

  console.log(`\n${ok} pairing(s) ${WRITE ? "written" : "would be written"}, ${skipped} skipped.`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
