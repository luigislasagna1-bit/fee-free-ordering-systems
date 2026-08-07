/**
 * POST /api/orders/[id]/delay
 *
 * Kitchen-facing endpoint to push back an accepted order's
 * estimatedReady when the kitchen is running behind. Bumps the ready
 * time by N minutes, appends a delay note to the order, and fires an
 * email to the customer telling them about the new ETA.
 *
 * Why a dedicated route instead of reusing PATCH:
 *   - PATCH on /[id] is the status-transition endpoint (accept/reject/
 *     ready/complete) and threads through a complex re-payment/refund
 *     pipeline. Layering "delay" on top would be a footgun (e.g.
 *     accidentally re-firing the Stripe capture path).
 *   - A dedicated endpoint keeps the security model crisp: caller must
 *     be a kitchen-staff or admin user for the same restaurant; order
 *     must be in `accepted` state (delaying a pending or completed
 *     order makes no sense).
 *
 * Body: { minutes: number, reason?: string }
 *   minutes — bumps estimatedReady by this many minutes. Range 1-240.
 *   reason  — optional free-text note shown to the customer in the email
 *             (e.g. "kitchen running busy"). Sanitised + length-capped.
 *
 * Side effects:
 *   - Updates Order.estimatedReady += minutes
 *   - Records the delay in the OrderDelay audit table (NOT in
 *     Order.notes — that field belongs to the customer)
 *   - Fires an "orderDelayed" customer notification (email + optional
 *     SMS if the restaurant has the SMS add-on)
 *   - Logs to console for support visibility
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { notifyCustomer } from "@/lib/notifications";

const MAX_MINUTES = 240; // 4 hours — absolute ceiling per delay action
const MAX_REASON_LEN = 200;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // preferKitchen: same rationale as PATCH on /[id] — the delay button
  // lives on the kitchen display. Without this, kitchen-only sessions
  // would 401 because the session resolver returned the admin slot
  // first (and admin slot is null for kitchen staff).
  const user = await getSessionUser({ preferKitchen: true });
  if (!user?.restaurantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const minutes = parseInt(String((body as any)?.minutes ?? ""), 10);
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > MAX_MINUTES) {
    return NextResponse.json(
      { error: `Delay must be between 1 and ${MAX_MINUTES} minutes` },
      { status: 400 },
    );
  }
  const rawReason = (body as any)?.reason;
  const reason: string | null =
    typeof rawReason === "string" && rawReason.trim()
      ? rawReason.trim().slice(0, MAX_REASON_LEN)
      : null;

  // Fetch with restaurant ownership check baked into the where clause.
  // Superadmins can delay anywhere; otherwise the order must belong to
  // the caller's restaurant.
  const order = await prisma.order.findFirst({
    where: {
      id,
      ...(user.role === "superadmin"
        ? {}
        : { restaurantId: user.restaurantId }),
    },
    include: {
      restaurant: {
        select: {
          id: true,
          name: true,
          slug: true,
          defaultLanguage: true,
          phone: true,
          email: true,
          // Needed so the delay EMAIL renders the new ETA in the restaurant's
          // clock rather than the server's UTC. Fabrizio cms0gyexp #16.
          timezone: true,
          hoursFormat: true,
        },
      },
    },
  });
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // Only accepted orders can be delayed. A pending order should be
  // accepted-with-prep first; a completed/rejected/cancelled order
  // can't be ungrounded.
  if (order.status !== "accepted") {
    return NextResponse.json(
      { error: "Only accepted orders can be delayed" },
      { status: 400 },
    );
  }

  // New ready time. If estimatedReady is missing (rare — kitchen
  // accepted without a prep time), anchor off NOW so the customer
  // gets a meaningful new ETA.
  const previousReady = order.estimatedReady ?? new Date();
  const newReady = new Date(previousReady.getTime() + minutes * 60_000);

  // CRITICAL: push scheduledFor back by the same amount too (when set).
  // BOTH the kitchen "ready in" countdown AND the Simple-mode auto-complete
  // cron PREFER scheduledFor over estimatedReady. Accepted orders carry a
  // scheduledFor (the promised slot — set even for ASAP accepts), so bumping
  // only estimatedReady left the timer frozen at the OLD time and let the cron
  // flip the order to "Completed" ~60s past the original scheduledFor — exactly
  // the bug the reporter saw (order auto-completed at the original ready time
  // despite a +25m delay). Luigi 2026-06-11 (reseller report cmq3sse8i).
  const newScheduledFor = order.scheduledFor
    ? new Date(order.scheduledFor.getTime() + minutes * 60_000)
    : null;

  // Record the delay in its own AUDIT TABLE — never in Order.notes.
  //
  // This used to append `[Delayed +15m at 2026-08-07T20:37:23.405Z]` to
  // `Order.notes`: untranslated English with a raw UTC timestamp, written into
  // the field that holds the CUSTOMER's own requests, and printed in the
  // kitchen's "Notes" box and on the ticket. Staff couldn't read it (Fabrizio
  // cms0gyexp #16) and a guest's actual note got buried under machine text.
  //
  // OrderDelay keeps the full history (every push, not just the last) and lets
  // the kitchen render it properly localized, in the restaurant's own clock.
  await prisma.$transaction([
    prisma.order.update({
      where: { id: order.id },
      data: {
        estimatedReady: newReady,
        ...(newScheduledFor ? { scheduledFor: newScheduledFor } : {}),
      },
    }),
    prisma.orderDelay.create({
      data: {
        orderId: order.id,
        minutes,
        reason,
        previousReady,
        newReady,
        byUserId: user.id ?? null,
      },
    }),
  ]);

  console.log("[orders/delay]", {
    orderId: order.id,
    orderNumber: order.orderNumber,
    minutes,
    reason,
    previousReady: previousReady.toISOString(),
    newReady: newReady.toISOString(),
  });

  // Fire-and-forget customer notification. We DON'T fail the API call
  // if the email transport hiccups — the DB state is the source of
  // truth and the kitchen's already done its part.
  if (order.customerEmail) {
    notifyCustomer({
      restaurantId: order.restaurant.id,
      customerEmail: order.customerEmail,
      customerPhone: order.customerPhone,
      customerId: (order as any).customerId ?? null,
      orderType: order.type,
      customerLocale: (order as any).customerLocale || order.restaurant.defaultLanguage || "en",
      payload: {
        event: "orderDelayed",
        customerName: order.customerName,
        orderNumber: order.orderNumber,
        newEstimatedReady: newReady,
        delayMinutes: minutes,
        reason,
      },
    }).catch((e) => console.error("[orders/delay notifyCustomer]", e));
  }

  return NextResponse.json({
    success: true,
    estimatedReady: newReady.toISOString(),
    delayMinutes: minutes,
  });
}
