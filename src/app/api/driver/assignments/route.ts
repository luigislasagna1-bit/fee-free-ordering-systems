import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getDriverSession, checkDriverSessionFresh } from "@/lib/driver-session";
import { ASSIGNMENT_TERMINAL } from "@/lib/driver-assignment";

export const dynamic = "force-dynamic";

/**
 * GET /api/driver/assignments — the signed-in driver's work list:
 *  - OPEN queue: unclaimed `queued` assignments they can accept.
 *  - MINE: assignments they've claimed that aren't terminal yet.
 * Returns the order + restaurant details the driver needs to navigate and
 * contact the customer. Polled by the /driver queue screen.
 */
export async function GET() {
  const driver = await getDriverSession();
  if (!driver) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Single-active-session: a superseded device gets 401 so it redirects to login.
  if ((await checkDriverSessionFresh()) === "stale") {
    return NextResponse.json({ error: "session_superseded", code: "session_superseded" }, { status: 401 });
  }

  const rows = await prisma.deliveryAssignment.findMany({
    where: {
      OR: [
        { status: "queued", driverId: null },
        { driverId: driver.driverId, status: { notIn: [...ASSIGNMENT_TERMINAL] } },
      ],
    },
    orderBy: [{ createdAt: "asc" }],
    take: 100,
    select: {
      id: true,
      status: true,
      driverId: true,
      acceptedAt: true,
      pickedUpAt: true,
      order: {
        select: {
          id: true,
          orderNumber: true,
          status: true,
          customerName: true,
          customerPhone: true,
          deliveryAddress: true,
          deliveryCity: true,
          deliveryZip: true,
          deliveryLat: true,
          deliveryLng: true,
          notes: true,
          total: true,
          tip: true,
          scheduledFor: true,
          paymentStatus: true,
          restaurant: {
            select: { name: true, address: true, city: true, state: true, zip: true, phone: true, lat: true, lng: true, currency: true },
          },
        },
      },
    },
  });

  const assignments = rows.map((a) => ({
    id: a.id,
    status: a.status,
    mine: a.driverId === driver.driverId,
    acceptedAt: a.acceptedAt,
    pickedUpAt: a.pickedUpAt,
    order: {
      id: a.order.id,
      orderNumber: a.order.orderNumber,
      customerName: a.order.customerName,
      customerPhone: a.order.customerPhone,
      customerAddress: [a.order.deliveryAddress, a.order.deliveryCity, a.order.deliveryZip].filter(Boolean).join(", "),
      deliveryLat: a.order.deliveryLat,
      deliveryLng: a.order.deliveryLng,
      notes: a.order.notes,
      total: a.order.total,
      tip: a.order.tip,
      scheduledFor: a.order.scheduledFor,
      restaurantName: a.order.restaurant.name,
      restaurantAddress: [a.order.restaurant.address, a.order.restaurant.city, a.order.restaurant.state, a.order.restaurant.zip].filter(Boolean).join(", "),
      restaurantPhone: a.order.restaurant.phone,
      restaurantLat: a.order.restaurant.lat,
      restaurantLng: a.order.restaurant.lng,
      currency: a.order.restaurant.currency,
    },
  }));

  return NextResponse.json({ driver: { id: driver.driverId, name: driver.name }, assignments });
}
