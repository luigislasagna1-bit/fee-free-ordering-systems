/**
 * /api/admin/pause-services  (ADMIN-scoped)
 *
 * The owner-facing twin of /api/kitchen/pause-services. Same per-service
 * `*PausedUntil` columns on Restaurant, same body shape — so a service paused
 * from the admin Services page is honoured everywhere the kitchen pause already
 * is (customer ordering banner + order/reservation gate + kitchen app), and
 * auto-resumes when the timestamp passes (no cron). Fabrizio asked for the pause
 * control in the backend, not only the app.
 *
 *   GET  → { enabled, pausedUntil, hoursFormat }  (current state for the control)
 *   POST → { services[], untilIso? | durationMinutes? | restOfDay? | resume? }
 *
 * Restaurant is always derived from the SESSION (never the client) → a write can
 * only ever touch the caller's own restaurant.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { parseLocalDateTimeInTz, dateKeyInTimezone } from "@/lib/restaurant-hours";

type ServiceKey =
  | "pickup" | "delivery" | "dineIn" | "catering" | "takeOut" | "reservations";

const SERVICE_TO_COLUMN: Record<ServiceKey, string> = {
  pickup: "pickupPausedUntil",
  delivery: "deliveryPausedUntil",
  dineIn: "dineInPausedUntil",
  catering: "cateringPausedUntil",
  takeOut: "takeOutPausedUntil",
  reservations: "reservationsPausedUntil",
};

export async function GET() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const r = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      acceptsPickup: true, acceptsDelivery: true, acceptsDineIn: true,
      acceptsCatering: true, acceptsTakeOut: true, acceptsReservations: true,
      pickupPausedUntil: true, deliveryPausedUntil: true, dineInPausedUntil: true,
      cateringPausedUntil: true, takeOutPausedUntil: true, reservationsPausedUntil: true,
      hoursFormat: true,
    },
  });
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    enabled: {
      pickup: r.acceptsPickup, delivery: r.acceptsDelivery, dineIn: r.acceptsDineIn,
      catering: r.acceptsCatering, takeOut: r.acceptsTakeOut, reservations: r.acceptsReservations,
    },
    pausedUntil: {
      pickup: r.pickupPausedUntil?.toISOString() ?? null,
      delivery: r.deliveryPausedUntil?.toISOString() ?? null,
      dineIn: r.dineInPausedUntil?.toISOString() ?? null,
      catering: r.cateringPausedUntil?.toISOString() ?? null,
      takeOut: r.takeOutPausedUntil?.toISOString() ?? null,
      reservations: r.reservationsPausedUntil?.toISOString() ?? null,
    },
    hoursFormat: r.hoursFormat === "24h" ? "24h" : "12h",
  });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    services?: string[];
    untilIso?: string | null;
    durationMinutes?: number;
    restOfDay?: boolean;
    resume?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const services = Array.isArray(body.services) ? body.services : [];
  if (services.length === 0) {
    return NextResponse.json({ error: "services array required" }, { status: 400 });
  }
  const cols: string[] = [];
  for (const s of services) {
    if (!(s in SERVICE_TO_COLUMN)) {
      return NextResponse.json({ error: `Unknown service: ${s}` }, { status: 400 });
    }
    cols.push(SERVICE_TO_COLUMN[s as ServiceKey]);
  }

  // null = resume (clear the pause). Otherwise resolve the resume instant from
  // one of the three input shapes — identical to the kitchen route.
  let until: Date | null;
  if (body.resume === true || body.untilIso === null) {
    until = null;
  } else if (typeof body.untilIso === "string" && body.untilIso) {
    const d = new Date(body.untilIso);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: "Invalid untilIso" }, { status: 400 });
    }
    until = d;
  } else if (typeof body.durationMinutes === "number" && body.durationMinutes > 0) {
    until = new Date(Date.now() + body.durationMinutes * 60_000);
  } else if (body.restOfDay) {
    // 23:59 TODAY in the restaurant's local timezone (DST-aware), not the
    // server clock — matches the kitchen route.
    const r = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { timezone: true },
    });
    const tz = r?.timezone ?? "UTC";
    const localDate = dateKeyInTimezone(new Date(), tz);
    until = parseLocalDateTimeInTz(localDate, 23, 59, tz);
  } else {
    return NextResponse.json(
      { error: "Must provide untilIso, durationMinutes, restOfDay, or resume: true" },
      { status: 400 },
    );
  }

  const data: Record<string, Date | null> = {};
  for (const col of cols) data[col] = until;

  await prisma.restaurant.update({ where: { id: restaurantId }, data });

  return NextResponse.json({
    ok: true,
    services,
    pausedUntil: until ? until.toISOString() : null,
  });
}
