/**
 * GET /api/kitchen/orders/[id]/eta
 *
 * Kitchen-facing drive distance + live-traffic ETA for a DELIVERY order, plus a
 * "directions" deep link. Reseller report cmq3kv70d (Gloriafood parity). Called
 * once when the kitchen opens a delivery order's detail (not on every poll —
 * Distance Matrix is metered).
 *
 * Always returns a mapsUrl (so the "Open in Maps" button works even without a
 * Distance Matrix key). distance/duration are present only when a key is
 * configured + the API call succeeds. Non-delivery orders → 400.
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { fetchDriveEstimate, mapsDirectionsUrl, resolveDistanceMatrixKey } from "@/lib/delivery-eta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Delay/kitchen actions live on the kitchen display — prefer that session.
  const user = await getSessionUser({ preferKitchen: true });
  if (!user?.restaurantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const order = await prisma.order.findFirst({
    where: {
      id,
      ...(user.role === "superadmin" ? {} : { restaurantId: user.restaurantId }),
    },
    select: {
      type: true,
      deliveryAddress: true,
      deliveryCity: true,
      deliveryZip: true,
      restaurant: {
        select: {
          lat: true, lng: true,
          address: true, city: true, state: true, zip: true,
          googleMapsApiKey: true,
        },
      },
    },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.type !== "delivery") {
    return NextResponse.json({ error: "Not a delivery order" }, { status: 400 });
  }

  const destination = [order.deliveryAddress, order.deliveryCity, order.deliveryZip]
    .filter(Boolean)
    .join(", ");
  if (!destination) {
    return NextResponse.json({ error: "No delivery address on this order" }, { status: 400 });
  }

  const mapsUrl = mapsDirectionsUrl(destination);

  const key = resolveDistanceMatrixKey(order.restaurant.googleMapsApiKey);
  if (!key) {
    // No Distance Matrix key wired up yet — the maps button still works.
    return NextResponse.json({ mapsUrl, estimate: { ok: false } });
  }

  const r = order.restaurant;
  const origin =
    r.lat != null && r.lng != null
      ? { lat: r.lat, lng: r.lng }
      : { address: [r.address, r.city, r.state, r.zip].filter(Boolean).join(", ") };

  const estimate = await fetchDriveEstimate({ apiKey: key, origin, destination });
  return NextResponse.json({ mapsUrl, estimate });
}
