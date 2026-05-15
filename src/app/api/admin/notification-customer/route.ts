import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";

const KEYS = [
  "customerEmailPickupReady",
  "customerEmailDeliveryReady",
  "customerEmailDineInReady",
  "customerEmailOrderRejected",
  "customerEmailOrderConfirm",
] as const;

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const data: Record<string, boolean> = {};
  for (const key of KEYS) {
    if (typeof body[key] === "boolean") data[key] = body[key];
  }
  await prisma.restaurant.update({ where: { id: restaurantId }, data });
  return NextResponse.json({ ok: true });
}
