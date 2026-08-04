/** One-off: write the do-not-email suppression for a person who was erased as a
 *  PROSPECT-ONLY record BEFORE the engine learned to suppress prospect-only
 *  restaurants. Maps the original email → its deterministic deletedEmail() →
 *  the (already-scrubbed) prospect rows → their restaurantIds → suppress the
 *  ORIGINAL address there, so a re-import can never resurrect them. Idempotent.
 *    npx tsx scripts/run-on-prod.ts scripts/_suppress-erased-prospect.ts jay.ventura1@gmail.com
 */
import { config } from "dotenv";
import crypto from "crypto";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

function deletedEmail(seed: string): string {
  const h = crypto.createHash("sha256").update(seed.trim().toLowerCase()).digest("hex").slice(0, 16);
  return `deleted+${h}@deleted.invalid`;
}

async function main() {
  const original = (process.argv[2] || "jay.ventura1@gmail.com").trim().toLowerCase();
  const scrubbed = deletedEmail(original);
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const rows = await prisma.prospect.findMany({
    where: { email: scrubbed },
    select: { import: { select: { restaurantId: true } } },
  });
  const restaurantIds = [...new Set(rows.map((r) => r.import?.restaurantId).filter((x): x is string => !!x))];
  if (restaurantIds.length === 0) {
    console.log(`No scrubbed prospect rows found for ${original} (${scrubbed}). Nothing to suppress.`);
    await prisma.$disconnect();
    return;
  }
  for (const restaurantId of restaurantIds) {
    await prisma.emailSuppression.upsert({
      where: { restaurantId_emailLower: { restaurantId, emailLower: original } },
      create: { restaurantId, emailLower: original, reason: "erasure", source: "erasure" },
      update: { reason: "erasure", source: "erasure" },
    });
    console.log(`Suppressed ${original} at restaurant ${restaurantId}`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
