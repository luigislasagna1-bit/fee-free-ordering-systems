import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requireRestaurantAccess } from "@/lib/access";
import { listKitchenDevices } from "@/lib/kitchen-devices";
import prisma from "@/lib/db";

export async function GET() {
  const user = await getSessionUser();
  if (!user?.restaurantId) return NextResponse.json({ error: "no_restaurant" }, { status: 401 });
  await requireRestaurantAccess(user, user.restaurantId);
  const devices = await listKitchenDevices(user.restaurantId);
  return NextResponse.json({ devices });
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.restaurantId) return NextResponse.json({ error: "no_restaurant" }, { status: 401 });
  await requireRestaurantAccess(user, user.restaurantId);

  const body = await req.json().catch(() => ({} as any));
  const deviceId = String(body?.deviceId || "");
  const label = typeof body?.label === "string" ? body.label.trim().slice(0, 60) : null;

  const updated = await prisma.kitchenDevice.update({
    where: { id: deviceId },
    data: { label },
    select: { id: true, restaurantId: true, label: true },
  });
  if (updated.restaurantId !== user.restaurantId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return NextResponse.json({ ok: true, device: updated });
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.restaurantId) return NextResponse.json({ error: "no_restaurant" }, { status: 401 });
  await requireRestaurantAccess(user, user.restaurantId);

  const { searchParams } = new URL(req.url);
  const deviceId = searchParams.get("deviceId");
  if (!deviceId) return NextResponse.json({ error: "missing_device_id" }, { status: 400 });

  const device = await prisma.kitchenDevice.findUnique({
    where: { id: deviceId },
    select: { restaurantId: true },
  });
  if (!device) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (device.restaurantId !== user.restaurantId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  await prisma.kitchenDevice.delete({ where: { id: deviceId } });
  return NextResponse.json({ ok: true });
}
