import { NextRequest, NextResponse } from "next/server";
import { getStripe, getWebhookSecret } from "@/lib/stripe";
import { dispatchStripeEvent } from "@/lib/stripe/events";

// Stripe's signature verification needs the raw request body — NOT the parsed
// JSON. The runtime + dynamic flags below stop Next.js from caching or
// pre-parsing anything for this route.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // 1. Read raw body for signature verification
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  // 2. Verify signature
  let event;
  try {
    const stripe = await getStripe();
    const secret = await getWebhookSecret();
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch (err: any) {
    console.error("[stripe webhook] signature verification failed:", err?.message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // 3. Dispatch to per-domain handler. The dispatcher handles idempotency,
  //    logs to StripeWebhookEvent, and routes by event.type.
  try {
    const result = await dispatchStripeEvent(event);
    return NextResponse.json({ received: true, ...result });
  } catch (err: any) {
    // Dispatcher throws on handler error → 500 → Stripe retries with backoff.
    return NextResponse.json(
      { error: err?.message ?? "handler failure" },
      { status: 500 }
    );
  }
}

// GET for ping/health-check from Stripe dashboard's "Send test webhook" UI
// and uptime checkers. Always 200 OK.
export async function GET() {
  return NextResponse.json({
    endpoint: "stripe-webhook",
    ok: true,
    timestamp: new Date().toISOString(),
  });
}
