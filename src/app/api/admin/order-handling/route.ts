import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";

// Order-acceptance + scheduling toggles, relocated out of /admin/services into the
// dedicated "Order Handling" page (Taking Orders). Focused PATCH so each toggle
// auto-saves on its own without touching the per-service config. Mirrors the
// notification-customer route. Luigi 2026-06-22.
const KEYS = [
  "autoAcceptOrders",
  "allowScheduledOrders",
  "requireScheduledOrders",
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
