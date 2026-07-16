import { NextRequest, NextResponse, after } from "next/server";
import prisma from "@/lib/db";
import { getDriverSession, checkDriverSessionFresh } from "@/lib/driver-session";
import { checkDriverTransition, STAGE_TIMESTAMP } from "@/lib/driver-assignment";
import { applyDeliveryStatus, translateDriverEvent } from "@/lib/delivery-status";
import { feeCentsForDelivery } from "@/lib/feefree-delivery";
import { recomputeDriverRating } from "@/lib/driver-rating";
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
          estimatedReady: true, scheduledFor: true, paymentMethod: true, paymentStatus: true,
          deliveryLat: true, deliveryLng: true,
          restaurant: { select: { id: true, defaultLanguage: true, subdomain: true, customDomain: true, customDomainStatus: true, slug: true, lat: true, lng: true } },
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

  // "Can't complete this delivery" — a driver bailing must NEVER orphan the
  // order (the old behaviour marked only the assignment failed, leaving the
  // customer's live card stuck on "<driver> is heading to the restaurant" and
  // no driver actually coming). Instead RE-OFFER it to the pool: strip the
  // driver + every stage stamp so it becomes a fresh `queued` job any driver can
  // claim, and null unclaimedAlertedAt so the 3-min "no driver accepted" safety
  // net re-arms (alerts the dispatcher). The customer's tracking card falls back
  // to "finding you a driver" on its next poll. If the ORDER itself is no longer
  // live (cancelled/completed elsewhere), don't re-queue a dead order — just
  // close the assignment out. Luigi 2026-07-15.
  if (next === "failed") {
    // The driver who is bailing (before we strip it off the assignment) — their
    // cancellation counts against their reliability score.
    const bailedDriverId = assignment.driverId;
    const orderLive = ["accepted", "preparing", "ready"].includes(assignment.order.status);
    await prisma.deliveryAssignment.update({
      where: { id },
      data: orderLive
        ? {
            status: "queued",
            driverId: null,
            assignedAt: null,
            acceptedAt: null,
            startedAt: null,
            pickedUpAt: null,
            deliveredAt: null,
            returnedAt: null,
            failedAt: null,
            unclaimedAlertedAt: null,
          }
        : { status: "cancelled", failedAt: new Date() },
    });
    // A "can't complete" dings the driver's rating (reliability). Off the hot
    // path so the driver's tap responds instantly.
    if (bailedDriverId) {
      after(
        (async () => {
          try {
            await prisma.driver.update({ where: { id: bailedDriverId }, data: { cancelledCount: { increment: 1 } } });
            await recomputeDriverRating(prisma, bailedDriverId);
          } catch (e) {
            console.error("[driver status] cancel rating update failed", e);
          }
        })(),
      );
    }
    return NextResponse.json({ ok: true, status: orderLive ? "reoffered" : "cancelled" });
  }

  // Build the assignment update. Claim on first action (unowned → mine).
  const data: Record<string, unknown> = { status: next };
  if (!assignment.driverId) data.driverId = driver.driverId;
  const stamp = STAGE_TIMESTAMP[next];
  if (stamp) data[stamp] = new Date();
  // Freeze the DISTANCE-TIERED platform fee at delivery (7.99/8.99/9.99 by the
  // restaurant→customer distance) — source of truth for the weekly settlement.
  // Only set once (never re-bill a re-fired delivered).
  if (next === "delivered" && assignment.platformFeeCents == null) {
    const o = assignment.order;
    data.platformFeeCents = feeCentsForDelivery(o.restaurant.lat, o.restaurant.lng, o.deliveryLat, o.deliveryLng);
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

  // On delivery, credit the driver's completion (and flag it late if it landed
  // after the promised time + a 10-min grace) and recompute their rating. Off
  // the hot path (after()) so the tap responds instantly. Idempotent-ish: a
  // re-fired "delivered" would double-count, but the forward-only assignment
  // guard already blocks re-delivering a terminal assignment.
  if (next === "delivered") {
    const o = assignment.order;
    const promisedTs = o.scheduledFor
      ? new Date(o.scheduledFor).getTime()
      : o.estimatedReady
        ? new Date(o.estimatedReady).getTime()
        : null;
    const late = promisedTs != null && Date.now() > promisedTs + 10 * 60 * 1000;
    after(
      (async () => {
        try {
          await prisma.driver.update({
            where: { id: driver.driverId },
            data: { deliveredCount: { increment: 1 }, ...(late ? { lateCount: { increment: 1 } } : {}) },
          });
          await recomputeDriverRating(prisma, driver.driverId);
        } catch (e) {
          console.error("[driver status] delivered rating update failed", e);
        }
      })(),
    );
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
