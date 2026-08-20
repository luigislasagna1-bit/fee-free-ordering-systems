import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { requireRestaurantAccess } from "@/lib/access";
import { getStripe, stripeReady } from "@/lib/stripe";

/**
 * POST { addOnSlug } — retry payment for a past_due add-on subscription.
 *
 * Strategy: try to charge the card on file first (instant, stays on our
 * site). If that fails (card still bad, 3DS required, etc.), fall back to
 * the Stripe hosted invoice URL where the owner can update their card.
 *
 * When Stripe retries a failed charge, the subscription stays past_due and
 * the same invoice remains open with the same billing anchor. Paying that
 * invoice resumes the subscription from its original anchor date — the
 * owner is never double-charged or shifted to a new billing cycle.
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
  if (!addOn) return NextResponse.json({ error: "addon_not_found" }, { status: 404 });

  const sub = await prisma.restaurantAddOn.findUnique({
    where: { restaurantId_addOnId: { restaurantId: user.restaurantId, addOnId: addOn.id } },
  });
  if (!sub || !sub.stripeSubscriptionId) {
    return NextResponse.json({ error: "no_subscription" }, { status: 404 });
  }
  if (sub.status !== "past_due") {
    return NextResponse.json({ error: "not_past_due" }, { status: 400 });
  }

  const stripe = await getStripe();

  const invoices = await stripe.invoices.list({
    subscription: sub.stripeSubscriptionId,
    status: "open",
    limit: 1,
  });

  const invoice = invoices.data[0];
  if (!invoice) {
    return NextResponse.json({ error: "no_open_invoice" }, { status: 404 });
  }

  // Try to pay the invoice with the card on file. If the customer already
  // updated their card (via "Change card" on billing), this succeeds
  // instantly and they never leave our site.
  try {
    const paid = await stripe.invoices.pay(invoice.id);
    if (paid.status === "paid") {
      return NextResponse.json({ paid: true });
    }
  } catch {
    // Card declined, 3DS required, or other failure — fall through to the
    // hosted invoice page where the customer can update their card and
    // complete any required authentication.
  }

  if (invoice.hosted_invoice_url) {
    return NextResponse.json({ url: invoice.hosted_invoice_url });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
  return NextResponse.json({ url: `${baseUrl}/admin/billing` });
}
