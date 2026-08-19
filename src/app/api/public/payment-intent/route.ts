import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { createDirectPaymentIntent, toStripeMinorUnits } from "@/lib/stripe";
import { CURRENCIES } from "@/lib/regions";
import { hasFeature } from "@/lib/entitlements";

// Currencies this route will create a PaymentIntent in: the platform catalog
// (regions.ts CURRENCIES — the same single source the admin currency pickers
// use) minus the few Stripe cannot present. This was a hand-maintained
// 12-currency mirror while the catalog had 47+, so a store whose country
// cascade stamped e.g. PKR or THB could pick its currency in admin but every
// card charge 400'd "Unsupported currency" here. Derived now so the two can
// never drift again. Luigi 2026-08-09.
//
// A currency Stripe rejects fails LOUD at charge time (Stripe API error, no
// money moves), so the exclusion list only needs the known-unsupported codes:
// IQD is not a Stripe presentment currency; RUB support is suspended.
const STRIPE_UNSUPPORTED = new Set(["iqd", "rub"]);
const ALLOWED_CURRENCIES = new Set(
  CURRENCIES.map((c) => c.code).filter((c) => !STRIPE_UNSUPPORTED.has(c)),
);
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
      // Used only to fill in `shipping.address.country` on delivery orders
      // (best-effort dispute-evidence field, never required).
      country: true,
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
    select: {
      id: true, restaurantId: true, paymentMethod: true, paymentStatus: true, total: true, creditApplied: true,
      // Needed by the dead-order gate below.
      status: true,
      // Additive fraud-signal / dispute-evidence fields (Stripe Radar fix,
      // 2026-08-03) — never used for the charge-amount reconciliation above.
      customerId: true, customerName: true, customerEmail: true,
      orderNumber: true, type: true,
      deliveryAddress: true, deliveryCity: true, deliveryZip: true,
    },
  });
  if (!dbOrder || dbOrder.restaurantId !== restaurant.id) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (dbOrder.paymentMethod !== "card") {
    return NextResponse.json({ error: "Order is not paying by card" }, { status: 400 });
  }
  // NEVER take money for an order that will never be made. The 10-minute
  // abandoned-payment sweep cancels unpaid checkouts and the kitchen can
  // reject — either way the food is not coming. This route only ever gated on
  // paymentStatus, which says nothing about whether the ORDER is still alive,
  // so a cancelled order stayed payable indefinitely. That mattered much more
  // once the payment page became reachable from a bare `?orderId=` link
  // (Luigi 2026-08-11): a customer re-opening an old link could authorize a
  // charge against a dead order. Caught in adversarial review.
  if (dbOrder.status === "cancelled" || dbOrder.status === "rejected") {
    return NextResponse.json(
      { error: "This order was cancelled and can no longer be paid for." },
      { status: 409 },
    );
  }
  // Re-presentable states only. "pending" is a first attempt; "requires_action"
  // is a 3D-Secure challenge the customer bailed out of (bank app swallowed
  // them, tab closed) — they must be able to come back and finish, which is the
  // single most common way an order got abandoned. Re-issuing is safe because
  // createDirectPaymentIntent below is idempotent per order
  // (`pi_create_<orderId>`): the customer gets the SAME PaymentIntent back, so a
  // retry can never place a second hold on their card. Terminal / in-flight
  // states (paid, authorized, processing, refunded, voided) still refuse —
  // money has already moved or is moving. Luigi 2026-08-11.
  if (dbOrder.paymentStatus !== "pending" && dbOrder.paymentStatus !== "requires_action") {
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

    // Structured shipping address for delivery/catering orders — best-effort
    // dispute-evidence field. Only sent when we have BOTH a street line and
    // a recipient name (Stripe requires `name`); silently omitted otherwise.
    const shipping =
      (dbOrder.type === "delivery" || dbOrder.type === "catering") && dbOrder.deliveryAddress && dbOrder.customerName
        ? {
            name: dbOrder.customerName,
            address: {
              line1: dbOrder.deliveryAddress,
              city: dbOrder.deliveryCity || undefined,
              postal_code: dbOrder.deliveryZip || undefined,
              // Stripe documents this as ISO-2 — the register route can now
              // store the sentinel "OTHER", which must not reach Stripe.
              country: /^[A-Za-z]{2}$/.test(restaurant.country ?? "") ? restaurant.country! : undefined,
            },
          }
        : null;

    const intent = await createDirectPaymentIntent({
      amountCents: amountMinor,
      currency: chargeCurrency,
      restaurantId: restaurant.id,
      orderId,
      // Idempotent per order: a double-submit / retry returns the SAME
      // authorization instead of placing a second hold on the card.
      idempotencyKey: `pi_create_${orderId}`,
      // Fraud-signal / dispute-evidence additions (Stripe Radar flagged our
      // intents as missing customer email) — see createDirectPaymentIntent
      // doc comment. None of these change amount/currency/capture/idempotency.
      receiptEmail: dbOrder.customerEmail,
      customerName: dbOrder.customerName,
      internalCustomerId: dbOrder.customerId,
      orderNumber: dbOrder.orderNumber,
      orderType: dbOrder.type,
      restaurantSlug,
      shipping,
    });

    // ── Persist the intent id ON THE ORDER, immediately (Luigi 2026-08-11) ────
    // Until this existed, the ONLY way the server ever learned which
    // PaymentIntent belonged to an order was the `?payment_intent=` query param
    // Stripe appends when it redirects the customer back to the confirmation
    // page. So if the customer's browser never made that round trip — tab
    // closed, signal dropped, bank app swallowed the 3DS return, in-app browser
    // ate the query string — the order was orphaned forever: money potentially
    // authorized on the card, `notifiedAt` null, kitchen never told, no email.
    // Live damage: 36 stranded card orders in 60 days, 0 of which had an intent
    // id on file, so nothing could ever reconcile them.
    //
    // With the id stored at CREATE time, the order is recoverable from the
    // server alone — that's what /api/cron/reconcile-card-payments walks. The
    // guard keeps this write honest: only claim the intent while the order is
    // still awaiting payment, so a concurrent verify that already resolved the
    // order (paid/authorized/voided) is never walked backwards.
    //
    // Best-effort by design: a failed write must not cost the customer their
    // checkout — the reconcile cron falls back to searching Stripe by
    // metadata.orderId for exactly this case.
    try {
      await prisma.order.updateMany({
        where: { id: orderId, paymentStatus: "pending", paymentIntentId: null },
        data: { paymentIntentId: intent.id },
      });
    } catch (e) {
      console.error(
        `[payment-intent] could not persist intent id for order ${orderId}:`,
        e instanceof Error ? e.message : e,
      );
    }

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
