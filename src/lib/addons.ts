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
    /** Roadmap teaser flag. When true, the catalog card renders a
     *  "Coming Soon" badge and the subscribe button is disabled — the
     *  add-on is publicly committed to but not yet built. */
    comingSoon: a.comingSoon ?? false,
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
 *
 * RECONCILIATION: when the restaurant already has a stripeCustomerId,
 * we also verify the Stripe-side `name`, `email`, and metadata.restaurantId
 * still match. If they've drifted (e.g. restaurant was renamed in admin,
 * or an old customer got reused) we patch the Stripe customer to match.
 * Without this, Stripe Checkout pages render the wrong restaurant name
 * at the top of the payment form — we hit this exact bug 2026-05-21
 * when "Ristorante Test" was showing as "Luigis Lasagna & Pizzeria Inc."
 * because that customer was originally created under a different name.
 *
 * Reconcile is best-effort — Stripe API failure does NOT block the
 * billing flow. We just log and return the stale-named customer.
 */
export async function ensureStripeCustomerForRestaurant(restaurantId: string): Promise<string> {
  const r = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { id: true, name: true, email: true, stripeCustomerId: true },
  });
  if (!r) throw new Error("Restaurant not found");

  const stripe = await getStripe();

  if (r.stripeCustomerId) {
    // Reconcile in the background — don't await if it slows the billing
    // flow, but do await here because the result is on-screen immediately
    // (Stripe Checkout pulls name from the customer object).
    let mustRecreate = false;
    try {
      const existing = await stripe.customers.retrieve(r.stripeCustomerId);
      if (("deleted" in existing) && existing.deleted) {
        mustRecreate = true; // deleted on Stripe — id is unusable
      } else {
        const c = existing as { name?: string | null; email?: string | null; metadata?: Record<string, string> };
        const expectedRestaurantId = r.id;
        const expectedName = r.name;
        const expectedEmail = r.email || null;
        const nameDrift = (c.name || "") !== expectedName;
        const emailDrift = (c.email || null) !== expectedEmail;
        const metadataDrift = (c.metadata?.restaurantId || "") !== expectedRestaurantId;
        if (nameDrift || emailDrift || metadataDrift) {
          await stripe.customers.update(r.stripeCustomerId, {
            name: expectedName,
            email: expectedEmail || undefined,
            metadata: { ...(c.metadata || {}), restaurantId: expectedRestaurantId },
          });
        }
      }
    } catch (e: any) {
      // SELF-HEAL (platform test→live switch, 2026-07-10): a customer id
      // minted on a different Stripe account/mode comes back resource_missing
      // here — returning it anyway makes every Checkout/Portal call fail with
      // "No such customer". Definitive "doesn't exist" → mint a fresh one.
      // Transient errors (network etc.) keep the old id — never churn
      // customers on a flaky call.
      if (e?.code === "resource_missing" || e?.raw?.code === "resource_missing" || e?.statusCode === 404) {
        mustRecreate = true;
      } else {
        console.error(`[ensureStripeCustomerForRestaurant] reconcile failed for ${r.stripeCustomerId}`, e);
      }
    }
    if (!mustRecreate) return r.stripeCustomerId;
    console.warn(`[ensureStripeCustomerForRestaurant] ${r.stripeCustomerId} missing on current Stripe account — creating a replacement for restaurant ${r.id}`);
  }

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

/**
 * True iff this restaurant has at least one saved payment method on
 * their Stripe Customer that Stripe will auto-charge for invoices.
 *
 * The signal is Stripe's `invoice_settings.default_payment_method` — that's
 * the card future invoices use. A customer with a card "attached" but no
 * default set will NOT auto-charge, so we check the default specifically.
 *
 * Returns false (not an error) for restaurants who don't have a Stripe
 * Customer yet — they obviously can't have a default payment method.
 *
 * Used by:
 *   - PAYG marketplace opt-in (gate before allowing opt-in)
 *   - Add-on subscription flows that want to check before redirecting
 *     to Checkout (so we can pre-attach a card when needed)
 */
export async function restaurantHasCardOnFile(restaurantId: string): Promise<boolean> {
  const r = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { stripeCustomerId: true },
  });
  if (!r?.stripeCustomerId) return false;

  try {
    const stripe = await getStripe();
    const customer = await stripe.customers.retrieve(r.stripeCustomerId);
    if ("deleted" in customer && customer.deleted) return false;
    const defaultPm = (customer as any).invoice_settings?.default_payment_method;
    // default_payment_method can be either a string ID or a full PM object.
    return !!defaultPm;
  } catch (e) {
    console.error(`[restaurantHasCardOnFile] Stripe lookup failed for ${restaurantId}`, e);
    return false;
  }
}

/**
 * The brand + last4 + expiry of the restaurant's DEFAULT payment method
 * (the card future invoices auto-charge), or null when none is on file / the
 * restaurant has no Stripe Customer yet. Read-only, best-effort — any Stripe
 * hiccup degrades to null (the caller just shows "no card saved"). Powers the
 * billing page's "Payment method" card so an owner can save a card ahead of
 * enabling any paid service (Fabrizio cmr1u3qxm).
 */
export async function getRestaurantDefaultCard(
  restaurantId: string,
): Promise<{ brand: string; last4: string; expMonth: number; expYear: number } | null> {
  const r = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { stripeCustomerId: true },
  });
  if (!r?.stripeCustomerId) return null;
  try {
    const stripe = await getStripe();
    const customer = await stripe.customers.retrieve(r.stripeCustomerId, {
      expand: ["invoice_settings.default_payment_method"],
    });
    if ("deleted" in customer && customer.deleted) return null;
    const pm: any = (customer as any).invoice_settings?.default_payment_method;
    const card = pm && typeof pm === "object" ? pm.card : null;
    if (!card) return null;
    return {
      brand: card.brand ?? "card",
      last4: card.last4 ?? "",
      expMonth: card.exp_month ?? 0,
      expYear: card.exp_year ?? 0,
    };
  } catch (e) {
    console.error(`[getRestaurantDefaultCard] Stripe lookup failed for ${restaurantId}`, e);
    return null;
  }
}
