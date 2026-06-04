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

  return NextResponse.json(reservations);
}
