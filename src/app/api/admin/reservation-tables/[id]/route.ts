import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser();
    const restaurantId = user?.restaurantId;
    if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();
    const { name, number, section, capacity, isActive } = body;

    const existing = await prisma.reservationTable.findFirst({ where: { id, restaurantId } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const updated = await prisma.reservationTable.update({
      where: { id },
      data: {
        ...(name     !== undefined && { name: name.trim() }),
        ...(number   !== undefined && { number: number ? parseInt(number) : null }),
        ...(section  !== undefined && { section: section?.trim() || null }),
        ...(capacity !== undefined && { capacity: parseInt(capacity) || 4 }),
        ...(isActive !== undefined && { isActive }),
      },
    });
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
    const existing = await prisma.reservationTable.findFirst({ where: { id, restaurantId } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Unlink any reservations first
    await prisma.reservation.updateMany({ where: { tableId: id }, data: { tableId: null } });
    await prisma.reservationTable.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
