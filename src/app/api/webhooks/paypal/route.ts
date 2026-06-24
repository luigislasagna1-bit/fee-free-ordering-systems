/**
 * PayPal webhook receiver.
 *
 * Single endpoint that takes events for ALL restaurants. PayPal sends one
 * webhook per registered app — and since each restaurant has their OWN
 * REST app under their OWN PayPal account, each restaurant's events arrive
 * here as discrete POSTs. We discriminate by:
 *
 *   1. The event's `resource.purchase_units[0].custom_id` or `resource.id`
 *      mapping back to a row in our Order table → tells us the restaurantId.
 *   2. Whatever PayPal webhook ID we registered for that restaurant
 *      (paypalWebhookId column) — used for signature verification.
 *
 * Idempotency via PaypalWebhookEvent table — same shape as the Stripe one.
 * Failure to verify or to find the order doesn't kill the response: PayPal
 * will retry up to 25 times over 3 days. We return 200 on idempotent
 * duplicates so it stops retrying, but 400/500 on genuine failures so it
 * does retry.
 *
 * Events we care about:
 *   - PAYMENT.AUTHORIZATION.CREATED  → authorize succeeded, customer's
 *       funds are locked. Fire kitchen notification if not already fired
 *       (the customer-flow `/authorize` endpoint races this; idempotent
 *       on notifiedAt so duplicates are no-ops).
 *   - PAYMENT.CAPTURE.COMPLETED       → capture cleared. Flip paymentStatus
 *       to "paid". The `/api/orders/[id]` PATCH on accept already does
 *       this inline so this is the safety net.
 *   - PAYMENT.AUTHORIZATION.VOIDED    → restaurant rejected; void cleared.
 *       Flip paymentStatus to "voided". (`/api/orders/[id]` reject path
 *       already does this inline.)
 *   - PAYMENT.CAPTURE.REFUNDED        → refund cleared. Flip paymentStatus
 *       to "refunded".
 *
 * For now we DON'T register webhooks during onboarding (it'd need a second
 * round-trip and PayPal's webhook API has some setup pain). The customer
 * flow has explicit synchronous calls in /api/public/paypal-order/.../authorize
 * and in /api/orders/[id] PATCH, so webhooks are best-effort backups. The
 * paypalWebhookId column is reserved for the future enhancement.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { verifyPaypalWebhookSignature, getPaypalOrder } from "@/lib/paypal";
import { fireOrderNotifications } from "@/lib/order-notifications";

type PaypalEvent = {
  id: string;
  event_type: string;
  resource_type?: string;
  resource?: {
    id?: string;
    custom_id?: string;
    status?: string;
    supplementary_data?: {
      related_ids?: {
        order_id?: string;
        authorization_id?: string;
        capture_id?: string;
      };
    };
    purchase_units?: Array<{
      custom_id?: string;
      reference_id?: string;
      payments?: {
        authorizations?: Array<{ id: string }>;
        captures?: Array<{ id: string }>;
      };
    }>;
  };
};

export async function POST(req: NextRequest) {
  // Read body as text first — we need the raw string for PayPal's
  // signature verification.
  const rawBody = await req.text();
  let evt: PaypalEvent;
  try {
    evt = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!evt.id || !evt.event_type) {
    return NextResponse.json({ error: "Malformed event" }, { status: 400 });
  }

  // Idempotency claim BEFORE any side effects. If we've already seen
  // this event id, drop on the floor — PayPal will stop retrying once
  // it sees a 200.
  try {
    await prisma.paypalWebhookEvent.create({
      data: {
        paypalEventId: evt.id,
        eventType: evt.event_type,
        resourceId: evt.resource?.id ?? null,
        status: "received",
      },
    });
  } catch (e: unknown) {
    // Unique-constraint violation on paypalEventId = duplicate. Acknowledge
    // and skip the side-effect path.
    if (e && typeof e === "object" && (e as { code?: string }).code === "P2002") {
      return NextResponse.json({ received: true, deduped: true });
    }
    console.error("[paypal webhook] claim failed:", e);
    return NextResponse.json({ error: "Claim failed" }, { status: 500 });
  }

  try {
    // Resolve which order this event is about. PayPal puts our orderId
    // in purchase_units[0].custom_id (we set it during createPaypalOrder),
    // but the path depends on the resource type — capture events nest it
    // differently than authorization events. Try a few locations.
    const orderId = pickOrderId(evt);
    if (!orderId) {
      // No mappable order — could be a TEST webhook or a malformed event.
      // Mark "ignored" so we don't retry forever; 200 so PayPal stops.
      await markEvent(evt.id, "ignored", "No mappable orderId in event");
      return NextResponse.json({ received: true, mapped: false });
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true, restaurantId: true, paymentMethod: true, paymentStatus: true,
        paypalOrderId: true, paypalAuthorizationId: true, paypalCaptureId: true,
        notifiedAt: true,
      },
    });
    if (!order) {
      await markEvent(evt.id, "ignored", `Order ${orderId} not found`);
      return NextResponse.json({ received: true, mapped: false });
    }

    // OPTIONAL: signature verification. Only attempted if the restaurant
    // has registered a webhook id with us. Without it we accept the event
    // on faith — fine for now because the customer-flow path already has
    // the synchronous authorize call as the authoritative truth source.
    const r = await prisma.restaurant.findUnique({
      where: { id: order.restaurantId },
      select: { paypalWebhookId: true },
    });
    if (r?.paypalWebhookId) {
      const h = req.headers;
      const verified = await verifyPaypalWebhookSignature({
        restaurantId: order.restaurantId,
        webhookId: r.paypalWebhookId,
        headers: {
          transmissionId: h.get("paypal-transmission-id") ?? "",
          transmissionTime: h.get("paypal-transmission-time") ?? "",
          transmissionSig: h.get("paypal-transmission-sig") ?? "",
          certUrl: h.get("paypal-cert-url") ?? "",
          authAlgo: h.get("paypal-auth-algo") ?? "",
        },
        rawBody,
      });
      if (!verified) {
        await markEvent(evt.id, "failed", "Signature verification failed");
        return NextResponse.json({ error: "Bad signature" }, { status: 400 });
      }
    }

    // ── Reconcile against PayPal before ANY side-effect (security: P0) ──────
    // The event body is attacker-controllable — the orderId (custom_id) is
    // visible in the customer's own order URL — and signature verification is
    // not yet wired (paypalWebhookId is never set, so the block above is a
    // no-op today). So we NEVER trust the event: we re-fetch the REAL order
    // from PayPal using OUR stored paypalOrderId + the restaurant's own
    // credentials, and act only on statuses PayPal itself confirms. The
    // synchronous customer authorize + capture-on-accept paths remain the
    // authoritative sources, so a strict/failed reconcile loses no function —
    // it only refuses to act on forged or unverifiable events.
    if (!order.paypalOrderId) {
      await markEvent(evt.id, "ignored", "No paypalOrderId on our order — unverifiable event");
      return NextResponse.json({ received: true, reconciled: false });
    }
    let live: PaypalLiveStatus;
    try {
      live = await readPaypalLiveStatus(order.restaurantId, order.paypalOrderId);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      await markEvent(evt.id, "failed", `Reconcile fetch failed: ${msg}`).catch(() => {});
      // 500 → PayPal retries; we'd rather retry than act on an unverified event.
      return NextResponse.json({ error: "Reconcile failed" }, { status: 500 });
    }

    await dispatchPaypalEvent(evt, order, live);
    await markEvent(evt.id, "processed");
    return NextResponse.json({ received: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[paypal webhook] handler failed:", msg);
    await markEvent(evt.id, "failed", msg).catch(() => {});
    // 500 → PayPal retries.
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
}

function pickOrderId(evt: PaypalEvent): string | null {
  // Most events carry custom_id on the purchase unit; capture events
  // carry it at resource.custom_id directly.
  const pu = evt.resource?.purchase_units?.[0];
  return (
    pu?.custom_id ??
    pu?.reference_id ??
    evt.resource?.custom_id ??
    null
  );
}

async function markEvent(eventId: string, status: string, errorMessage?: string) {
  await prisma.paypalWebhookEvent.update({
    where: { paypalEventId: eventId },
    data: { status, processedAt: new Date(), errorMessage: errorMessage ?? null },
  });
}

type PaypalLiveStatus = {
  authStatus: string | null;
  captureStatus: string | null;
  authId: string | null;
  captureId: string | null;
};

/** Re-fetch the REAL order from PayPal (via the restaurant's own credentials)
 *  and extract the authoritative authorization + capture statuses. This is how
 *  we reconcile webhook events we cannot cryptographically trust yet — we read
 *  the truth straight from PayPal using OUR stored paypalOrderId, never the
 *  (attacker-controllable) event body. PayPal v2 order shape:
 *  purchase_units[].payments.{authorizations,captures}[].status */
