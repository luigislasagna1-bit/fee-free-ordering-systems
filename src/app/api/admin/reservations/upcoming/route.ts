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

  const toISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  // Persistent ledger window for the kitchen Reservations tab. A booking must
  // NEVER disappear from that tab just because its day passed or its status
  // changed (completed / seated / no-show / cancelled / rejected) — the ONLY
  // thing that hides it there is staff pressing "clear history"
  // (clearedFromReservationsAt, applied client-side). So we return every
  // booking from the last RETENTION_DAYS days onward; because `date` is a
  // YYYY-MM-DD string, a single lexicographic `>=` also sweeps in ALL future
  // dates (next week, next month). Mirrors how the orders feed keeps ~30 days.
  // Luigi 2026-06-08.
  const RETENTION_DAYS = 30;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

  const reservations = await prisma.reservation.findMany({
    where: {
      restaurantId,
      date: { gte: toISO(cutoff) },
    },
    // DESC + cap is the safe truncation: if a restaurant ever exceeds the cap,
    // we keep ALL upcoming bookings + the most recent past and only drop the
    // oldest history — never a future booking. The client re-sorts the
    // Reservations tab soonest-first for display. take is the scale guard,
    // same shape as the orders feed.
    orderBy: [{ date: "desc" }, { time: "desc" }],
    take: 500,
    include: { table: true },
  });

  // Reserve-then-order: a booking attached to an order (orderId set) is part of
  // ONE unit with that order. The kitchen accepts the ORDER once — that confirms
  // the table — so a pre-order booking must NOT show here as its own
  // needs-acceptance row:
  //   • while it's still "pending" (the order hasn't been accepted) it is
  //     represented by the order tile in the order feed, not here;
  //   • once "confirmed"/"seated" (order accepted) it appears here for seating /
  //     no-show, but only after the order is actually released (paid), mirroring
  //     the order feed (notifiedAt set).
  // Bookings with no orderId (normal walk-up reservations) are always visible.
  // Luigi 2026-06-08.
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
  const visible = reservations.filter((r) => {
    if (!r.orderId) return true; // normal walk-up booking
    if (r.status === "pending") return false; // shown as the order, not here
    return releasedOrderIds.has(r.orderId); // confirmed/seated: show once paid
  });

  return NextResponse.json(visible);
}
