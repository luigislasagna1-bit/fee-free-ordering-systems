/**
 * Sync a local SubscriptionPlan row to Stripe (Product + Price).
 *
 * Stripe model:
 *   - A Product represents the *thing* being sold ("Starter", "Pro").
 *   - A Price represents a specific monthly/yearly price point for a Product.
 *     Prices are IMMUTABLE — to change the price you create a new Price and
 *     archive the old one. Existing subscriptions on the old Price keep
 *     billing at the old rate until explicitly migrated.
 *
 * Sync algorithm:
 *   1. If no stripeProductId → create Product, store ID
 *   2. If product name/description changed → update Product (safe)
 *   3. If no stripePriceId OR price/interval changed → archive old Price,
 *      create new Price, store ID
 *   4. Set syncStatus = "synced", syncedAt = now
 *
 * Idempotent: repeated calls with no changes are no-ops after step 1.
 */
import prisma from "@/lib/db";
import { getStripe } from "@/lib/stripe";

export async function syncPlanToStripe(planId: string): Promise<{
  ok: true;
  productId: string;
  priceId: string;
  changed: boolean;
} | { ok: false; error: string }> {
  const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
  if (!plan) return { ok: false, error: "Plan not found" };

  // Mark in-flight so the UI can show a spinner.
  await prisma.subscriptionPlan.update({
    where: { id: planId },
    data: { syncStatus: "syncing", syncError: null },
  });

  try {
    const stripe = await getStripe();
    let productId = plan.stripeProductId;
    let priceId = plan.stripePriceId;
    let changed = false;

    // 1. Product
    if (!productId) {
      const product = await stripe.products.create({
        name: plan.name,
        description: plan.description ?? undefined,
        metadata: { planId: plan.id, planSlug: plan.slug },
        active: plan.isActive,
      });
      productId = product.id;
      changed = true;
    } else {
      // Keep product name + description + active flag in sync (safe update)
      await stripe.products.update(productId, {
        name: plan.name,
        description: plan.description ?? undefined,
        active: plan.isActive,
      });
    }

    // 2. Price — create if missing OR if our local price differs from Stripe's
    const amountCents = Math.round(plan.price * 100);
    const interval = (plan.interval === "year" ? "year" : "month") as "month" | "year";

    let needsNewPrice = !priceId;
    if (priceId) {
      try {
        const existing = await stripe.prices.retrieve(priceId);
        const stripeInterval = existing.recurring?.interval;
        const stripeAmount = existing.unit_amount;
        if (stripeAmount !== amountCents || stripeInterval !== interval) {
          needsNewPrice = true;
          // Archive the old price so it no longer appears in checkouts.
          await stripe.prices.update(priceId, { active: false });
        }
      } catch {
        // Stripe couldn't find the price — fall through and create a new one.
        needsNewPrice = true;
      }
    }

    if (needsNewPrice) {
      const price = await stripe.prices.create({
        product: productId!,
        unit_amount: amountCents,
        currency: "usd",
        recurring: { interval },
        metadata: { planId: plan.id },
      });
      priceId = price.id;
      changed = true;
    }

    // 3. Persist sync state
    await prisma.subscriptionPlan.update({
      where: { id: planId },
      data: {
        stripeProductId: productId,
        stripePriceId: priceId,
        syncStatus: "synced",
        syncedAt: new Date(),
        syncError: null,
      },
    });

    return { ok: true, productId: productId!, priceId: priceId!, changed };
  } catch (err: any) {
    const msg = err?.message ?? "Stripe sync failed";
    await prisma.subscriptionPlan.update({
      where: { id: planId },
      data: { syncStatus: "error", syncError: msg.slice(0, 500) },
    });
    return { ok: false, error: msg };
  }
}
