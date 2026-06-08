import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";

// Returns the kitchen-display "Reservations" tab data:
//   • today + tomorrow's pending/confirmed/seated (the active floor view), AND
//   • ALL future PENDING reservations regardless of date — a manual-accept
//     booking made for next week still needs staff to accept/decline NOW, so
//     it must surface immediately, not only on its day. (Report cmpxbvfn1:
//     "reservation for 3 days from now did not pop up as pending".)
//
// preferKitchen:true is REQUIRED because the kitchen display polls this
// endpoint every few seconds, and kitchen-only browsers carry a kitchen
// session (not a full admin session). Without preferKitchen, every poll
// returned 401 and spammed Vercel logs. Same fix pattern as PATCH
// /api/orders/[id] (commit ea984f0).
export async function GET() {
  const user = await getSessionUser({ preferKitchen: true });
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const toISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  // `date` is a YYYY-MM-DD string, so lexicographic >= compares correctly.
  const reservations = await prisma.reservation.findMany({
    where: {
      restaurantId,
      OR: [
        // Active floor view — today + tomorrow.
        {
          date: { in: [toISO(today), toISO(tomorrow)] },
          status: { in: ["pending", "confirmed", "seated"] },
        },
        // Future bookings still awaiting staff acceptance (any date from today
        // onward) — capped so we never pull stale past pendings.
        {
          status: "pending",
          date: { gte: toISO(today) },
        },
      ],
    },
    orderBy: [{ date: "asc" }, { time: "asc" }],
    include: { table: true },
  });

  // Reserve-then-order: a booking attached to an order (orderId set) must stay
  // hidden from the kitchen until that order is actually released — i.e. paid,
  // for online-card/PayPal. We mirror the order feed, which only shows orders
  // with notifiedAt set. Bookings with no orderId (normal walk-up reservations)
  // are always visible. Luigi 2026-06-08.
  const linkedOrderIds = reservations
    .map((r) => r.orderId)
    .filter((x): x is string => !!x);
  let releasedOrderIds = new Set<string>();
  if (linkedOrderIds.length > 0) {
    const released = await prisma.order.findMany({
      where: { id: { in: linkedOrderIds }, notifiedAt: { not: null } },
      select: { id: true },
    });
    releasedOrderIds = new Set(released.map((o) => o.id));
  }
  const visible = reservations.filter((r) => !r.orderId || releasedOrderIds.has(r.orderId));

  return NextResponse.json(visible);
}
