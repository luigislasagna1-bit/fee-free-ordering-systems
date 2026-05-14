import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { randomBytes } from "crypto";

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser();
    const restaurantId = user?.restaurantId;
    if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");
    const status = searchParams.get("status");

    const where: any = { restaurantId };
    if (date) where.date = date;
    if (status && status !== "all") where.status = status;

    const reservations = await prisma.reservation.findMany({
      where,
      orderBy: [{ date: "asc" }, { time: "asc" }],
      include: { table: { select: { id: true, name: true, section: true } } },
    });

    return NextResponse.json(reservations);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    const restaurantId = user?.restaurantId;
    if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const {
      customerName, customerEmail, customerPhone, partySize,
      date, time, durationMinutes, notes, tableId, orderId,
    } = body;

    if (!customerName || !partySize || !date || !time) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const confirmationCode = randomBytes(3).toString("hex").toUpperCase();

    const reservation = await prisma.reservation.create({
      data: {
        restaurantId,
        tableId: tableId || null,
        orderId: orderId || null,
        confirmationCode,
        status: "pending",
        customerName,
        customerEmail: customerEmail || null,
        customerPhone: customerPhone || null,
        partySize: parseInt(partySize),
        date,
        time,
        durationMinutes: durationMinutes ?? 90,
        notes: notes || null,
      },
      include: { table: { select: { id: true, name: true, section: true } } },
    });

    return NextResponse.json(reservation, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
