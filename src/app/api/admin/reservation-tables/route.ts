import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";

export async function GET() {
  try {
    const user = await getSessionUser();
    const restaurantId = user?.restaurantId;
    if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tables = await prisma.reservationTable.findMany({
      where: { restaurantId },
      orderBy: [{ section: "asc" }, { sortOrder: "asc" }],
    });
    return NextResponse.json(tables);
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
    const { name, number, section, capacity, isActive } = body;
    if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });

    const count = await prisma.reservationTable.count({ where: { restaurantId } });
    const table = await prisma.reservationTable.create({
      data: {
        restaurantId,
        name: name.trim(),
        number: number ? parseInt(number) : null,
        section: section?.trim() || null,
        capacity: parseInt(capacity) || 4,
        isActive: isActive ?? true,
        sortOrder: count,
      },
    });
    return NextResponse.json(table, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
