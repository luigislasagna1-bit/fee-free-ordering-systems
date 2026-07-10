/**
 * ShipDay webhook receiver.
 *
 * ShipDay POSTs status updates to this endpoint as drivers move through
 * the lifecycle:
 *
 *   ORDER_DRIVER_ASSIGNED   driver claimed the dispatch
 *   ORDER_ONTHEWAY_STATUS   driver picked up the food
 *   ORDER_COMPLETED         delivered to customer
 *   ORDER_FAILED_DELIVERY   couldn't deliver (no answer, wrong address, etc.)
 *   ORDER_CANCELLED         driver / dispatcher cancelled
 *
 * Body shape (per ShipDay docs):
 *   {
 *     event: "ORDER_ONTHEWAY_STATUS",
 *     order: { orderId: 12345, additionalId: "ord_..." | "internal-id" },
 *     ...
 *   }
 *
 * We use `additionalId` (which we set to our internal Order.id at
 * dispatch time) to find the right Order row. Falls back to looking up
 * by shipdayOrderId if additionalId is missing.
 *
 * Security: ShipDay supports a shared secret token in the request. We
 * verify it matches the SHIPDAY_WEBHOOK_TOKEN env var. In PRODUCTION the
 * token is REQUIRED — an unauthenticated caller who knows/guesses an order
 * id could otherwise flip live orders to ready/completed (hardening
 * 2026-07-10; previously this failed OPEN with just a log line). In dev the
 * old warn-and-accept behaviour survives for local testing without ShipDay.
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { translateShipdayEvent } from "@/lib/shipday";
import { timingSafeEqualString } from "@/lib/security";
import { redeemCouponsForOrder } from "@/lib/coupon-ledger";
import { redeemForOrder as redeemRewardForOrder, awardForOrder as awardRewardForOrder } from "@/lib/reward-ledger";
import { awardEarnRulesForOrder, awardPromoCreditsForOrder } from "@/lib/reward-earn";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Verify the shared-secret token. ShipDay sends it via the `token` query
  // param (per their docs) or a custom header — we accept both.
  const expected = process.env.SHIPDAY_WEBHOOK_TOKEN;
  if (expected) {
    const tokenFromQuery = req.nextUrl.searchParams.get("token");
    const tokenFromHeader = req.headers.get("x-shipday-token");
    const provided = tokenFromQuery ?? tokenFromHeader ?? "";
    if (!timingSafeEqualString(provided, expected)) {
      console.warn("[shipday webhook] rejected — token mismatch");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    // Fail CLOSED in prod: no token configured = endpoint disabled.
    console.error("[shipday webhook] SHIPDAY_WEBHOOK_TOKEN not set — rejecting (fail closed in production)");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 401 });
  } else {
    console.warn("[shipday webhook] SHIPDAY_WEBHOOK_TOKEN not set — accepting any caller (dev only).");
  }

  let body: {
    event?: string;
    order?: { orderId?: number | string; additionalId?: string };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = body.event ?? "";
  const additionalId = body.order?.additionalId ?? null;
  const shipdayOrderId = body.order?.orderId != null ? String(body.order.orderId) : null;

  if (!event) {
    return NextResponse.json({ error: "Missing event field" }, { status: 400 });
  }
  if (!additionalId && !shipdayOrderId) {
    return NextResponse.json({ error: "Missing order identifier" }, { status: 400 });
  }

  // Locate the Order row. Prefer the additionalId (our internal ID) as
  // it's a direct primary-key lookup. Fall back to scanning by
  // shipdayOrderId for events where additionalId got dropped.
  const order = additionalId
    ? await prisma.order.findUnique({ where: { id: additionalId } })
    : await prisma.order.findFirst({ where: { shipdayOrderId: shipdayOrderId! } });

  if (!order) {
    console.warn("[shipday webhook] no matching order", { additionalId, shipdayOrderId, event });
    // Return 200 so ShipDay doesn't retry forever on permanently-missing
    // orders. We've logged it for investigation.
    return NextResponse.json({ ok: true, skipped: "no_matching_order" });
  }

  // Only orders we actually HANDED to ShipDay may be driven by this webhook
  // (dispatch stamps shipdayStatus/dispatchedAt — see the accept path in
  // /api/orders/[id]). Without this, a token-holding caller could steer any
  // pickup/dine-in order that was never dispatched. The one legitimate
  // pre-stamp case — ORDER_DRIVER_ASSIGNED racing ahead of our dispatch
  // response — is allowed through by EVENT TYPE only (it merely stamps
  // shipdayStatus "assigned", never order.status).
  const wasDispatched = !!order.shipdayOrderId || !!order.shipdayStatus || !!order.dispatchedAt;
  const isAssignmentEvent = /ASSIGNED/i.test(event);
  if (!wasDispatched && !isAssignmentEvent) {
    console.warn("[shipday webhook] order was never dispatched to ShipDay — ignoring", { orderId: order.id, event });
    return NextResponse.json({ ok: true, skipped: "not_dispatched" });
  }
  // When both ids are present they must AGREE — a mismatched orderId with a
  // valid additionalId is a spoof or a ShipDay data bug either way.
  if (order.shipdayOrderId && shipdayOrderId && order.shipdayOrderId !== shipdayOrderId) {
    console.warn("[shipday webhook] shipdayOrderId mismatch — ignoring", { orderId: order.id, ours: order.shipdayOrderId, theirs: shipdayOrderId, event });
    return NextResponse.json({ ok: true, skipped: "id_mismatch" });
  }

  const { shipdayStatus, orderStatus } = translateShipdayEvent(event);
  if (!shipdayStatus && !orderStatus) {
    // Unknown event — log + acknowledge so ShipDay stops retrying.
    console.log("[shipday webhook] unknown event ignored", event);
    return NextResponse.json({ ok: true, skipped: "unknown_event" });
  }

  const updates: Record<string, unknown> = {};
  if (shipdayStatus) updates.shipdayStatus = shipdayStatus;
  // FORWARD-ONLY: delivery progress must never resurrect a terminal order —
  // a late/replayed ORDER_COMPLETED on a cancelled/rejected/refunded order
  // would flip it back to completed (and re-trigger completion side effects).
  const TERMINAL = new Set(["cancelled", "rejected", "completed"]);
  if (orderStatus && !TERMINAL.has(order.status)) {
    updates.status = orderStatus;
    if (orderStatus === "completed") updates.completedAt = new Date();
  }
  // Capture the shipdayOrderId if we didn't already have it (edge case:
  // ORDER_ASSIGNED fires before our dispatch response landed).
  if (!order.shipdayOrderId && shipdayOrderId) {
    updates.shipdayOrderId = shipdayOrderId;
  }

  await prisma.order.update({
    where: { id: order.id },
    data: updates,
  });

  // A ShipDay-driven completion bypasses the [id] PATCH route AND the
  // Simple-mode cron (which only sweeps accepted/ready rows — this order is
  // already "completed" by the time it runs), so the fulfillment-tied ledger
  // hooks must run here too or ShipDay-delivered orders never finalize
  // coupons / redeem / earn Reward Dollars. Same set as the cron; all
  // idempotent + never-throw. Keyed off the TRANSLATED status, not
  // updates.status: if we crashed after the update but before the hooks last
  // time, the ShipDay retry finds order.status already "completed" (TERMINAL
  // guard skips the update) — the hooks must still run on that replay, and
  // idempotency makes re-runs free. (2026-07-10 hardening + review.)
  if (orderStatus === "completed") {
    await redeemCouponsForOrder(order.id);
    await redeemRewardForOrder(order.id);
    await awardRewardForOrder({ orderId: order.id });
    await awardEarnRulesForOrder({ orderId: order.id });
    await awardPromoCreditsForOrder({ orderId: order.id });
  }

  console.log("[shipday webhook] applied", { orderId: order.id, event, shipdayStatus, orderStatus });
  return NextResponse.json({ ok: true });
}
