import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { notifyCustomer } from "@/lib/notifications";

const ALLOWED_STATUSES = ["pending", "confirmed", "seated", "completed", "cancelled", "no_show"] as const;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser();
    const restaurantId = user?.restaurantId;
    if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();
    const { status, tableId, staffNotes, durationMinutes, depositPaid } = body;

    const existing = await prisma.reservation.findFirst({ where: { id, restaurantId } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (status && !ALLOWED_STATUSES.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const updated = await prisma.reservation.update({
      where: { id },
      data: {
        ...(status      !== undefined && { status }),
        ...(tableId     !== undefined && { tableId: tableId || null }),
        ...(staffNotes  !== undefined && { staffNotes }),
        ...(durationMinutes !== undefined && { durationMinutes }),
        ...(depositPaid !== undefined && { depositPaid }),
      },
      include: { table: { select: { id: true, name: true, section: true } } },
    });

    // Email the customer on accept/decline transitions. A pending reservation
    // only sent a "request received" note; the confirmation (or decline) fires
    // here when the restaurant actually acts. Fire-and-forget. Luigi 2026-06-04.
    const becameConfirmed = status === "confirmed" && existing.status !== "confirmed";
    const becameDeclined = status === "cancelled" && existing.status !== "cancelled";
    if ((becameConfirmed || becameDeclined) && existing.customerEmail) {
      const r = await prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { defaultLanguage: true },
      });
      notifyCustomer({
        restaurantId,
        customerEmail: existing.customerEmail,
        customerLocale: r?.defaultLanguage || "en",
        payload: {
          event: "reservationConfirmation",
          customerName: existing.customerName,
          partySize: existing.partySize,
          date: existing.date,
          time: existing.time,
          confirmationCode: existing.confirmationCode,
          status: becameConfirmed ? "confirmed" : "declined",
          depositAmount: existing.depositAmount,
          preOrderTotal: existing.preOrderTotal ?? undefined,
        },
      }).catch((e) => console.error("[notifyCustomer reservation status]", e));
    }

    return NextResponse.json(updated);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser();
    const restaurantId = user?.restaurantId;
    if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const existing = await prisma.reservation.findFirst({ where: { id, restaurantId } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.reservation.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
