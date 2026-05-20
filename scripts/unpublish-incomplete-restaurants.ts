/**
 * One-shot maintenance script: un-publish any restaurant whose required
 * setup steps aren't 100% complete.
 *
 * Why: the setup wizard's "required" list grew in commit 93dbf7e
 * (delivery zones became required when acceptsDelivery is on, the
 * payments.methodConfigured `|| true` bug was fixed, etc.). Some
 * restaurants that were `publishedAt = <some date>` from BEFORE those
 * changes now have unchecked required steps but are still marked as
 * live. This script retroactively reconciles by setting `publishedAt`
 * back to null for any restaurant whose checklist isn't actually
 * publish-ready. They keep all their data — just can't go live again
 * until they finish setup, at which point the existing Publish button
 * on /admin/setup flips them back on.
 *
 * Safety:
 *   - DRY RUN by default. Prints every change it WOULD make.
 *   - Pass --apply to actually write to the DB.
 *   - Hits the CURRENTLY ACTIVE DATABASE_URL from .env.local. If you
 *     need to run this against the OTHER Neon branch (e.g. dev vs prod),
 *     temporarily swap which DATABASE_URL line is commented out — same
 *     pattern as scripts/push-schema-to-both.ts.
 *
 * Usage:
 *   npx tsx scripts/unpublish-incomplete-restaurants.ts          # dry run
 *   npx tsx scripts/unpublish-incomplete-restaurants.ts --apply  # actually write
 */
// IMPORTANT: load env BEFORE any module that reads process.env at import
// time. src/lib/db.ts in particular throws on import if DATABASE_URL is
// missing, so we can't import it (or anything that transitively imports
// it like loadSetupProgress) until after dotenv has populated env.
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
console.log(`Mode: ${APPLY ? "APPLY (will write)" : "DRY RUN (no changes)"}`);
console.log();

async function main() {
  // Dynamic imports — these modules read DATABASE_URL at import time,
  // so we have to wait until env is loaded above.
  const { loadSetupProgress } = await import("../src/lib/setup-checklist-loader");
  // Use the same prisma singleton that loadSetupProgress uses. Importing
  // it ourselves ensures the env-resolved DATABASE_URL is what the
  // singleton picks up. We DO NOT instantiate a separate client — that
  // would dual-connect to the DB needlessly.
  const { default: prisma } = await import("../src/lib/db");

  // Explicit close at end so the Neon HTTP client's idle connection
  // doesn't keep the process alive (which on Windows triggers a
  // native UV assertion when the process force-exits anyway).
  process.on("beforeExit", () => prisma.$disconnect().catch(() => {}));

  // Pull every restaurant that's currently flagged live, regardless of
  // whether the original Publish click predates our new required-steps.
  const published = await prisma.restaurant.findMany({
    where: { publishedAt: { not: null } },
    select: { id: true, name: true, slug: true, publishedAt: true },
    orderBy: { publishedAt: "asc" },
  });

  if (published.length === 0) {
    console.log("No published restaurants found. Nothing to do.");
    process.exit(0);
  }

  console.log(`Checking ${published.length} published restaurant(s)...\n`);

  const toUnpublish: Array<{
    id: string;
    name: string;
    slug: string;
    missing: string[];
  }> = [];
  const stillOk: Array<{ id: string; name: string; slug: string }> = [];

  for (const r of published) {
    const progress = await loadSetupProgress(r.id).catch((e) => {
      console.error(`  ! ${r.name} (${r.slug}): loadSetupProgress threw — skipping. Error:`, e?.message ?? e);
      return null;
    });
    if (!progress) continue;

    if (progress.requiredStepsRemaining.length === 0) {
      stillOk.push({ id: r.id, name: r.name, slug: r.slug });
    } else {
      toUnpublish.push({
        id: r.id,
        name: r.name,
        slug: r.slug,
        missing: progress.requiredStepsRemaining.map((s) => s.label),
      });
    }
  }

  console.log(`=== ${stillOk.length} restaurant(s) ALREADY complete (stay published) ===`);
  for (const r of stillOk) {
    console.log(`  ✓ ${r.name.padEnd(36)} ${r.slug}`);
  }

  console.log(`\n=== ${toUnpublish.length} restaurant(s) WOULD be unpublished ===`);
  for (const r of toUnpublish) {
    console.log(`  → ${r.name.padEnd(36)} ${r.slug}`);
    for (const step of r.missing) {
      console.log(`      missing: ${step}`);
    }
  }

  if (toUnpublish.length === 0) {
    console.log("\nNothing to unpublish. All published restaurants meet the current required-step bar.");
    process.exit(0);
  }

  if (!APPLY) {
    console.log("\n(DRY RUN) No changes written.");
    console.log("To actually unpublish these, re-run with: --apply");
    process.exit(0);
  }

  // Actually unpublish.
  console.log("\nApplying changes...");
  const ids = toUnpublish.map((r) => r.id);
  const result = await prisma.restaurant.updateMany({
    where: { id: { in: ids } },
    data: { publishedAt: null },
  });
  console.log(`✓ Unpublished ${result.count} restaurant(s).`);
  console.log(`Owners will see /admin/setup with "X required steps left" and a normal "Publish my restaurant" button once they're done.`);
}

main()
  .catch((e: unknown) => {
    console.error("FAILED:", e instanceof Error ? e.message : e);
    if (e instanceof Error && e.stack) console.error(e.stack);
    process.exitCode = 2;
  });
// No explicit process.exit() — let Node exit naturally once the
// beforeExit handler $disconnects prisma and the event loop drains.
