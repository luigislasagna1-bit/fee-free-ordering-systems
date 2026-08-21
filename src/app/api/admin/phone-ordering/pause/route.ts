/**
 * /api/admin/phone-ordering/pause  (phone-ordering admin, feature-gated)
 *
 * Phone-ONLY service pause — writes to VoiceAgentConfig.phone*PausedUntil,
 * NOT to the shared Restaurant.*PausedUntil columns. The website and kitchen
 * app are completely unaffected; the voice context builder (context-payload.ts)
 * reads these columns exclusively.
 *
 *   GET  → { enabled, pausedUntil, hoursFormat }  (same shape as /api/admin/pause-services)
 *   POST → { services[], ...PauseUntilBody }       (same body shape as /api/admin/pause-services)
 *
 * Luigi 2026-08-20: separated from the shared pause after pausing delivery via
 * the Nabil dashboard also paused the website — which was intentional by the
 * original design but not what Luigi wants.
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { resolvePauseUntil, type PauseUntilBody } from "@/lib/pause-until";
import { requirePhoneOrderingAdmin } from "../guard";

type ServiceKey =
  | "pickup" | "delivery" | "dineIn" | "catering" | "takeOut" | "reservations";

const SERVICE_TO_COLUMN: Record<ServiceKey, string> = {
  pickup: "phonePickupPausedUntil",
  delivery: "phoneDeliveryPausedUntil",
  dineIn: "phoneDineInPausedUntil",
  catering: "phoneCateringPausedUntil",
  takeOut: "phoneTakeOutPausedUntil",
  reservations: "phoneReservationsPausedUntil",
};

export async function GET() {
  const gate = await requirePhoneOrderingAdmin();
  if (gate.fail) return gate.fail;
  const { restaurantId } = gate;

  const [r, cfg] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        acceptsPickup: true, acceptsDelivery: true, acceptsDineIn: true,
        acceptsCatering: true, acceptsTakeOut: true, acceptsReservations: true,
        hoursFormat: true, timezone: true,
      },
    }),
    prisma.voiceAgentConfig.findUnique({
      where: { restaurantId },
      select: {
        phonePickupPausedUntil: true, phoneDeliveryPausedUntil: true,
        phoneDineInPausedUntil: true, phoneCateringPausedUntil: true,
        phoneTakeOutPausedUntil: true, phoneReservationsPausedUntil: true,
      },
    }),
  ]);
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    enabled: {
      pickup: r.acceptsPickup, delivery: r.acceptsDelivery, dineIn: r.acceptsDineIn,
      catering: r.acceptsCatering, takeOut: r.acceptsTakeOut, reservations: r.acceptsReservations,
    },
    pausedUntil: {
      pickup: cfg?.phonePickupPausedUntil?.toISOString() ?? null,
      delivery: cfg?.phoneDeliveryPausedUntil?.toISOString() ?? null,
      dineIn: cfg?.phoneDineInPausedUntil?.toISOString() ?? null,
      catering: cfg?.phoneCateringPausedUntil?.toISOString() ?? null,
      takeOut: cfg?.phoneTakeOutPausedUntil?.toISOString() ?? null,
      reservations: cfg?.phoneReservationsPausedUntil?.toISOString() ?? null,
    },
    hoursFormat: r.hoursFormat === "24h" ? "24h" : "12h",
  });
}

export async function POST(req: NextRequest) {
  const gate = await requirePhoneOrderingAdmin();
  if (gate.fail) return gate.fail;
  const { restaurantId } = gate;

  let body: { services?: string[] } & PauseUntilBody;
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

  const r = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { timezone: true },
  });
  const resolved = resolvePauseUntil(body, r?.timezone ?? "UTC");
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: 400 });
  }
  const until = resolved.until;

  const data: Record<string, Date | null> = {};
  for (const col of cols) data[col] = until;

  await prisma.voiceAgentConfig.upsert({
    where: { restaurantId },
    update: data,
    create: { restaurantId, ...data },
  });

  return NextResponse.json({
    ok: true,
    services,
    pausedUntil: until ? until.toISOString() : null,
  });
}
