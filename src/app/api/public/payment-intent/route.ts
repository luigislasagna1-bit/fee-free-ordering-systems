import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import {
  createDestinationPaymentIntent,
  getPublishableKey,
  stripeReady,
} from "@/lib/stripe";
import { hasFeature } from "@/lib/entitlements";

const ALLOWED_CURRENCIES = new Set(["usd", "cad", "gbp", "eur", "aud"]);
const MAX_AMOUNT = 10_000; // $10,000 hard cap

/**
 * Create a Stripe PaymentIntent for a customer order via Connect destination
 * charge. The platform's secret key creates the intent; funds (minus the
 * platform application fee) settle into the restaurant's connected Express
 * account. The client confirms the payment using the platform's publishable
 * key — no per-restaurant publishable key needed.
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

  if (!(await stripeReady())) {
    return NextResponse.json({ error: "Online payment is not configured on the platform" }, { status: 503 });
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug: restaurantSlug, isActive: true },
    select: {
      id: true,
      name: true,
      stripeAccountId: true,
      stripeChargesEnabled: true,
    },
  });
  if (!restaurant) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });

  if (!restaurant.stripeAccountId || !restaurant.stripeChargesEnabled) {
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

  try {
    const intent = await createDestinationPaymentIntent({
      amountCents: Math.round(amount * 100),
      currency,
      restaurantStripeAccountId: restaurant.stripeAccountId,
      orderId,
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
    });
    return NextResponse.json({
      clientSecret: intent.clientSecret,
      publishableKey: await getPublishableKey(),
    });
  } catch (err: unknown) {
    console.error("[payment-intent]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "Payment setup failed. Please try again or use another payment method." },
      { status: 400 }
    );
  }
}
