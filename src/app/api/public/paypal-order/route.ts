/**
 * POST /api/public/paypal-order
 *
 * Customer-side: create a PayPal Order v2 with intent=AUTHORIZE for an
 * in-progress order. Returns the PayPal order id + approval URL — client
 * redirects the customer to PayPal where they sign in + approve.
 *
 * Mirrors /api/public/payment-intent (Stripe), but for PayPal Smart
 * Buttons / Hosted Checkout. We use AUTHORIZE intent (not CAPTURE) so we
 * can lock funds without charging — capture happens later when the
 * kitchen accepts. Same delayed-capture semantics as Stripe Connect.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { createPaypalOrder } from "@/lib/paypal";
import { hasFeature } from "@/lib/entitlements";
import { restaurantOrderUrl } from "@/lib/restaurant-url";

// Mirrors SUPPORTED_CURRENCIES in src/lib/utils.ts. PayPal supports
// all of these for direct payouts as of 2026.
const ALLOWED_CURRENCIES = new Set([
  "USD", "CAD", "EUR", "GBP", "AUD", "NZD",
  "CHF", "SEK", "NOK", "DKK", "JPY", "MXN",
]);
const MAX_AMOUNT = 10_000;

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!rateLimit(`pp:${ip}`, 10, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const restaurantSlug = String(body.restaurantSlug ?? "").trim();
  const amount = parseFloat(body.amount);
  const currency = String(body.currency ?? "USD").toUpperCase();
  const orderId = typeof body.orderId === "string" ? body.orderId.slice(0, 64) : "";

  if (!restaurantSlug) return NextResponse.json({ error: "restaurantSlug is required" }, { status: 400 });
  if (isNaN(amount) || amount <= 0) return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  if (amount > MAX_AMOUNT) return NextResponse.json({ error: `Amount cannot exceed $${MAX_AMOUNT}` }, { status: 400 });
  if (!ALLOWED_CURRENCIES.has(currency)) return NextResponse.json({ error: "Unsupported currency" }, { status: 400 });
  if (!orderId) return NextResponse.json({ error: "orderId is required" }, { status: 400 });

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug: restaurantSlug, isActive: true },
    select: {
      id: true,
      name: true,
      slug: true,
      subdomain: true,
      customDomain: true,
      customDomainStatus: true,
      paypalAccountStatus: true,
      // Source of truth for currency — overrides the client value
      // below so customers can't trigger a USD charge against a
      // EUR-configured account.
      currency: true,
    },
  });
  if (!restaurant) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  if (restaurant.paypalAccountStatus !== "connected") {
    return NextResponse.json(
      { error: "This restaurant hasn't finished PayPal setup yet" },
      { status: 400 },
    );
  }

  // Same entitlement gate as card payments — the Online Payments add-on
  // grants `card_payments`, which we treat as the umbrella entitlement
  // for any online processor (Stripe OR PayPal). If we ever want
  // PayPal-only restaurants, we'd split the entitlement; for now they
  // share the gate.
  if (!(await hasFeature(restaurant.id, "card_payments"))) {
    return NextResponse.json(
      {
        error: "Online payments are a paid add-on. The restaurant hasn't subscribed.",
        code: "feature_locked",
        feature: "card_payments",
      },
      { status: 402 },
    );
  }

  // Confirm our copy of the order exists + belongs to this restaurant.
  // We refuse to start a PayPal flow against an unknown order or one
  // that's not in a fresh state — prevents replay attacks where a
  // bad actor probes someone else's orderId.
  const dbOrder = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true, restaurantId: true, paymentMethod: true, paymentStatus: true,
      total: true, creditApplied: true, paypalOrderId: true,
    },
  });
  if (!dbOrder || dbOrder.restaurantId !== restaurant.id) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (dbOrder.paymentMethod !== "paypal") {
    return NextResponse.json({ error: "Order is not paying with PayPal" }, { status: 400 });
  }
  if (dbOrder.paymentStatus !== "pending") {
    return NextResponse.json({ error: "Order payment is already in progress" }, { status: 400 });
  }
  // Charge total MINUS Reward Dollars applied (store credit = partial payment);
  // must match within a cent. Defends against client tampering. Luigi 2026-06-27.
  const chargeable = Math.round((dbOrder.total - (dbOrder.creditApplied ?? 0)) * 100) / 100;
  if (Math.abs(chargeable - amount) > 0.01) {
    return NextResponse.json({ error: "Amount mismatch" }, { status: 400 });
  }

  // Keep the customer on the restaurant's OWN domain (verified custom domain or its
  // <subdomain>.<platform> link) through the PayPal round-trip, not the platform apex.
  // The proxy serves /paypal/return + /paypal/cancel on branded hosts. Luigi 2026-06-22.
  const returnUrl = restaurantOrderUrl(restaurant, `/paypal/return?orderId=${encodeURIComponent(orderId)}`);
  const cancelUrl = restaurantOrderUrl(restaurant, `/paypal/cancel?orderId=${encodeURIComponent(orderId)}`);

  try {
    // Restaurant-configured currency wins. PayPal's `currency_code`
    // is required uppercase ISO 4217.
    const chargeCurrency = (restaurant.currency || currency || "USD").toUpperCase();
    const created = await createPaypalOrder({
      restaurantId: restaurant.id,
      orderId,
      amount,
      currency: chargeCurrency,
      description: `Order from ${restaurant.name}`.slice(0, 127),
      returnUrl,
      cancelUrl,
    });

    // Save the paypalOrderId so we can authorize/capture against it
    // even if the customer takes a long detour through PayPal.
    await prisma.order.update({
      where: { id: orderId },
      data: { paypalOrderId: created.paypalOrderId },
    });

    return NextResponse.json({
      paypalOrderId: created.paypalOrderId,
      approveUrl: created.approveUrl,
    });
  } catch (err: unknown) {
    console.error("[paypal-order create]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "PayPal setup failed. Please try again or use another payment method." },
      { status: 400 },
    );
  }
}
