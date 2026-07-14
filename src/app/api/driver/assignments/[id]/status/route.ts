import { NextRequest, NextResponse, after } from "next/server";
import prisma from "@/lib/db";
import { getDriverSession, checkDriverSessionFresh } from "@/lib/driver-session";
import { checkDriverTransition, STAGE_TIMESTAMP } from "@/lib/driver-assignment";
import { applyDeliveryStatus, translateDriverEvent } from "@/lib/delivery-status";
import { FEEFREE_DELIVERY_PER_ORDER_CENTS } from "@/lib/feefree-delivery";
import { notifyCustomer } from "@/lib/notifications";
import { restaurantOrderUrl } from "@/lib/restaurant-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/driver/assignments/[id]/status
 * Body: { status: "accepted" | "started" | "picked_up" | "out_for_delivery" | "delivered" | "failed" }
 *
 * The single funnel the /driver status buttons call. It:
 *  1. validates the driver may make this ASSIGNMENT transition (forward-only,
 *     ownership, claim-on-accept),
 *  2. stamps the stage timestamp (+ freezes platformFeeCents=799 on delivered),
 *  3. runs the SHARED applyDeliveryStatus (forward-only Order.status guard + the
 *     5 idempotent completion ledger hooks — identical to the ShipDay path), and
 *  4. fires the customer "on the way" / "delivered" notification.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const driver = await getDriverSession();
  if (!driver) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((await checkDriverSessionFresh()) === "stale") {
    return NextResponse.json({ error: "session_superseded", code: "session_superseded" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const next = typeof body?.status === "string" ? body.status : null;
  if (!next) return NextResponse.json({ error: "Missing status" }, { status: 400 });

  const assignment = await prisma.deliveryAssignment.findUnique({
    where: { id },
    select: {
      id: true, status: true, driverId: true, platformFeeCents: true,
      order: {
        select: {
          id: true, status: true, type: true, orderNumber: true,
          customerName: true, customerEmail: true, customerPhone: true,
          estimatedReady: true, paymentMethod: true, paymentStatus: true,
          restaurant: { select: { id: true, defaultLanguage: true, subdomain: true, customDomain: true, customDomainStatus: true, slug: true } },
        },
      },
    },
  });
  if (!assignment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const check = checkDriverTransition({
    current: assignment.status,
    next,
    assignmentDriverId: assignment.driverId,
    driverId: driver.driverId,
  });
  if (!check.ok) {
    const status = check.code === "not_owner" || check.code === "claim_conflict" ? 409 : 400;
    return NextResponse.json({ error: "Invalid transition", code: check.code }, { status });
  }

  // Build the assignment update. Claim on first action (unowned → mine).
  const data: Record<string, unknown> = { status: next };
  if (!assignment.driverId) data.driverId = driver.driverId;
  const stamp = STAGE_TIMESTAMP[next];
  if (stamp) data[stamp] = new Date();
  // Freeze the $7.99 platform fee at delivery — source of truth for the weekly
  // settlement. Only set once (never re-bill a re-fired delivered).
  if (next === "delivered" && assignment.platformFeeCents == null) {
    data.platformFeeCents = FEEFREE_DELIVERY_PER_ORDER_CENTS;
  }

  // Claim race guard: when accepting a still-unowned assignment, do it
  // atomically (where driverId=null) so two drivers can't both claim it.
  if (!assignment.driverId) {
    const claimed = await prisma.deliveryAssignment.updateMany({
      where: { id, driverId: null },
      data,
    });
    if (claimed.count === 0) {
      return NextResponse.json({ error: "Already claimed", code: "claim_conflict" }, { status: 409 });
    }
  } else {
    await prisma.deliveryAssignment.update({ where: { id }, data });
  }

  // Advance the ORDER through the shared money-path core (forward-only + ledger
  // hooks), keyed off the TRANSLATED status so a crash-then-retry finalizes once.
  const { orderStatus } = translateDriverEvent(next);
  if (orderStatus) {
    await applyDeliveryStatus({ id: assignment.order.id, status: assignment.order.status }, { orderStatus });

    // Customer "on the way" (ready) / "delivered" (completed) notification —
    // same event the admin PATCH route fires, so existing templates + per-status
    // toggles apply. after() so the driver's tap responds instantly.
    const o = assignment.order;
    after(
      (async () => {
        try {
          await notifyCustomer({
            restaurantId: o.restaurant.id,
            customerEmail: o.customerEmail,
            customerPhone: o.customerPhone,
            orderType: o.type,
            customerLocale: o.restaurant.defaultLanguage || "en",
            payload: {
              event: "orderStatusUpdate",
              customerName: o.customerName,
              orderNumber: o.orderNumber,
              status: orderStatus,
              estimatedReady: o.estimatedReady ? new Date(o.estimatedReady) : undefined,
              trackingUrl: restaurantOrderUrl(o.restaurant as any, `/status/${o.id}`),
              paymentMethod: o.paymentMethod || undefined,
              paidOnline:
                o.paymentMethod === "card" || o.paymentMethod === "paypal"
                  ? ["authorized", "paid", "refunded"].includes(o.paymentStatus ?? "")
                  : false,
            },
          });
        } catch (e) {
          console.error("[driver status] notifyCustomer failed", e);
        }
      })(),
    );
  }

  return NextResponse.json({ ok: true, status: next });
}
