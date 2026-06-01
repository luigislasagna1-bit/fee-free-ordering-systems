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
 *   - Appends a "Delayed by Xm at HH:MM" line to Order.notes
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

  // Append a structured delay line to notes so it's auditable in the
  // admin orders detail page later. HH:MM in restaurant tz would be
  // ideal but adds dependency; plain ISO is fine for an audit trail.
  const stamp = new Date().toISOString();
  const delayLine = reason
    ? `[Delayed +${minutes}m at ${stamp}] ${reason}`
    : `[Delayed +${minutes}m at ${stamp}]`;
  const newNotes = order.notes ? `${order.notes}\n${delayLine}` : delayLine;

  await prisma.order.update({
    where: { id: order.id },
    data: {
      estimatedReady: newReady,
      notes: newNotes,
    },
  });

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
      orderType: order.type,
      customerLocale: order.restaurant.defaultLanguage || "en",
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
