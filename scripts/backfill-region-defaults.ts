/**
 * Backfill region defaults (timezone / currency / language) for existing
 * restaurants whose values look like the old hardcoded schema defaults but
 * whose COUNTRY implies otherwise. Fixes e.g. an Italian restaurant stuck on
 * America/New_York + usd (the root cause of Ristorante Test's promo bug).
 *
 * CONSERVATIVE — only touches restaurants that are CLEARLY mis-regioned:
 * the timezone is still the schema default "America/New_York" AND the country
 * is outside North America (so Eastern can't be legitimate). That singles out
 * cases like an Italian restaurant stranded on New York time, without
 * disturbing US/CA restaurants (where New York ≈ Toronto Eastern is harmless)
 * or anyone who deliberately set their own zone/currency. For those clearly
 * mis-regioned rows it corrects timezone, plus currency (if still "usd") and
 * defaultLanguage (if still "en" and the language ships today).
 *
 * Dry-run by default. Pass --apply to write.
 *
 * Usage:
 *   npx tsx scripts/backfill-region-defaults.ts            # dry run (active DB)
 *   npx tsx scripts/backfill-region-defaults.ts --apply    # write (active DB)
 *   npx tsx scripts/run-on-prod.ts scripts/backfill-region-defaults.ts          # dry run on prod
 *   npx tsx scripts/run-on-prod.ts scripts/backfill-region-defaults.ts --apply  # write to prod
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaNeon } from "@prisma/adapter-neon";
import { regionForCountry } from "../src/lib/regions";

config({ path: ".env.local" });
config({ path: ".env" });

const APPLY = process.argv.includes("--apply");
const SHIPPED_LOCALES = new Set(["en", "fr", "es", "it", "pt"]);

const url = process.env.DATABASE_URL;
if (!url) { console.error("No DATABASE_URL"); process.exit(1); }

async function main() {
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url!);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url! }) : new PrismaPg({ connectionString: url! });
  const prisma = new PrismaClient({ adapter } as any);
  console.log(`DB: ${url!.replace(/:[^:@]+@/, ":***@")}  ${APPLY ? "(APPLY)" : "(dry run)"}\n`);

  try {
    const restaurants = await prisma.restaurant.findMany({
      select: { id: true, name: true, country: true, timezone: true, currency: true, defaultLanguage: true },
    });

    let changed = 0;
    for (const r of restaurants) {
      const region = regionForCountry(r.country);
      if (!region || region.code === "OTHER") continue;

      // Only act on CLEARLY mis-regioned rows: still on the schema-default
      // America/New_York while located outside North America (US/CA both use
      // Eastern legitimately, so NY there is harmless and left alone).
      const tzClearlyWrong = r.timezone === "America/New_York" && !["US", "CA"].includes(region.code);
      if (!tzClearlyWrong) continue;

      const updates: Record<string, string> = { timezone: region.timezones[0] };
      if (r.currency === "usd" && region.currency !== "usd") {
        updates.currency = region.currency;
      }
      if (r.defaultLanguage === "en" && region.language !== "en" && SHIPPED_LOCALES.has(region.language)) {
        updates.defaultLanguage = region.language;
      }

      changed++;
      const desc = Object.entries(updates).map(([k, v]) => {
        const before = (r as any)[k];
        return `${k}: ${before} → ${v}`;
      }).join("  |  ");
      console.log(`• ${r.name} [${r.country}]  ${desc}`);
      if (APPLY) {
        await prisma.restaurant.update({ where: { id: r.id }, data: updates });
      }
    }

    console.log(`\n${changed} restaurant(s) ${APPLY ? "updated" : "would change"}.`);
    if (!APPLY && changed > 0) console.log("Re-run with --apply to write.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
