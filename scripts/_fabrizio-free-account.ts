/** Fabrizio's ristorante-test → permanently free (Luigi 2026-07-20, in return
 *  for his testing/feedback). Dry-run by default: shows the full billing state
 *  and the plan. --apply pushes every comp/trial expiry to 2126-01-01 and
 *  clears any dunning state. Reversible: set real dates back any time.
 *  Usage: npx tsx scripts/run-on-prod.ts scripts/_fabrizio-free-account.ts [--apply] */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

const FOREVER = new Date("2126-01-01T00:00:00Z");

async function main() {
  const prisma = (await import("../src/lib/db")).default;
  const apply = process.argv.includes("--apply");
  const r = await prisma.restaurant.findFirst({
    where: { slug: "ristorante-test" },
    select: {
      id: true, name: true, slug: true,
      subscriptionPlanId: true, subscriptionStatus: true, trialEndsAt: true,
      stripeSubscriptionId: true, currentPeriodEnd: true, cancelAtPeriodEnd: true,
      dunningStartedAt: true, graceEndsAt: true, lastDunnedOn: true,
      currentMonthOrderCount: true,
      subscriptionPlan: { select: { name: true, price: true, interval: true } },
      addOns: {
        select: { id: true, status: true, trialEndsAt: true, stripeSubscriptionId: true, graceEndsAt: true, addOn: { select: { slug: true, name: true } } },
      },
    },
  });
  if (!r) throw new Error("ristorante-test not found");
  console.log(`${r.name} (${r.slug})`);
  console.log(`plan: ${r.subscriptionPlan?.name ?? "none"} ($${r.subscriptionPlan?.price ?? 0}/${r.subscriptionPlan?.interval ?? "mo"}) status=${r.subscriptionStatus} trialEndsAt=${r.trialEndsAt?.toISOString().slice(0, 10) ?? "null"} stripeSub=${r.stripeSubscriptionId ?? "none"}`);
  console.log(`dunning: started=${r.dunningStartedAt?.toISOString().slice(0, 10) ?? "no"} grace=${r.graceEndsAt?.toISOString().slice(0, 10) ?? "no"} monthOrders=${r.currentMonthOrderCount}`);
  for (const a of r.addOns) {
    console.log(`addon ${a.addOn.slug} "${a.addOn.name}" — status=${a.status} trialEndsAt=${a.trialEndsAt?.toISOString().slice(0, 10) ?? "null"} stripeSub=${a.stripeSubscriptionId ?? "none"} grace=${a.graceEndsAt?.toISOString().slice(0, 10) ?? "no"}`);
  }
  if (!apply) { console.log("\nDRY RUN — rerun with --apply to make it permanently free."); return; }

  // Guard: never touch a row with a REAL Stripe subscription (money!) — comp
  // rows are trialing with stripeSubscriptionId null.
  const compAddOns = r.addOns.filter((a) => !a.stripeSubscriptionId && a.trialEndsAt);
  for (const a of compAddOns) {
    await prisma.restaurantAddOn.update({ where: { id: a.id }, data: { trialEndsAt: FOREVER, graceEndsAt: null } });
    console.log(`→ ${a.addOn.slug}: free until 2126`);
  }
  const data: Record<string, unknown> = { dunningStartedAt: null, graceEndsAt: null, lastDunnedOn: null };
  if (!r.stripeSubscriptionId && r.trialEndsAt) data.trialEndsAt = FOREVER;
  await prisma.restaurant.update({ where: { id: r.id }, data });
  console.log("→ plan trial extended (if comped) + dunning state cleared. ✓ permanently free");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
