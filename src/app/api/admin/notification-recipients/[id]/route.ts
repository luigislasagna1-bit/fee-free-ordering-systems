import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";

// Allow-listed columns the API will write. Keep this in sync with the admin
// UI in src/app/admin/notifications/NotificationsClient.tsx — toggles hidden
// from the UI are also stripped from this list, so a curl-wielding user can't
// flip dead toggles that no handler reads. The DB columns remain so old data
// isn't lost when/if the toggle is re-enabled later.
const TOGGLES = [
  "isActive", "emailLanguage",
  "deliveryConfirmed", "pickupConfirmed", "tableReservationConfirmed", "orderAheadConfirmed", "dineInConfirmed",
  "orderPlaced", "orderAccepted", "orderRejected", "orderCanceled", "orderMissed",
  "endOfDayReport", "endOfMonthReport",
  // Dead toggles intentionally excluded (no handler ever reads them):
  //   "orderNotPlaced", "lowBattery", "badInternet"
];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const data: Record<string, unknown> = {};
  for (const key of TOGGLES) {
    if (body[key] !== undefined) data[key] = body[key];
  }
  if (body.name !== undefined) data.name = body.name ? String(body.name).slice(0, 100) : null;

  const recipient = await prisma.notificationRecipient.findFirst({ where: { id, restaurantId } });
  if (!recipient) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.notificationRecipient.update({ where: { id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const recipient = await prisma.notificationRecipient.findFirst({ where: { id, restaurantId } });
  if (!recipient) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.notificationRecipient.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
