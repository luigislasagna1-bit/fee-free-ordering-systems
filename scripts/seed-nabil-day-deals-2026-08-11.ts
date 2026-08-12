/**
 * Seed Luigi's day-deal pairings (MenuItemDeal) — "the same food, cheaper, on
 * the day it actually runs".
 *
 *   npx tsx scripts/seed-nabil-day-deals-2026-08-11.ts            # dry run
 *   npx tsx scripts/seed-nabil-day-deals-2026-08-11.ts --write
 *   npx tsx scripts/seed-nabil-day-deals-2026-08-11.ts --write --enable
 *   npx tsx scripts/seed-nabil-day-deals-2026-08-11.ts --write --prod
 *
 * WHY A SCRIPT AND NOT A GUESS: which item is "the same food" is a judgment
 * only the owner can make, and getting it wrong sells the wrong thing at the
 * wrong price. So every pairing below is one Luigi named or confirmed from his
 * own menu screenshots, and the script REFUSES to write any pairing whose sizes
 * don't line up exactly — his instruction, verbatim: "many items have sizes
 * etc, make sure everything matches exactly to the correct thing."
 *
 * Category is part of the lookup because names repeat: "Chicken Wings" exists
 * in both PEOPLE PLEASERS (10/20/30/40) and CATERING (50/100/200 pc), and
 * pairing Wing Day to the catering tray would be a $46 mistake.
 *
 * Idempotent: re-running updates in place (dealItemId is unique).
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { variantsCorrespond } from "../src/lib/voice/variant-match";

const SLUG = "luigis-lasagna-pizzeria";
const WRITE = process.argv.includes("--write");
const ENABLE = process.argv.includes("--enable");
const PROD = process.argv.includes("--prod");

/** [deal item, its category, standard item, its category] */
const PAIRS: Array<[string, string, string, string]> = [
  // Pizza specials — the compiler rebuilds the caller's exact pizza on these.
  ["Monday - Medium Pizza Special", "Daily Deals", "Medium 1 Topping", "PIZZAS"],
  ["Tuesday - Large Pizza Special", "Daily Deals", "Large 1 Topping", "PIZZAS"],
  // Wing day — ONE pairing carrying all four counts, so 10/20/30/40 are each
  // offered at their own discount ("make sure all are offered", Luigi).
  ["Wednesday - WING Day (20% OFF)", "Daily Deals", "Chicken Wings", "PEOPLE PLEASERS"],
  // Thursday sandwiches.
  ["Thursday - Philly Cheese Steak", "Daily Deals", "Philly Cheese Steak", "SANDWICHES"],
  ["Thursday - Chicken Cheese Steak", "Daily Deals", "Chicken Cheese Steak", "SANDWICHES"],
  ["Thursday - Veal Cutlet Sandwich", "Daily Deals", "Veal Cutlet Sandwich", "SANDWICHES"],
  ["Thursday - Chicken Parm Sandwich", "Daily Deals", "Chicken Parm Sandwich", "SANDWICHES"],
  ["Thursday - Crispy Chicken Sandwich", "Daily Deals", "Crispy Chicken Sandwich", "SANDWICHES"],
  ["Thursday - Smash Burger", "Daily Deals", "Smash Burger", "SANDWICHES"],
  ["Thursday - Fish on a Bun", "Daily Deals", "Fish on a Bun", "SANDWICHES"],
  // Friday — Fish on a Bun is cheaper again, so the SAME standard item carries
  // two pairings and the day gate picks whichever is running.
  ["Friday - Fish on a Bun", "Daily Deals", "Fish on a Bun", "SANDWICHES"],
  ["Friday - Fish & Chips", "Daily Deals", "Fish & Chips", "PEOPLE PLEASERS"],
];

