import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { createDirectPaymentIntent, toStripeMinorUnits } from "@/lib/stripe";
import { hasFeature } from "@/lib/entitlements";

// Currencies we support charging in across Stripe + PayPal + our UI.
// Mirrors SUPPORTED_CURRENCIES in src/lib/utils.ts — keep in sync.
const ALLOWED_CURRENCIES = new Set([
  "usd", "cad", "eur", "gbp", "aud", "nzd",
  "chf", "sek", "nok", "dkk", "jpy", "mxn",
]);
const MAX_AMOUNT = 10_000; // $10,000 hard cap

/**
 * Create a Stripe PaymentIntent for a customer order on the RESTAURANT'S OWN
 * Stripe account (key-only model). The restaurant's own secret key creates a
 * manual-capture authorization; 100% of funds land in their balance. The
 * client confirms using the restaurant's OWN publishable key (returned here),
 * loaded WITHOUT a `stripeAccount` option. No Connect, no platform fee.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!rateLimit(`pi:${ip}`, 10, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
  }

  const body = await req.json();
  const restaurantSlug = String(body.restaurantSlug ?? "").trim();
  const amount = parseFloat(body.amount);
  const currency = String(body.currency ?? "usd").toLowerCase();
  const rawMeta = body.metadata && typeof body.metadata === "object" ? body.metadata : {};

  if (!restaurantSlug) return NextResponse.json({ error: "restaurantSlug is required" }, { status: 400 });
  if (isNaN(amount) || amount <= 0) return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  if (amount > MAX_AMOUNT) return NextResponse.json({ error: `Amount cannot exceed $${MAX_AMOUNT}` }, { status: 400 });
  if (!ALLOWED_CURRENCIES.has(currency)) return NextResponse.json({ error: "Unsupported currency" }, { status: 400 });

  const orderId = typeof rawMeta.orderId === "string" ? rawMeta.orderId.slice(0, 64) : "";
  if (!orderId) {
    return NextResponse.json({ error: "orderId is required" }, { status: 400 });
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug: restaurantSlug, isActive: true },
    select: {
      id: true,
      // The restaurant's chosen settlement currency. We OVERRIDE the
      // client-supplied currency with this so customers can't trigger
      // a USD charge against a EUR-configured account (Stripe would
      // reject it anyway, but failing earlier is cleaner). The client
      // `currency` is kept as a sanity probe — if it disagrees with
      // the restaurant's, we trust the restaurant.
      currency: true,
      // Key-only model: card payments are available iff the restaurant
      // saved active Stripe keys. We don't need the keys here — the
      // charge helper loads + decrypts them — only to gate cleanly.
      paymentProvider: { select: { isActive: true, publishableKey: true } },
    },
  });
  if (!restaurant) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });

  if (!restaurant.paymentProvider?.isActive || !restaurant.paymentProvider.publishableKey) {
    return NextResponse.json(
      { error: "Restaurant hasn't finished payment setup yet" },
      { status: 400 }
    );
  }

  // Phase 5 entitlement gate — online card payments require the
  // `card_payments` feature, which the "Online Payments" add-on grants.
  // Restaurants without the add-on can still take cash/pay-at-store but
  // can't accept card payments through this endpoint.
  if (!(await hasFeature(restaurant.id, "card_payments"))) {
    return NextResponse.json(
      {
        error: "Online card payments are a paid add-on. The restaurant hasn't subscribed.",
        code: "feature_locked",
        feature: "card_payments",
      },
      { status: 402 }
    );
  }

  // ── Reconcile the charge amount against OUR order (security: P0) ──────────
  // The client-supplied `amount` is NEVER trusted as the charge total. We
  // re-fetch the order we priced server-side and refuse unless it exists, is
  // this restaurant's, is a fresh card order, and the amount matches the order
  // total within a cent. Without this, a customer could place a $50 order and
  // authorize $0.50 — the kitchen fires and the order shows "paid". This mirrors
  // the guard already in /api/public/paypal-order (lines 91-111).
  const dbOrder = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, restaurantId: true, paymentMethod: true, paymentStatus: true, total: true, creditApplied: true },
  });
  if (!dbOrder || dbOrder.restaurantId !== restaurant.id) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (dbOrder.paymentMethod !== "card") {
    return NextResponse.json({ error: "Order is not paying by card" }, { status: 400 });
  }
  if (dbOrder.paymentStatus !== "pending") {
    return NextResponse.json({ error: "Order payment is already in progress" }, { status: 400 });
  }
  // Charge total MINUS any Reward Dollars applied (store credit is a partial
  // payment). The client must request exactly this amount. Luigi 2026-06-27.
  const chargeable = Math.round((dbOrder.total - (dbOrder.creditApplied ?? 0)) * 100) / 100;
  if (Math.abs(chargeable - amount) > 0.01) {
    return NextResponse.json({ error: "Amount mismatch" }, { status: 400 });
  }

  try {
    // Always charge in the restaurant's configured currency — the
    // client value is advisory only.
    const chargeCurrency = (restaurant.currency || currency || "usd").toLowerCase();
    // Zero-decimal currencies (JPY etc) — Stripe expects whole units, not
    // cents. Shared helper so charge and refund can never disagree (a
    // drift between them would mis-refund by 100×).
    const amountMinor = toStripeMinorUnits(amount, chargeCurrency);
    const intent = await createDirectPaymentIntent({
      amountCents: amountMinor,
      currency: chargeCurrency,
      restaurantId: restaurant.id,
      orderId,
      // Idempotent per order: a double-submit / retry returns the SAME
      // authorization instead of placing a second hold on the card.
      idempotencyKey: `pi_create_${orderId}`,
    });
    return NextResponse.json({
      clientSecret: intent.clientSecret,
      // The restaurant's OWN publishable key — the client loads Stripe.js
      // with this and NO stripeAccount option (key-only model).
      publishableKey: intent.publishableKey,
      stripeAccount: null,
    });
  } catch (err: unknown) {
    console.error("[payment-intent]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "Payment setup failed. Please try again or use another payment method." },
      { status: 400 }
    );
  }
}
