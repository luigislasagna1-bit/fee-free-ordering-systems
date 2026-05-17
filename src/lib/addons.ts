/**
 * Add-on helpers — list catalog, sync individual add-ons to Stripe
 * (Product + recurring Price), and look up restaurant subscriptions.
 *
 * Phase 5 wires this to the customer-facing /admin/billing/add-ons page +
 * superadmin sync UI. Webhook updates the RestaurantAddOn status when
 * Stripe sends customer.subscription.* events whose metadata.addOnSlug
 * identifies the row.
 */

import prisma from "@/lib/db";
import { getStripe, stripeReady } from "@/lib/stripe";

/** Public listing — includes the restaurant's own subscription state. */
export async function listAddOnsForRestaurant(restaurantId: string) {
  const [addOns, subs] = await Promise.all([
    prisma.addOn.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: "asc" },
    }),
    prisma.restaurantAddOn.findMany({
      where: { restaurantId },
      include: { addOn: { select: { slug: true } } },
    }),
  ]);
  const subBySlug = new Map(subs.map((s) => [s.addOn.slug, s]));
  return addOns.map((a) => ({
    id: a.id,
    slug: a.slug,
    name: a.name,
    description: a.description,
    monthlyPriceCents: a.monthlyPriceCents,
    yearlyPriceCents: a.yearlyPriceCents,
    trialDays: a.trialDays,
    enabledFeatures: safeJsonArray(a.enabledFeatures),
    requiredDependencies: safeJsonArray(a.requiredDependencies),
    stripePriceId: a.stripePriceId,
    isSubscribed: !!subBySlug.get(a.slug),
    subscription: subBySlug.get(a.slug)
      ? {
          status: subBySlug.get(a.slug)!.status,
          currentPeriodEnd: subBySlug.get(a.slug)!.currentPeriodEnd,
          cancelAtPeriodEnd: subBySlug.get(a.slug)!.cancelAtPeriodEnd,
        }
      : null,
  }));
}

function safeJsonArray(s: string | null | undefined): string[] {
  if (!s) return [];
  try {
    const arr = JSON.parse(s);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Sync an AddOn row to Stripe: create (or reuse) a Stripe Product + monthly
 * recurring Price, then persist the IDs back to the AddOn row. Idempotent.
 */
export async function syncAddOnToStripe(addOnId: string): Promise<{
  stripeProductId: string;
  stripePriceId: string;
}> {
  if (!(await stripeReady())) {
    throw new Error("Stripe is not configured");
  }
  const addOn = await prisma.addOn.findUnique({ where: { id: addOnId } });
  if (!addOn) throw new Error("AddOn not found");
  if (addOn.monthlyPriceCents <= 0) {
    throw new Error(
      `AddOn "${addOn.slug}" has a $0 monthly price; set a real price before syncing to Stripe.`
    );
  }

  const stripe = await getStripe();

  // Product
  let productId = addOn.stripeProductId;
  if (productId) {
    try {
      await stripe.products.update(productId, {
        name: addOn.name,
        description: addOn.description || undefined,
        metadata: { addOnSlug: addOn.slug },
      });
    } catch {
      productId = null;
    }
  }
  if (!productId) {
    const p = await stripe.products.create({
      name: addOn.name,
      description: addOn.description || undefined,
      metadata: { addOnSlug: addOn.slug },
    });
    productId = p.id;
  }

  // Price — create if missing or amount changed (Stripe prices are immutable;
  // we archive the old one and create a new one when the amount changes).
  let priceId = addOn.stripePriceId;
  if (priceId) {
    const existing = await stripe.prices.retrieve(priceId).catch(() => null);
    if (
      !existing ||
      existing.unit_amount !== addOn.monthlyPriceCents ||
      existing.currency !== "usd"
    ) {
      if (existing && existing.active) {
        await stripe.prices.update(priceId, { active: false }).catch(() => {});
      }
      priceId = null;
    }
  }
  if (!priceId) {
    const created = await stripe.prices.create({
      product: productId,
      unit_amount: addOn.monthlyPriceCents,
      currency: "usd",
      recurring: { interval: "month" },
      metadata: { addOnSlug: addOn.slug },
    });
    priceId = created.id;
  }

  await prisma.addOn.update({
    where: { id: addOn.id },
    data: { stripeProductId: productId, stripePriceId: priceId },
  });
  return { stripeProductId: productId, stripePriceId: priceId };
}

/**
 * Look up the Stripe Customer for a restaurant; create one on demand
 * (Phase 5 is when this happens for the first time since signup no
 * longer eagerly creates one).
 */
export async function ensureStripeCustomerForRestaurant(restaurantId: string): Promise<string> {
  const r = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { id: true, name: true, email: true, stripeCustomerId: true },
  });
  if (!r) throw new Error("Restaurant not found");
  if (r.stripeCustomerId) return r.stripeCustomerId;

  const stripe = await getStripe();
  const c = await stripe.customers.create({
    email: r.email || undefined,
    name: r.name,
    metadata: { restaurantId: r.id },
  });
  await prisma.restaurant.update({
    where: { id: r.id },
    data: { stripeCustomerId: c.id },
  });
  return c.id;
}
