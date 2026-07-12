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
 * Security: ShipDay supports a shared secret token in the request (query
 * `?token=` or `x-shipday-token` header, max 32 chars). Two accepted forms:
 *
 *   1. PER-RESTAURANT token (`ShipdayConfig.webhookToken`, unique) — the one
 *      the onboarding wizard hands each owner to paste into ShipDay →
 *      Integrations. It both authenticates AND identifies the caller: the
 *      matched order must belong to that restaurant, so one restaurant's
 *      token can never move another restaurant's orders. First valid hit
 *      stamps `webhookVerifiedAt` (drives the wizard's "Verified ✓" step).
 *   2. The legacy platform-wide SHIPDAY_WEBHOOK_TOKEN env — kept so any
 *      dashboard already configured with it keeps working.
 *
 * In PRODUCTION a valid token is REQUIRED — an unauthenticated caller who
 * knows/guesses an order id could otherwise flip live orders to
 * ready/completed (hardening 2026-07-10; previously this failed OPEN with
 * just a log line). In dev the warn-and-accept behaviour survives for local
 * testing without ShipDay — but a PROVIDED token that matches nothing is
 * rejected even in dev, so token bugs surface during testing.
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
  // Verify the token. ShipDay sends it via the `token` query param (per
  // their docs) or a custom header — we accept both. Per-restaurant tokens
  // (wizard) are tried after the legacy env token.
  const envToken = process.env.SHIPDAY_WEBHOOK_TOKEN;
  const tokenFromQuery = req.nextUrl.searchParams.get("token");
  // ShipDay's documented delivery is a header literally named "token"
  // (docs.shipday.com/reference/order-status-update-2); x-shipday-token was
  // our guess and is kept as an alias. The query param comes from the URL the
  // wizard hands out, so any ONE of the three authenticates.
  const tokenFromHeader = req.headers.get("token") ?? req.headers.get("x-shipday-token");
  const provided = tokenFromQuery ?? tokenFromHeader ?? "";
  // When authenticated by a per-restaurant token, every matched order must
  // belong to THIS restaurant — the token identifies the caller.
  let tokenRestaurantId: string | null = null;

  if (provided) {
    if (envToken && timingSafeEqualString(provided, envToken)) {
      // Legacy platform-wide token — trusted for any restaurant.
    } else {
      const cfg = await prisma.shipdayConfig.findUnique({
        where: { webhookToken: provided },
        select: { id: true, restaurantId: true, webhookVerifiedAt: true },
      });
      if (!cfg) {
        console.warn("[shipday webhook] rejected — token matched neither env nor any restaurant");
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      tokenRestaurantId = cfg.restaurantId;
      // First correctly-tokened call proves the owner's dashboard paste
      // worked — light the wizard's "Verified ✓" BEFORE any order checks
      // (ShipDay test pings carry no order we'd recognize).
      if (!cfg.webhookVerifiedAt) {
        await prisma.shipdayConfig.update({
          where: { id: cfg.id },
          data: { webhookVerifiedAt: new Date() },
        }).catch((e) => console.error("[shipday webhook] verify-stamp failed", e));
      }
    }
  } else if (process.env.NODE_ENV === "production") {
    // Fail CLOSED in prod: tokenless callers are never trusted.
    console.error("[shipday webhook] no token provided — rejecting (fail closed in production)");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  } else {
    console.warn("[shipday webhook] no token provided — accepting any caller (dev only).");
  }

  let body: {
    event?: string;
    order?: {
      // DOCUMENTED shape: the order object carries `id` + `order_number`
      // (snake_case). `orderId`/`additionalId` were our original guesses —
      // kept as fallbacks. Found live 2026-07-12: Luigi's delivered order
      // never completed because we only read the guessed keys and 400'd
      // "Missing order identifier" on every real event.
      id?: number | string;
      orderId?: number | string;
      order_number?: string;
      orderNumber?: string;
      additionalId?: string;
    };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = body.event ?? "";
  const additionalId = body.order?.additionalId ?? null;
  const rawShipdayId = body.order?.id ?? body.order?.orderId;
  const shipdayOrderId = rawShipdayId != null ? String(rawShipdayId) : null;
  const orderNumber = body.order?.order_number ?? body.order?.orderNumber ?? null;

  if (!event) {
    return NextResponse.json({ error: "Missing event field" }, { status: 400 });
  }
  if (!additionalId && !shipdayOrderId && !orderNumber) {
    return NextResponse.json({ error: "Missing order identifier" }, { status: 400 });
  }

  // Locate the Order row. Preference order:
  //  1. additionalId — our own Order.id (primary-key lookup), when present.
  //  2. shipdayOrderId — stamped at dispatch, indexed.
  //  3. order_number — ShipDay echoes OUR orderNumber back; only trusted
  //     scoped to the token's restaurant (or any restaurant for the legacy
  //     platform-wide token, where the id checks below still gate writes).
  const order =
    (additionalId ? await prisma.order.findUnique({ where: { id: additionalId } }) : null) ??
    (shipdayOrderId ? await prisma.order.findFirst({ where: { shipdayOrderId } }) : null) ??
    (orderNumber
      ? await prisma.order.findFirst({
          where: { orderNumber, ...(tokenRestaurantId ? { restaurantId: tokenRestaurantId } : {}) },
        })
      : null);

  if (!order) {
    console.warn("[shipday webhook] no matching order", { additionalId, shipdayOrderId, event });
    // Return 200 so ShipDay doesn't retry forever on permanently-missing
    // orders. We've logged it for investigation.
    return NextResponse.json({ ok: true, skipped: "no_matching_order" });
  }

  // Per-restaurant tokens are TENANT-SCOPED: a caller holding restaurant A's
  // token must never move restaurant B's orders, no matter what ids the
  // payload claims. 200-skip (not 401) so a ShipDay data mix-up doesn't
  // retry forever; the log line is the investigation trail.
  if (tokenRestaurantId && order.restaurantId !== tokenRestaurantId) {
    console.warn("[shipday webhook] token restaurant mismatch — ignoring", {
      orderId: order.id, tokenRestaurantId, orderRestaurantId: order.restaurantId, event,
    });
    return NextResponse.json({ ok: true, skipped: "restaurant_mismatch" });
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