async function readPaypalLiveStatus(restaurantId: string, paypalOrderId: string): Promise<PaypalLiveStatus> {
  const o = (await getPaypalOrder({ restaurantId, paypalOrderId })) as {
    purchase_units?: Array<{
      payments?: {
        authorizations?: Array<{ id?: string; status?: string }>;
        captures?: Array<{ id?: string; status?: string }>;
      };
    }>;
  };
  const pay = o?.purchase_units?.[0]?.payments;
  const auth = pay?.authorizations?.[0];
  const cap = pay?.captures?.[0];
  return {
    authStatus: auth?.status ?? null,
    captureStatus: cap?.status ?? null,
    authId: auth?.id ?? null,
    captureId: cap?.id ?? null,
  };
}

async function dispatchPaypalEvent(
  evt: PaypalEvent,
  order: { id: string; paymentStatus: string; notifiedAt: Date | null; paypalAuthorizationId: string | null; paypalCaptureId: string | null },
  live: PaypalLiveStatus,
): Promise<void> {
  switch (evt.event_type) {
    case "PAYMENT.AUTHORIZATION.CREATED": {
      // Only release to the kitchen / mark authorized if PayPal CONFIRMS a real
      // authorization. CREATED = funds locked & capturable; CAPTURED = already
      // charged (also proves the auth happened). Anything else (none / DENIED /
      // EXPIRED / VOIDED) means a forged or stale event — ignore it.
      if (live.authStatus !== "CREATED" && live.authStatus !== "CAPTURED") return;
      if (order.paymentStatus === "pending") {
        await prisma.order.update({
          where: { id: order.id },
          data: {
            paymentStatus: "authorized",
            paypalAuthorizationId: live.authId ?? order.paypalAuthorizationId,
          },
        });
      }
      if (!order.notifiedAt) {
        await fireOrderNotifications(order.id).catch((e) =>
          console.error("[paypal webhook] fireOrderNotifications:", e)
        );
      }
      return;
    }
    case "PAYMENT.CAPTURE.COMPLETED": {
      // Only mark paid if PayPal confirms a COMPLETED capture.
      if (live.captureStatus !== "COMPLETED") return;
      if (order.paymentStatus !== "paid") {
        await prisma.order.update({
          where: { id: order.id },
          data: {
            paymentStatus: "paid",
            paypalCaptureId: live.captureId ?? order.paypalCaptureId,
          },
        });
      }
      return;
    }
    case "PAYMENT.AUTHORIZATION.VOIDED": {
      // Only void if PayPal confirms the authorization is actually VOIDED.
      if (live.authStatus !== "VOIDED") return;
      if (order.paymentStatus !== "voided" && order.paymentStatus !== "refunded") {
        await prisma.order.update({
          where: { id: order.id },
          data: { paymentStatus: "voided" },
        });
      }
      return;
    }
    case "PAYMENT.CAPTURE.REFUNDED":
    case "PAYMENT.CAPTURE.REVERSED": {
      // Only mark refunded if PayPal confirms the capture was refunded/reversed.
      if (
        live.captureStatus !== "REFUNDED" &&
        live.captureStatus !== "PARTIALLY_REFUNDED" &&
        live.captureStatus !== "REVERSED"
      ) return;
      if (order.paymentStatus !== "refunded") {
        await prisma.order.update({
          where: { id: order.id },
          data: { paymentStatus: "refunded", refundStatus: "refunded" },
        });
      }
      return;
    }
    default:
      // Unhandled event type — no-op.
      return;
  }
}
