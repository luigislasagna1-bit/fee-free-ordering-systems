/**
 * One-shot backfill (Fabrizio cms0gyexp #1): NotificationRecipient rows that
 * still sit on the untouched "en" schema default while their restaurant's
 * backend language is something else get flipped to the restaurant language.
 *
 * Safe because NO UI ever offered a language choice before this batch — an
 * "en" value at a non-English restaurant can only be the unchosen default.
 * Idempotent by construction (after one run, no row matches the filter unless
 * someone deliberately sets "en" via the new select — which we then respect).
 *
 *   npx tsx scripts/run-on-prod.ts scripts/_backfill-recipient-email-language.ts
 *   (or plain `npx tsx …` against dev)
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { isSupportedLocale } from "../src/lib/locales";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const rows = await prisma.notificationRecipient.findMany({
    where: { emailLanguage: "en" },
    select: {
      id: true, email: true, emailLanguage: true,
      restaurant: { select: { name: true, defaultLanguage: true } },
    },
  });
  let flipped = 0;
  for (const r of rows) {
    const dl = r.restaurant?.defaultLanguage;
    if (!dl || dl === "en" || !isSupportedLocale(dl)) continue;
    await prisma.notificationRecipient.update({
      where: { id: r.id },
      data: { emailLanguage: dl },
    });
    console.log(`✓ ${r.restaurant.name}: ${r.email} en → ${dl}`);
    flipped++;
  }
  console.log(`\nDone — ${flipped} recipient(s) flipped of ${rows.length} "en" rows scanned.`);
}
main();
