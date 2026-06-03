/**
 * POST /api/kitchen/pause-services
 *
 * Pause one or more services for a duration. Kitchen-session-scoped
 * write. Each service gets its own pausedUntil timestamp; when the
 * timestamp passes the service auto-resumes on the next page load —
 * no cron required, the customer page just checks `< now`.
 *
 * Body shape:
 *   {
 *     services: ("pickup" | "delivery" | "dineIn" | "catering" |
 *                "takeOut" | "reservations")[],
 *     untilIso?: string,    // ISO timestamp — exact resume time
 *     durationMinutes?: number, // alternative: pause for N minutes from now
 *     restOfDay?: boolean,  // alternative: pause until 23:59 today
 *                           //  (restaurant's local timezone)
 *   }
 *
 * Exactly one of untilIso / durationMinutes / restOfDay must be set.
 *
 * To RESUME a service immediately, POST { services: [...], untilIso: null }
 * — the route accepts an explicit null to clear.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { kitchenAuthOptions } from "@/lib/auth-kitchen";
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

export async function POST(req: NextRequest) {
  const session = await getServerSession(kitchenAuthOptions);
  const restaurantId = (session?.user as any)?.restaurantId as string | undefined;
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
  // Validate every entry
  const cols: string[] = [];
  for (const s of services) {
    if (!(s in SERVICE_TO_COLUMN)) {
      return NextResponse.json({ error: `Unknown service: ${s}` }, { status: 400 });
    }
    cols.push(SERVICE_TO_COLUMN[s as ServiceKey]);
  }

  // Resolve the resume timestamp from one of the three input shapes.
  // null = resume immediately (clear the pause).
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
    // 23:59 TODAY in the RESTAURANT's local timezone, projected to the
    // correct UTC instant. The old code used new Date().setHours(23,59),
    // which is 23:59 on the SERVER's clock (UTC on Vercel) — so a Toronto
    // restaurant pausing "rest of day" resumed hours early/late. We now
    // resolve the restaurant's local calendar date and build the local
    // end-of-day with the same DST-aware helper used by scheduling.
    const r = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { timezone: true },
    });
    const tz = r?.timezone ?? "UTC";
    const localDate = dateKeyInTimezone(new Date(), tz); // "YYYY-MM-DD" in tz
    until = parseLocalDateTimeInTz(localDate, 23, 59, tz);
  } else {
    return NextResponse.json(
      { error: "Must provide untilIso, durationMinutes, restOfDay, or resume: true" },
      { status: 400 },
    );
  }

  // Build the update payload — one column per requested service.
  const data: Record<string, Date | null> = {};
  for (const col of cols) data[col] = until;

  await prisma.restaurant.update({ where: { id: restaurantId }, data });

  return NextResponse.json({
    ok: true,
    services,
    pausedUntil: until ? until.toISOString() : null,
  });
}
