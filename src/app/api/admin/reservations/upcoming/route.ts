import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";

// Returns today + tomorrow's confirmed/seated/pending reservations, sorted by time.
// Used by the kitchen-display "Reservations" tab.
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

  const reservations = await prisma.reservation.findMany({
    where: {
      restaurantId,
      date: { in: [toISO(today), toISO(tomorrow)] },
      status: { in: ["pending", "confirmed", "seated"] },
    },
    orderBy: [{ date: "asc" }, { time: "asc" }],
    include: { table: true },
  });

  return NextResponse.json(reservations);
}
