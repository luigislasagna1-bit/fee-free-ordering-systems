import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";


import prisma from "@/lib/db";

export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { hours } = await req.json();
  for (const h of hours) {
    await prisma.openingHours.upsert({
      where: { restaurantId_dayOfWeek: { restaurantId, dayOfWeek: h.dayOfWeek } },
      update: { isOpen: h.isOpen, openTime: h.openTime, closeTime: h.closeTime },
      create: { restaurantId, dayOfWeek: h.dayOfWeek, isOpen: h.isOpen, openTime: h.openTime, closeTime: h.closeTime },
    });
  }
  return NextResponse.json({ success: true });
}
