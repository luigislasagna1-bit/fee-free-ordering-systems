import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { haversineKm } from "@/lib/geocode";

export const dynamic = "force-dynamic";

/**
 * GET /api/public/orders/[id]/delivery-tracking
 *
 * Public (the customer holds the order link — same trust model as
 * /api/orders/[id]). Returns live FeeFreeDelivery driver tracking for the order.
 *
 * PRIVACY: the driver's live location is exposed ONLY while they're actually
 * en route to the customer (picked_up / out_for_delivery). Before pickup and
 * after delivery we return the phase but no coordinates — a customer never
 * gets a driver's position while the driver is at another stop or off-shift.
 */
const EN_ROUTE = new Set(["picked_up", "out_for_delivery"]);

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      type: true,
      deliveryLat: true,
      deliveryLng: true,
      deliveryAssignment: {
        select: {
          status: true,
          driver: { select: { name: true, ratingPct: true, lastLat: true, lastLng: true, lastLocationAt: true } },
        },
      },
    },
  });

  // Not a FeeFree delivery (or no in-house assignment) → nothing to track.
  if (!order || order.type !== "delivery" || !order.deliveryAssignment) {
    return NextResponse.json({ active: false });
  }

  const a = order.deliveryAssignment;
  // A closed-out assignment (a driver bailed and the order went dead, or it was
  // cancelled/returned) has nothing to track — hide the card entirely rather
  // than leave it showing a stale "heading to the restaurant".
  if (["cancelled", "failed", "returned"].includes(a.status)) {
    return NextResponse.json({ active: false });
  }
  const enRoute = EN_ROUTE.has(a.status);
  const delivered = a.status === "delivered";
  // No driver has this yet (fresh order, or one just re-offered after a driver
  // couldn't complete it) → the customer sees "finding you a driver", never a
  // named driver who isn't actually coming. `assigned`/`offered` cover directed
  // dispatch where a specific driver has been offered but not yet accepted.
  const findingDriver = !delivered && !enRoute && (!a.driver || ["queued", "assigned", "offered"].includes(a.status));
  const hasDriverLoc = enRoute && a.driver?.lastLat != null && a.driver?.lastLng != null;

  let etaMinutes: number | null = null;
  if (hasDriverLoc && order.deliveryLat != null && order.deliveryLng != null) {
    const km = haversineKm(a.driver!.lastLat!, a.driver!.lastLng!, order.deliveryLat, order.deliveryLng);
    // Rough city-driving estimate (~25 km/h incl. stops), floored at 1 min.
    etaMinutes = Math.max(1, Math.round((km / 25) * 60));
  }

  return NextResponse.json({
    active: true,
    status: a.status,
    delivered,
    enRoute,
    findingDriver,
    // A driver who's been re-offered a job isn't "coming" — only surface the
    // name once someone actually owns the delivery (never while findingDriver).
    driverName: findingDriver ? null : a.driver?.name ?? null,
    driverRating: findingDriver ? null : a.driver?.ratingPct ?? null,
    // Coordinates only while en route (privacy).
    driver: hasDriverLoc
      ? { lat: a.driver!.lastLat, lng: a.driver!.lastLng, at: a.driver!.lastLocationAt }
      : null,
    destination:
      order.deliveryLat != null && order.deliveryLng != null
        ? { lat: order.deliveryLat, lng: order.deliveryLng }
        : null,
    etaMinutes,
  });
}
