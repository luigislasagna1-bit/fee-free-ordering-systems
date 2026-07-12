import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { requireRestaurantAccess } from "@/lib/access";
import { checkoutSessionExpiresAt, getStripe, stripeReady } from "@/lib/stripe";
import { ensureStripeCustomerForRestaurant } from "@/lib/addons";
import {
  isComplimentaryAddOnRow,
  complimentaryTrialCarryOverSec,
} from "@/lib/addon-comp";
import { getMarketplaceEligibility } from "@/lib/marketplace-eligibility";
import { euVatSubscriptionBlock } from "@/lib/vies";

/**
 * POST { addOnSlug } — start a Stripe Checkout session to subscribe the
 * current restaurant to a paid add-on. Returns { url } to redirect.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.restaurantId) return NextResponse.json({ error: "no_restaurant" }, { status: 401 });
  await requireRestaurantAccess(user, user.restaurantId);

  if (!(await stripeReady())) {
    return NextResponse.json({ error: "Billing is not configured" }, { status: 503 });
  }

  // Launch tax policy "Option A" (Luigi 2026-07-03, Fabrizio cmr1ty0lc): an
  // EU restaurant needs a VIES-validated VAT number on file before starting
  // any PAID subscription — the platform (Canadian, no EU OSS registration)
  // must only make reverse-charge B2B sales into the EU.
  const euBlock = await euVatSubscriptionBlock(user.restaurantId);
  if (euBlock) {
    return NextResponse.json(
      {
        error: "EU businesses need a VIES-registered VAT number before subscribing. Add it under Billing → Fiscal details, then try again.",
        code: euBlock.code,
        blockerHref: "/admin/billing",
      },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => ({} as any));
  const slug = String(body?.addOnSlug || "").trim();
  if (!slug) return NextResponse.json({ error: "missing_slug" }, { status: 400 });

  const addOn = await prisma.addOn.findUnique({ where: { slug } });
  if (!addOn || !addOn.isActive) {
    return NextResponse.json({ error: "addon_not_found" }, { status: 404 });
  }
  if (!addOn.stripePriceId) {
    return NextResponse.json(
      { error: "Add-on isn't synced to Stripe yet. Ask the platform admin to sync it." },
      { status: 400 }
    );
  }

  // Block duplicate subscriptions — EXCEPT free-partner-period rows
  // (trialing, no Stripe sub): those must be convertible to a real paid
  // subscription BEFORE the expire-addon-trials cron switches them off,
  // otherwise the owner literally cannot subscribe until after service
  // has already been interrupted (Luigi hit this on A1, 2026-07-11).
  const existing = await prisma.restaurantAddOn.findUnique({
    where: { restaurantId_addOnId: { restaurantId: user.restaurantId, addOnId: addOn.id } },
  });
  const convertingComplimentary = isComplimentaryAddOnRow(existing);
  if (existing && ["active", "trialing"].includes(existing.status) && !convertingComplimentary) {
    return NextResponse.json({ error: "already_subscribed" }, { status: 409 });
  }

  // Marketplace-specific: block signup if delivery is broken. Monthly
  // bundles Driver Pool free, so the gate is informational — we only
  // block when deliverySource is shipday/both AND ShipdayConfig isn't
  // actually usable. The eligibility helper returns eligible=true for
  // the monthly path even when DriverPool entitlement is missing,
  // because subscribing to monthly grants it. So this check mostly
  // catches the "owner forgot to set deliverySource" case.
  if (addOn.slug === "marketplace") {
    const eligibility = await getMarketplaceEligibility(user.restaurantId, "monthly");
    if (!eligibility.eligible) {
      return NextResponse.json(
        {
          error: eligibility.blockerMessage,
          code: eligibility.reason,
          blockerHref: eligibility.blockerHref,
        },
        { status: 412 },
      );
    }
  }

  // Dependencies — if this add-on requires others, ensure they're active.
  let deps: string[] = [];
  try {
    const arr = JSON.parse(addOn.requiredDependencies || "[]");
    if (Array.isArray(arr)) deps = arr.filter((x) => typeof x === "string");
  } catch {}
  if (deps.length > 0) {
    const depRows = await prisma.restaurantAddOn.findMany({
      where: {
        restaurantId: user.restaurantId,
        addOn: { slug: { in: deps } },
        status: { in: ["active", "trialing"] },
      },
      include: { addOn: { select: { slug: true } } },
    });
    const activeSlugs = new Set(depRows.map((r) => r.addOn.slug));
    const missing = deps.filter((d) => !activeSlugs.has(d));
    if (missing.length > 0) {
      return NextResponse.json(
        { error: "missing_dependencies", missing },
        { status: 400 }
      );
    }
  }

  // Converting a complimentary row: carry the remaining free days into
  // Stripe as trial_end, so the card is attached NOW but the first charge
  // lands when the promised free period ends — subscribing early must never
  // mean paying for days that were already free. Near-expiry ends are clamped
  // up to Stripe's 48h trial minimum (owner never billed EARLY); null only
  // when the free period is already over → billing starts immediately.
  const carryTrialEndSec = complimentaryTrialCarryOverSec(existing);

  const customerId = await ensureStripeCustomerForRestaurant(user.restaurantId);
  const stripe = await getStripe();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: addOn.stripePriceId, quantity: 1 }],
    subscription_data: {
      metadata: {
        addOnSlug: addOn.slug,
        addOnId: addOn.id,
        restaurantId: user.restaurantId,
      },
      // No trial_period_days — we no longer offer add-on trials. The
      // trialDays column on AddOn is kept for legacy compatibility but
      // is intentionally ignored here. trial_end below is NOT a trial in
      // that sense: it defers billing on a free-partner-period conversion.
      ...(carryTrialEndSec ? { trial_end: carryTrialEndSec } : {}),
    },
    metadata: {
      addOnSlug: addOn.slug,
      addOnId: addOn.id,
      restaurantId: user.restaurantId,
    },
    success_url: `${baseUrl}/admin/billing/add-ons?subscribed=${encodeURIComponent(slug)}`,
    cancel_url: `${baseUrl}/admin/billing/add-ons`,
    allow_promotion_codes: true,
    // Short fuse (Stripe default is 24h): two open sessions can BOTH be
    // completed → duplicate live subscriptions for the same add-on.
    expires_at: checkoutSessionExpiresAt(),
  });

  return NextResponse.json({ url: session.url });
}