function connectionString(): string {
  const env = readFileSync(".env.local", "utf8");
  const urls: string[] = [];
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^\s*#?\s*DATABASE_URL\s*=\s*"([^"]+)"/);
    if (m && !urls.includes(m[1])) urls.push(m[1]);
  }
  if (!urls.length) throw new Error("No DATABASE_URL found in .env.local");
  // .env.local carries dev first, then the commented-out prod branch.
  return PROD ? (urls[1] ?? urls[0]) : urls[0];
}

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaNeon({ connectionString: connectionString() }),
  } as never);

  const restaurant = await prisma.restaurant.findFirst({
    where: { slug: SLUG },
    select: { id: true, name: true, timezone: true },
  });
  if (!restaurant) throw new Error(`Restaurant "${SLUG}" not found on this branch`);

  console.log(`${WRITE ? "WRITING" : "DRY RUN"} — ${restaurant.name} (${PROD ? "PROD" : "DEV"} branch)\n`);

  const find = (name: string, category: string) =>
    prisma.menuItem.findFirst({
      where: {
        restaurantId: restaurant.id,
        name,
        isAvailable: true,
        category: { name: category },
      },
      select: {
        id: true,
        name: true,
        price: true,
        fulfilDays: true,
        variants: { select: { name: true, price: true }, orderBy: { sortOrder: "asc" } },
      },
    });

  let ok = 0;
  let skipped = 0;

  for (const [dealName, dealCat, stdName, stdCat] of PAIRS) {
    const [deal, std] = await Promise.all([find(dealName, dealCat), find(stdName, stdCat)]);

    if (!deal || !std) {
      console.log(`  SKIP  ${dealName}\n        missing: ${!deal ? `deal "${dealName}" in ${dealCat}` : ""}${!deal && !std ? " AND " : ""}${!std ? `standard "${stdName}" in ${stdCat}` : ""}`);
      skipped++;
      continue;
    }

    // THE SIZE GATE — refuse rather than guess.
    if (!variantsCorrespond(std.variants, deal.variants)) {
      const show = (v: Array<{ name: string }>) => (v.length ? v.map((x) => x.name).join("/") : "flat price");
      console.log(`  SKIP  ${dealName}\n        sizes don't match: standard [${show(std.variants)}] vs deal [${show(deal.variants)}]`);
      skipped++;
      continue;
    }

    // Sanity: a "deal" that isn't cheaper is a data entry error, not a deal.
    const dearer = deal.variants.length
      ? deal.variants.some((dv) => {
          const sv = std.variants.find(
            (s) => s.name.toLowerCase().replace(/[^a-z0-9]+/g, "") === dv.name.toLowerCase().replace(/[^a-z0-9]+/g, ""),
          );
          return !sv || dv.price >= sv.price;
        })
      : deal.price >= std.price;
    if (dearer) {
      console.log(`  SKIP  ${dealName}\n        not cheaper than "${stdName}" — check the prices`);
      skipped++;
      continue;
    }

    const saving = std.variants.length
      ? `${std.variants
          .map((sv) => {
            const dv = deal.variants.find(
              (d) => d.name.toLowerCase().replace(/[^a-z0-9]+/g, "") === sv.name.toLowerCase().replace(/[^a-z0-9]+/g, ""),
            );
            return `${sv.name} $${(sv.price - (dv?.price ?? sv.price)).toFixed(2)}`;
          })
          .join(", ")}`
      : `$${(std.price - deal.price).toFixed(2)}`;

    console.log(`  PAIR  ${stdName} → ${dealName}  days=${deal.fulfilDays ?? "every day"}  saves ${saving}`);

    if (WRITE) {
      await prisma.menuItemDeal.upsert({
        where: { dealItemId: deal.id },
        create: { restaurantId: restaurant.id, dealItemId: deal.id, standardItemId: std.id, active: true },
        update: { standardItemId: std.id, active: true },
      });
    }
    ok++;
  }

  console.log(`\n${ok} pairing(s) ${WRITE ? "written" : "would be written"}, ${skipped} skipped.`);

  if (ENABLE) {
    if (WRITE) {
      await prisma.voiceAgentConfig.upsert({
        where: { restaurantId: restaurant.id },
        create: { restaurantId: restaurant.id, offerDayDeals: true },
        update: { offerDayDeals: true },
      });
    }
    console.log(`offerDayDeals ${WRITE ? "ENABLED" : "would be enabled"} for ${restaurant.name} only.`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
