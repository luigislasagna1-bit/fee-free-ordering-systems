/** READ-ONLY: reconcile Luigi's restaurant billing state vs Stripe to explain
 *  the "couldn't process your subscription payment — days left N" banner.
 *  The banner shows purely when Restaurant.graceEndsAt > now. This dumps the
 *  DB clock + every add-on, decides whether the clock is STALE (nothing is
 *  actually past_due) or REAL, and asks Stripe what it thinks of the platform
 *  customer's subscriptions + most recent invoices.
 *  Usage: npx tsx scripts/run-on-prod.ts scripts/_diag-luigi-billing.ts */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const prisma = (await import("../src/lib/db")).default;
  const rs = await prisma.restaurant.findMany({
    where: { name: { contains: "Lasagna", mode: "insensitive" } },
    select: {
      id: true, slug: true, name: true,
      subscriptionStatus: true, subscriptionPlanId: true,
      stripeCustomerId: true, stripeSubscriptionId: true,
      currentPeriodEnd: true, cancelAtPeriodEnd: true,
      dunningStartedAt: true, graceEndsAt: true, lastDunnedOn: true,
      subscriptionPlan: { select: { name: true, price: true } },
      addOns: {
        select: { id: true, status: true, graceEndsAt: true, trialEndsAt: true, stripeSubscriptionId: true, addOn: { select: { slug: true, name: true } } },
      },
    },
  });

  const now = new Date();
  for (const r of rs) {
    const banner = !!r.graceEndsAt && r.graceEndsAt > now;
    console.log(`\n================ ${r.name} (${r.slug}) ${banner ? "⚠️ BANNER SHOWING" : "no banner"}`);
    console.log(`plan: ${r.subscriptionPlan?.name ?? "none"} status=${r.subscriptionStatus} periodEnd=${r.currentPeriodEnd?.toISOString().slice(0, 10) ?? "-"} cancelAtPeriodEnd=${r.cancelAtPeriodEnd}`);
    console.log(`grace clock: graceEndsAt=${r.graceEndsAt?.toISOString().slice(0, 16) ?? "none"} dunningStarted=${r.dunningStartedAt?.toISOString().slice(0, 16) ?? "-"} lastDunnedOn=${r.lastDunnedOn ?? "-"}`);
    console.log(`stripe: customer=${r.stripeCustomerId ?? "none"} platformSub=${r.stripeSubscriptionId ?? "none"}`);
    const failingAddOns = r.addOns.filter((a) => a.status === "past_due" && a.graceEndsAt && a.graceEndsAt > now);
    for (const a of r.addOns) {
      const tag = a.status === "past_due" ? (a.graceEndsAt && a.graceEndsAt > now ? "PAST_DUE-in-grace" : "past_due-expired") : a.status;
      console.log(`  addon ${a.addOn.slug} → ${tag} grace=${a.graceEndsAt?.toISOString().slice(0, 10) ?? "-"} trial=${a.trialEndsAt?.toISOString().slice(0, 10) ?? "-"} stripeSub=${a.stripeSubscriptionId ?? "none"}`);
    }
    // Would clearRestaurantGraceIfHealthy clear it? (stale-clock test)
    const platformOk = r.subscriptionStatus !== "past_due";
    const wouldClear = banner && platformOk && failingAddOns.length === 0;
    console.log(`VERDICT: platform past_due=${!platformOk} · add-ons in grace=${failingAddOns.length} · clock is ${banner ? (wouldClear ? "STALE (a recovery event never fired clearRestaurantGraceIfHealthy → safe to clear)" : "REAL (something is genuinely past_due)") : "not running"}`);

    // Reconcile against Stripe (platform customer)
    if (r.stripeCustomerId) {
      try {
        const { getStripe } = await import("../src/lib/stripe");
        const stripe = await getStripe();
        const subs = await stripe.subscriptions.list({ customer: r.stripeCustomerId, status: "all", limit: 20 });
        console.log(`  STRIPE subscriptions (${subs.data.length}):`);
        for (const s of subs.data) {
          const item = s.items.data[0];
          console.log(`    ${s.id} status=${s.status} cancel_at_period_end=${s.cancel_at_period_end} price=${item?.price?.id ?? "-"} nickname=${item?.price?.nickname ?? "-"}`);
        }
        const invs = await stripe.invoices.list({ customer: r.stripeCustomerId, limit: 8 });
        console.log(`  STRIPE recent invoices (${invs.data.length}):`);
        for (const inv of invs.data) {
          console.log(`    ${inv.number ?? inv.id} status=${inv.status} paid=${inv.paid} amount_due=${(inv.amount_due ?? 0) / 100} amount_paid=${(inv.amount_paid ?? 0) / 100} created=${new Date((inv.created ?? 0) * 1000).toISOString().slice(0, 10)} ${inv.status === "open" || inv.status === "uncollectible" ? "← UNPAID" : ""}`);
        }
      } catch (e) {
        console.log(`  STRIPE lookup failed: ${e instanceof Error ? e.message : e}`);
      }
    } else {
      console.log("  (no Stripe customer id — nothing to reconcile; clock is DB-only)");
    }
  }
  await prisma.$disconnect();
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
