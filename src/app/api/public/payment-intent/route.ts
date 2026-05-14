import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encrypt";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

const ALLOWED_CURRENCIES = new Set(["usd", "cad", "gbp", "eur", "aud"]);
const MAX_AMOUNT = 10_000; // $10,000 hard cap

export async function POST(req: NextRequest) {
  // Rate limit: 10 payment intent requests per IP per minute
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

  // Whitelist metadata keys to prevent injection
  const safeMetadata: Record<string, string> = {};
  if (typeof rawMeta.orderId === "string") safeMetadata.orderId = rawMeta.orderId.slice(0, 64);

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug: restaurantSlug, isActive: true },
    include: { paymentProvider: true },
  });
  if (!restaurant) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });

  const provider = restaurant.paymentProvider;
  if (!provider?.isActive || !provider.secretKeyEnc) {
    return NextResponse.json({ error: "Online payment is not configured for this restaurant" }, { status: 400 });
  }

  let secretKey: string;
  try {
    secretKey = decrypt(provider.secretKeyEnc, provider.secretKeyIv, provider.secretKeyTag);
  } catch {
    return NextResponse.json({ error: "Payment configuration error" }, { status: 500 });
  }

  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(secretKey, { apiVersion: "2026-04-22.dahlia" });
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency,
      metadata: { restaurantId: restaurant.id, ...safeMetadata },
      automatic_payment_methods: { enabled: true },
    });
    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      publishableKey: provider.publishableKey,
    });
  } catch (err: unknown) {
    // Never forward Stripe's raw message — it may contain key fragments
    console.error("[payment-intent]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Payment setup failed. Please try again or use another payment method." }, { status: 400 });
  }
}
