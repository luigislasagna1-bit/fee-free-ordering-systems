/**
 * Retire the PAID marketplace add-on now that the marketplace is FREE + included
 * (Luigi 2026-07-14, decision: cancel existing subs now).
 *
 * For every restaurant currently subscribed to the "marketplace" add-on
 * ($199.99/mo or the PAYG variant), this:
 *   1. PRESERVES driver_pool — the marketplace add-on bundled it. If the
 *      restaurant has no OTHER active grant of driver_pool, it grants a COMPED
 *      standalone `driver_pool` RestaurantAddOn (status active, no Stripe sub) so
 *      ShipDay + FeeFree dispatch keep working after the marketplace sub ends.
 *   2. Cancels the marketplace Stripe subscription (immediate) and flips the
 *      RestaurantAddOn to "cancelled" — no one is billed for a now-free feature.
 *   3. Retires the marketplace AddOn from SALE (isActive=false) so no new signups.
 *      (getEntitlements reads RestaurantAddOn.enabledFeatures without an
 *      AddOn.isActive check, so this never strips a live entitlement.)
 *
 * SAFE BY DEFAULT: dry-run — prints the exact plan and touches NOTHING. Pass
 * --apply to execute (cancels live Stripe subs + writes the DB). Meant to be run
 * once, deliberately, against production with authorization.
 *   Dry run:  npx tsx scripts/retire-marketplace-addon.ts
 *   Apply:    npx tsx scripts/retire-marketplace-addon.ts --apply
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getStripe, stripeReady } from "../src/lib/stripe";

const APPLY = process.argv.includes("--apply");

function grants(enabledFeatures: string | null | undefined, feature: string): boolean {
  try {
    const f = JSON.parse(enabledFeatures || "[]");
    return Array.isArray(f) && f.includes(feature);
  } catch {
    return false;
  }
}

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);
  const mode = APPLY ? "APPLY (writing + cancelling live subs)" : "DRY RUN (no changes)";
  console.log(`\n=== Retire marketplace add-on — ${mode} ===\n`);

  const mkAddon = await prisma.addOn.findFirst({ where: { slug: "marketplace" }, select: { id: true, isActive: true } });
  const driverPoolAddon = await prisma.addOn.findFirst({ where: { slug: "driver_pool" }, select: { id: true } });
  if (!mkAddon || !driverPoolAddon) throw new Error("marketplace or driver_pool AddOn not found");

  const subs = await prisma.restaurantAddOn.findMany({
    where: { addOnId: mkAddon.id, status: { in: ["active", "trialing", "past_due"] } },
    select: {
      id: true, restaurantId: true, status: true, stripeSubscriptionId: true,
      restaurant: { select: { name: true } },
    },
  });
  console.log(`Marketplace add-on subscriptions to cancel: ${subs.length}`);

  const stripe = (await stripeReady()) ? await getStripe() : null;

  for (const sub of subs) {
    // Does this restaurant keep driver_pool WITHOUT the marketplace add-on?
    const others = await prisma.restaurantAddOn.findMany({
      where: {
        restaurantId: sub.restaurantId,
        id: { not: sub.id },
        OR: [{ status: { in: ["active", "trialing"] } }, { status: "past_due", graceEndsAt: { gt: new Date() } }],
      },
      select: { addOn: { select: { enabledFeatures: true } } },
    });
    const keepsDriverPool = others.some((o) => grants(o.addOn.enabledFeatures, "driver_pool"));

    console.log(`\n• ${sub.restaurant.name} (${sub.restaurantId})`);
    console.log(`    status=${sub.status} stripeSub=${sub.stripeSubscriptionId ?? "none"}`);
    console.log(`    driver_pool preserved by another add-on: ${keepsDriverPool}`);
    if (!keepsDriverPool) console.log(`    → GRANT comped standalone driver_pool add-on`);
    if (sub.stripeSubscriptionId) console.log(`    → CANCEL Stripe subscription ${sub.stripeSubscriptionId}`);
    console.log(`    → SET marketplace RestaurantAddOn ${sub.id} status=cancelled`);

    if (APPLY) {
      if (!keepsDriverPool) {
        await prisma.restaurantAddOn.create({
          data: { restaurantId: sub.restaurantId, addOnId: driverPoolAddon.id, status: "active" },
        });
      }
      if (sub.stripeSubscriptionId && stripe) {
        try {
          await stripe.subscriptions.cancel(sub.stripeSubscriptionId);
        } catch (e: any) {
          console.log(`    ! Stripe cancel failed: ${e?.message ?? e}`);
        }
      }
      await prisma.restaurantAddOn.update({ where: { id: sub.id }, data: { status: "cancelled", cancelAtPeriodEnd: false } });
    }
  }

  console.log(`\n• Retire marketplace AddOn from sale (isActive ${mkAddon.isActive} → false)`);
  if (APPLY) await prisma.addOn.update({ where: { id: mkAddon.id }, data: { isActive: false } });

  console.log(`\n${APPLY ? "✅ Applied." : "ℹ️  Dry run complete — re-run with --apply to execute."}\n`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
