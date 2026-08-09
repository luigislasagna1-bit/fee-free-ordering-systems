/**
 * Correct a restaurant's country / timezone / currency / hours format when the
 * signup cascade stamped the wrong region on it.
 *
 * Why this exists (Luigi 2026-08-09): the signup form defaulted Country to
 * Canada and Pakistan wasn't in the country list at all, so a real Islamabad
 * restaurant ("Sofia Chilly meals") was created as "Islamabad, CA" — and the
 * cascade in /api/auth/register then gave it CAD prices and an America/Toronto
 * clock, roughly ten hours off. The form now shows the derived currency and
 * timezone before submit and unknown countries resolve to OTHER instead of
 * Canada, but an already-created restaurant still needs correcting.
 *
 * 🚨 CURRENCY IS A MONEY FIELD. Changing it does NOT convert existing amounts —
 * it only changes how they are denominated and charged. This script therefore
 * REFUSES to change the currency of a restaurant that already has orders,
 * unless you pass --force-currency and know exactly why. Correcting a brand-new
 * unpublished store with zero orders is safe; doing it to a trading store is
 * not.
 *
 * Validates the target country against regions.ts, so it cannot write a code
 * the app doesn't understand.
 *
 *   DRY RUN (reads only, prints the before/after):
 *     npx tsx scripts/run-on-prod.ts scripts/_fix-restaurant-region.ts <restaurantId> <COUNTRY>
 *   APPLY:
 *     npx tsx scripts/run-on-prod.ts scripts/_fix-restaurant-region.ts <restaurantId> <COUNTRY> --write
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const [restaurantId, countryArg] = positional;
const WRITE = process.argv.includes("--write");
const FORCE_CURRENCY = process.argv.includes("--force-currency");

async function main() {
  if (!restaurantId || !countryArg) {
    console.error("usage: _fix-restaurant-region.ts <restaurantId> <COUNTRY> [--write] [--force-currency]");
    process.exit(1);
  }

  const { regionForCountry, defaultsForCountry } = await import("../src/lib/regions");
  const code = countryArg.toUpperCase();
  const region = regionForCountry(code);
  if (!region) {
    console.error(`❌ "${code}" is not a country in src/lib/regions.ts — add it there first.`);
    process.exit(1);
  }
  const want = defaultsForCountry(code);

  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as never);

  const r = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      id: true, name: true, slug: true, city: true,
      country: true, timezone: true, currency: true, hoursFormat: true,
      publishedAt: true,
    },
  });
  if (!r) { console.error("restaurant not found"); process.exit(1); }

  const orderCount = await prisma.order.count({ where: { restaurantId } });

  console.log(`Restaurant: ${r.name} (${r.slug})`);
  console.log(`  city             ${r.city ?? "—"}`);
  console.log(`  published        ${r.publishedAt ? r.publishedAt.toISOString().slice(0, 10) : "not published"}`);
  console.log(`  orders on file   ${orderCount}`);
  console.log("");
  console.log(`  country          ${r.country}  →  ${code} (${region.name})`);
  console.log(`  timezone         ${r.timezone}  →  ${want.timezone}`);
  console.log(`  currency         ${r.currency}  →  ${want.currency}`);
  console.log(`  hoursFormat      ${r.hoursFormat}  →  ${want.hoursFormat}`);
  console.log("");

  const currencyChanges = r.currency !== want.currency;
  const data: Record<string, unknown> = {
    country: code,
    timezone: want.timezone,
    hoursFormat: want.hoursFormat,
  };

  if (currencyChanges) {
    if (orderCount > 0 && !FORCE_CURRENCY) {
      console.error(`🛑 REFUSING to change currency: this restaurant has ${orderCount} order(s).`);
      console.error("   Existing order totals are stored as plain numbers — re-denominating them");
      console.error("   silently reprices history. Re-run with --force-currency only if that is");
      console.error("   genuinely what you want. Country/timezone/hours were NOT written either.");
      process.exit(1);
    }
    data.currency = want.currency;
  }

  if (!WRITE) {
    console.log("🔍 DRY RUN — nothing written. Re-run with --write to apply.");
    await prisma.$disconnect();
    return;
  }

  await prisma.restaurant.update({ where: { id: restaurantId }, data });
  console.log("✅ updated");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
