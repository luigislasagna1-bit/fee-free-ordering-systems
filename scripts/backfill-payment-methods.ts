/**
 * One-shot: backfill Restaurant.paymentMethods for restaurants that
 * existed before the new methodsSelected required step shipped.
 *
 * Why: the new step "Accepted payment methods" requires the owner to
 * actively pick. The schema column defaults to "[]" on ADD COLUMN,
 * which would silently break publishing for every existing published
 * restaurant overnight. We grandfather them by stamping ["cash"] —
 * the safest default that always works without further setup. Owners
 * can revisit /admin/payments to expand or change.
 *
 * Idempotent. Touches only rows where paymentMethods is still the
 * literal default "[]" (we never overwrite owner choices).
 *
 * Safety:
 *   - DRY RUN by default.
 *   - Pass --apply to actually write.
 *   - Hits the CURRENTLY ACTIVE DATABASE_URL (swap .env.local entries
 *     manually for prod, same pattern as the other prod scripts —
 *     or use scripts/backfill-payment-methods-on-prod.ts).
 *
 * Usage:
 *   npx tsx scripts/backfill-payment-methods.ts          # dry run
 *   npx tsx scripts/backfill-payment-methods.ts --apply  # actually write
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Aborting.");
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");
const masked = url.replace(/:[^:@]+@/, ":***@");
console.log(`DB: ${masked}`);
console.log(`Mode: ${APPLY ? "APPLY (will write)" : "DRY RUN (no changes)"}\n`);

async function main() {
  const { default: prisma } = await import("../src/lib/db");
  process.on("beforeExit", () => prisma.$disconnect().catch(() => {}));

  // Find every restaurant still on the "[]" default. Whether they're
  // currently published is irrelevant — un-published restaurants that
  // partially completed setup also benefit from a sane default.
  const targets = await prisma.restaurant.findMany({
    where: { paymentMethods: "[]" },
    select: { id: true, name: true, slug: true, publishedAt: true },
    orderBy: { createdAt: "asc" },
  });

  if (targets.length === 0) {
    console.log("No restaurants with empty paymentMethods. Nothing to do.");
    return;
  }

  console.log(`Found ${targets.length} restaurant(s) on default "[]":`);
  for (const r of targets) {
    const status = r.publishedAt ? "published" : "in setup";
    console.log(`  → ${r.name.padEnd(36)} ${r.slug.padEnd(30)} (${status})`);
  }

  if (!APPLY) {
    console.log("\n(DRY RUN) No changes written.");
    console.log("To apply, re-run with: --apply");
    return;
  }

  console.log("\nApplying ['cash'] default…");
  const result = await prisma.restaurant.updateMany({
    where: { paymentMethods: "[]" },
    data: { paymentMethods: JSON.stringify(["cash"]) },
  });
  console.log(`✓ Backfilled ${result.count} restaurant(s).`);
}

main().catch((e: unknown) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  if (e instanceof Error && e.stack) console.error(e.stack);
  process.exitCode = 2;
});
