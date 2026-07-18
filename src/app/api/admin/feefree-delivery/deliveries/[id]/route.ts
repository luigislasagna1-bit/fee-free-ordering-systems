import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { PLATFORM_CURRENCY } from "@/lib/utils";
import { ASSIGNMENT_TERMINAL } from "@/lib/driver-assignment";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/feefree-delivery/deliveries/[id]
 *
 * Full detail for one delivery assignment: stage timeline, driver card,
 * order card, billing line (v1.1 Phase 7, plan §4.3 / §5.4).
 *
 * Auth: getSessionUser() → restaurantId from session (never client).
 * Ownership: `findFirst({ id, restaurantId })` — the join guards against
 * returning data for another restaurant's assignment. 404 when absent (both
 * "not found" and "other restaurant" surface identically — no enumeration).
 * 400 on an obviously malformed id (empty string).
 * 401 when session missing.
 *
 * Works for BOTH terminal and live assignments — the detail overlay opens
 * from active Dispatch rows (non-terminal) as well as Completed rows
 * (terminal). No status filter here.
 *
 * Driver.phone IS selected (Phase 8) — the driver card's tap-to-call
 * button. Luigi's 2026-07-16 decision: restaurants see their drivers'
 * numbers; never exposed on customer-facing surfaces.
 * DriverLocation trail NOT selected — denormalized lastLocationAt is enough
 * for the "last seen N min ago" display (plan §4.3 / §8 do-not-touch list).
 *
 * Phase 8 additions to the payload:
 *   canRate    — terminal status AND a driver exists (the rate block gate).
 *   myFeedback — THIS restaurant's existing rating for this delivery
 *                (source="restaurant"), so the rate block prefills and
 *                re-submitting reads as an edit, not a duplicate.
 *
 * Money split (plan §8):
 *   order money → formatCurrency(amount, order.restaurant.currency)
 *   platform fee → formatCurrency(platformFeeCents/100, PLATFORM_CURRENCY)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  // Role gate: getSessionUser() FALLS BACK to the kitchen session (path=/
  // cookie), and a kitchen login is designed not to grant this surface —
  // the detail payload carries owner-financial data (platformFeeCents,
  // settlement state). Gate on `role` — NOT effectiveRole — so
  // impersonating superadmins/resellers still pass (session.ts).
  if (!restaurantId || user?.role === "kitchen_staff") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!id || id.trim().length === 0) {
    return NextResponse.json({ error: "bad_id" }, { status: 400 });
  }

  // Ownership check via the direct restaurantId column — the assignment
  // carries a denormalized restaurantId so we never need to join through
  // Order to verify ownership (Order.restaurantId would be equivalent but
  // the denormalized column is the cheaper path).
  const row = await prisma.deliveryAssignment.findFirst({
    where: { id, restaurantId },
    select: {
      id: true,
      status: true,
      assignedAt: true,
      acceptedAt: true,
      startedAt: true,
      pickedUpAt: true,
      deliveredAt: true,
      failedAt: true,
      returnedAt: true,
      completedAt: true,
      platformFeeCents: true,
      settlementId: true,
      order: {
        select: {
          orderNumber: true,
          customerName: true,
          deliveryAddress: true,
          deliveryCity: true,
          total: true,
          tip: true,
        },
      },
      // Restaurant relation for order currency (the restaurant's own
      // currency, not PLATFORM_CURRENCY — Fabrizio euro/$ rule).
      restaurant: {
        select: { currency: true },
      },
      // Driver card: name + phone (tap-to-call) + ratingPct +
      // lastLocationAt for "last seen".
      // DriverLocation trail: NOT selected — denormalized field is enough.
      driver: {
        select: { name: true, phone: true, ratingPct: true, lastLocationAt: true },
      },
    },
  });

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // The restaurant's own existing rating (unique on [assignmentId, source])
  // — only worth a lookup when a rate block can render at all.
  const canRate = row.driver !== null && ASSIGNMENT_TERMINAL.has(row.status);
  const myFeedback = canRate
    ? await prisma.driverFeedback.findUnique({
        where: {
          assignmentId_source: { assignmentId: row.id, source: "restaurant" },
        },
        select: { stars: true, comment: true },
      })
    : null;

  return NextResponse.json({
    id: row.id,
    status: row.status,
    // Stage timestamps — all nullable; client skips null nodes on the
    // timeline. cancelled rows carry their stamp in failedAt (Phase 2).
    assignedAt: row.assignedAt?.toISOString() ?? null,
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    startedAt: row.startedAt?.toISOString() ?? null,
    pickedUpAt: row.pickedUpAt?.toISOString() ?? null,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    failedAt: row.failedAt?.toISOString() ?? null,
    returnedAt: row.returnedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    driver: row.driver
      ? {
          name: row.driver.name,
          phone: row.driver.phone,
          ratingPct: row.driver.ratingPct,
          // Denormalized last-ping time — the "last seen N min ago" label.
          // No DriverLocation trail reads (plan §4.3 / do-not-touch list).
          lastLocationAt: row.driver.lastLocationAt?.toISOString() ?? null,
        }
      : null,
    order: {
      orderNumber: row.order.orderNumber,
      customerName: row.order.customerName,
      deliveryStreet: row.order.deliveryAddress ?? null,
      deliveryCity: row.order.deliveryCity ?? null,
      total: row.order.total,
      tip: row.order.tip,
      /** Restaurant's own currency — render with formatCurrency(amount, currency). */
      currency: row.restaurant.currency,
    },
    /** Platform fee in cents — render formatCurrency(billingCents/100, billingCurrency). */
    billingCents: row.platformFeeCents ?? null,
    /** Always PLATFORM_CURRENCY — settlement money is never restaurant money (plan §8). */
    billingCurrency: PLATFORM_CURRENCY,
    /** True once this assignment is rolled into a weekly settlement invoice. */
    settled: row.settlementId !== null,
    /** Terminal + driver present — gates the Rate-this-driver block (Phase 8). */
    canRate,
    /** This restaurant's existing rating for THIS delivery, for prefill. */
    myFeedback: myFeedback
      ? { stars: myFeedback.stars, comment: myFeedback.comment }
      : null,
  });
}
