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
    // End of today in the restaurant's local timezone. We use UTC
    // midnight tomorrow minus a minute as a safe "rest of day" — the
    // customer-side check uses Date.now() vs the stored UTC moment,
    // so timezone of the restaurant doesn't matter for correctness,
    // only for display.
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setHours(23, 59, 0, 0);
    until = tomorrow;
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
