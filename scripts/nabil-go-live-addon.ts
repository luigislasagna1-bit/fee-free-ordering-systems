/**
 * Nabil AI goes ON SALE (Luigi 2026-08-16, OWNER-ACTIONS A64 (d)) — flip the
 * `phone_ordering` AddOn row from "coming soon, $0" to the live catalog entry:
 *
 *   name              → "Nabil AI Phone Ordering"
 *   monthlyPriceCents → 24999   (US$249.99/month minimum; overage US$0.50/min
 *                                billed by the second via
 *                                /api/cron/nabil-usage-billing)
 *   comingSoon        → false
 *   isActive          → true
 *   trialDays         → null    (the 7-day demo is CONDITIONAL — members only,
 *                                once — and lives in code, not the catalog)
 *   description       → the current product
 *
 * Stripe is NOT touched here. After this runs, Luigi opens Superadmin → Add-ons
 * and clicks **Sync** on the Nabil row (POST /api/superadmin/add-ons/<id>/sync
 * → syncAddOnToStripe): it creates the Stripe Product + a US$249.99 monthly
 * Price and stores their ids on the row. Until then Checkout answers "Add-on
 * isn't synced to Stripe yet". (Editing the price in that editor and pressing
 * Save does NOT sync — Save and Sync are two buttons.)
 *
 * Idempotent: prints before/after and only writes fields that differ. Run once
 * per Neon branch:
 *   npx tsx scripts/nabil-go-live-addon.ts                    # .env.local DATABASE_URL (dev)
 *   npx tsx scripts/nabil-go-live-addon.ts "<prod-neon-url>"  # explicit URL for prod
 *   npx tsx scripts/nabil-go-live-addon.ts --dry-run          # show the diff, write nothing
 */
import { config as dotenvConfig } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const explicitUrl = args.find((a) => !a.startsWith("--"));
if (!explicitUrl) {
  dotenvConfig({ path: ".env.local" });
  dotenvConfig({ path: ".env" });
}

export const NABIL_ADDON_SLUG = "phone_ordering";

/** The live catalog entry. Keep prisma/seed-addons.ts + addOnCatalog.phone_ordering
 *  (src/messages, all 38 locales) in step with this. */
export const NABIL_ADDON_LIVE = {
  name: "Nabil AI Phone Ordering",
  description:
    "Nabil AI answers your phone 24/7 and takes orders straight into your kitchen — half-and-half pizzas, combos, delivery zones, promos, receipts and reports, all through the same checkout as your website. US$0.50/min billed by the second, US$249.99/month minimum.",
  monthlyPriceCents: 24999,
  comingSoon: false,
  isActive: true,
  trialDays: null as number | null,
} as const;

type Row = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  monthlyPriceCents: number;
  comingSoon: boolean;
  isActive: boolean;
  trialDays: number | null;
  stripePriceId: string | null;
  stripeProductId: string | null;
};

function show(label: string, r: Row) {
  console.log(`\n${label}`);
  console.log(`  name              : ${r.name}`);
  console.log(`  description       : ${(r.description ?? "").slice(0, 110)}${(r.description ?? "").length > 110 ? "…" : ""}`);
  console.log(`  monthlyPriceCents : ${r.monthlyPriceCents}`);
  console.log(`  comingSoon        : ${r.comingSoon}`);
  console.log(`  isActive          : ${r.isActive}`);
  console.log(`  trialDays         : ${r.trialDays}`);
  console.log(`  stripeProductId   : ${r.stripeProductId ?? "—"}`);
  console.log(`  stripePriceId     : ${r.stripePriceId ?? "—"}`);
}

/** Only the fields that differ — the write is a no-op on a re-run. */
export function diffAgainstLive(r: Row): Partial<typeof NABIL_ADDON_LIVE> {
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(NABIL_ADDON_LIVE)) {
    if ((r as unknown as Record<string, unknown>)[k] !== v) patch[k] = v;
  }
  return patch as Partial<typeof NABIL_ADDON_LIVE>;
}

async function main() {
  const url = explicitUrl ?? process.env.DATABASE_URL;
  if (!url) {
    console.error("No DATABASE_URL");
    process.exit(1);
  }
  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  console.log(`Nabil AI add-on go-live against: ${url.replace(/:[^:@]+@/, ":****@")}${dryRun ? "  [DRY RUN]" : ""}`);

  const before = await prisma.addOn.findUnique({
    where: { slug: NABIL_ADDON_SLUG },
    select: { id: true, slug: true, name: true, description: true, monthlyPriceCents: true, comingSoon: true, isActive: true, trialDays: true, stripePriceId: true, stripeProductId: true },
  });
  if (!before) {
    console.error(`AddOn "${NABIL_ADDON_SLUG}" not found — run prisma/seed-addons.ts first.`);
    await prisma.$disconnect();
    process.exit(1);
  }
  show("BEFORE", before);

  const patch = diffAgainstLive(before);
  const keys = Object.keys(patch);
  if (keys.length === 0) {
    console.log("\n✓ Already live — nothing to change.");
  } else {
    console.log(`\nChanging: ${keys.join(", ")}`);
    if (dryRun) {
      console.log("  (dry run — not written)");
    } else {
      await prisma.addOn.update({ where: { id: before.id }, data: patch });
      const after = await prisma.addOn.findUnique({
        where: { id: before.id },
        select: { id: true, slug: true, name: true, description: true, monthlyPriceCents: true, comingSoon: true, isActive: true, trialDays: true, stripePriceId: true, stripeProductId: true },
      });
      if (after) show("AFTER", after);
      console.log("\n✓ Updated.");
    }
  }

  const priceMatches = !!before.stripePriceId;
  console.log(
    priceMatches
      ? `\nℹ Stripe price already on the row (${before.stripePriceId}). If it was created at a different amount, Sync archives it and creates a US$249.99 one.`
      : "\n➡ NEXT (Luigi): Superadmin → Add-ons → row \"Nabil AI Phone Ordering\" → click **Sync** (creates the Stripe Product + US$249.99/month Price). Subscribe is disabled until then.",
  );

  await prisma.$disconnect();
}

// Allow `import { NABIL_ADDON_LIVE }` from a test without running the script.
if (process.argv[1] && /nabil-go-live-addon\.(ts|js)$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
