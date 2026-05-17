import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { requireRestaurantAccess } from "@/lib/access";
import { getStripe, stripeReady } from "@/lib/stripe";
import { ensureStripeCustomerForRestaurant } from "@/lib/addons";

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

  // Block duplicate subscriptions
  const existing = await prisma.restaurantAddOn.findUnique({
    where: { restaurantId_addOnId: { restaurantId: user.restaurantId, addOnId: addOn.id } },
  });
  if (existing && ["active", "trialing"].includes(existing.status)) {
    return NextResponse.json({ error: "already_subscribed" }, { status: 409 });
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
      ...(addOn.trialDays && addOn.trialDays > 0
        ? { trial_period_days: addOn.trialDays }
        : {}),
    },
    metadata: {
      addOnSlug: addOn.slug,
      addOnId: addOn.id,
      restaurantId: user.restaurantId,
    },
    success_url: `${baseUrl}/admin/billing/add-ons?subscribed=${encodeURIComponent(slug)}`,
    cancel_url: `${baseUrl}/admin/billing/add-ons`,
    allow_promotion_codes: true,
  });

  return NextResponse.json({ url: session.url });
}
