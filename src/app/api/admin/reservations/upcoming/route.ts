import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";

// Returns today + tomorrow's confirmed/seated/pending reservations, sorted by time.
// Used by the kitchen-display "Reservations" tab.
export async function GET() {
  const user = await getSessionUser();
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
