import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireInternalKey } from "@/lib/voice/internal-auth";
import {
  validateBooking,
  resolveDayHours,
  resolveReservationIntervals,
  type ReservationSettingsLike,
} from "@/lib/reservation-validation";

export const runtime = "nodejs";

// Cap how many bookable slots we return / capacity-check per call. Voice callers
// want "what's open around 7", not a 40-slot dump.
const MAX_SLOTS = 16;

function asJsonString(v: unknown): string {
  if (typeof v === "string") return v;
  if (v == null) return "";
  try {
    return JSON.stringify(v);
  } catch {
    return "";
  }
}
function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
function toHHMM(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/**
 * GET /api/internal/voice/reservation-availability?slug=&date=YYYY-MM-DD&partySize=N
 *
 * The `check_reservation_availability` tool. There is no customer GET
 * availability endpoint (slot math lives client-side; the server re-validates on
 * POST), so this enumerates candidate slots and runs the SAME authoritative pure
 * validator (`validateBooking`) the booking POST uses, then an in-memory mirror
 * of `checkReservationCapacity` (one day-query instead of one per slot). Every
 * slot Nabil offers will therefore actually book on `POST /api/public/reservations`.
 */
export async function GET(req: NextRequest) {
  const forbidden = requireInternalKey(req);
  if (forbidden) return forbidden;

  const sp = req.nextUrl.searchParams;
  const slug = (sp.get("slug") || "").toLowerCase().trim();
  const date = (sp.get("date") || "").trim();
  const partySize = parseInt(sp.get("partySize") || "", 10);

  if (!slug) return NextResponse.json({ error: "Missing slug", code: "missing_slug" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Bad date", code: "bad_date" }, { status: 400 });
  if (!Number.isInteger(partySize) || partySize < 1) {
    return NextResponse.json({ error: "Bad partySize", code: "bad_party" }, { status: 400 });
  }

  const r = await prisma.restaurant.findFirst({
    where: { slug, isActive: true },
    select: {
      id: true,
      timezone: true,
      acceptsReservations: true,
      reservationsPausedUntil: true,
      reservationSettings: true,
      openingHours: {
        select: {
          dayOfWeek: true, isOpen: true, openTime: true, closeTime: true,
          closesNextDay: true, service: true, intervals: true,
        },
      },
    },
  });
  if (!r) return NextResponse.json({ error: "Restaurant not found", code: "not_found" }, { status: 404 });

  if (!r.acceptsReservations || !r.reservationSettings) {
    return NextResponse.json({ available: false, reason: "not_offered", slots: [] });
  }
  const now = new Date();
  if (r.reservationsPausedUntil && r.reservationsPausedUntil.getTime() > now.getTime()) {
    return NextResponse.json({ available: false, reason: "paused", slots: [] });
  }

  const rs = r.reservationSettings;
  const settings: ReservationSettingsLike = {
    minNoticeHours: rs.minNoticeHours,
    minNoticeMinutes: rs.minNoticeMinutes ?? undefined,
    maxAdvanceDays: rs.maxAdvanceDays,
    slotLengthMinutes: rs.slotLengthMinutes,
    maxPerSlot: rs.maxPerSlot,
    minGuests: rs.minGuests,
    maxGuests: rs.maxGuests,
    autoConfirm: rs.autoConfirm,
    allowPreOrder: rs.allowPreOrder,
    holdMinutes: rs.holdMinutes,
    requireDeposit: rs.requireDeposit,
    depositAmount: rs.depositAmount,
    cancellationPolicy: rs.cancellationPolicy ?? undefined,
    reservationHours: asJsonString(rs.reservationHours),
    blackoutDates: asJsonString(rs.blackoutDates),
  };

  const tz = r.timezone || undefined;
  const oh = r.openingHours;
  const splitIntervals = resolveReservationIntervals(oh, date);
  const dayHours = resolveDayHours(settings.reservationHours, oh, date);

  const windows: Array<{ open: string; close: string; closesNextDay?: boolean | null }> =
    splitIntervals.length > 0
      ? splitIntervals.map((iv) => ({ open: iv.open, close: iv.close, closesNextDay: iv.closesNextDay }))
      : dayHours
        ? [dayHours]
        : [];

  if (windows.length === 0) {
    return NextResponse.json({ available: false, reason: "closed", slots: [] });
  }

  const step = Math.max(5, settings.slotLengthMinutes || 30);
  const candidates: string[] = [];
  for (const w of windows) {
    const o = toMin(w.open);
    let c = toMin(w.close);
    if (w.closesNextDay || c <= o) c += 1440; // cross-midnight window
    for (let t = o; t <= c; t += step) candidates.push(toHHMM(t));
  }
  const uniqueCandidates = [...new Set(candidates)];

  // ONE query for the whole day, then an in-memory mirror of
  // checkReservationCapacity (src/lib/reservation-booking.ts) — avoids one query
  // per candidate slot. The booking POST still runs the canonical check.
  const same = await prisma.reservation.findMany({
    where: { restaurantId: r.id, date, status: { in: ["pending", "confirmed", "seated", "completed"] } },
    select: { time: true, partySize: true, durationMinutes: true },
  });
  const halfSlot = (settings.slotLengthMinutes || 30) * 60 * 1000;
  const capacityOk = (time: string): boolean => {
    const wantStart = new Date(`${date}T${time}:00`).getTime();
    const wantEnd = wantStart + halfSlot;
    let bookings = 0;
    let guests = 0;
    for (const rv of same) {
      const rStart = new Date(`${date}T${rv.time}:00`).getTime();
      const rEnd = rStart + (rv.durationMinutes + settings.holdMinutes) * 60 * 1000;
      if (rStart < wantEnd && rEnd > wantStart) {
        bookings++;
        guests += rv.partySize;
      }
    }
    return bookings < settings.maxPerSlot && guests + partySize <= settings.maxGuests;
  };

  const slots: string[] = [];
  for (const time of uniqueCandidates) {
    if (slots.length >= MAX_SLOTS) break;
    const v = validateBooking(settings, { date, time, partySize }, now, tz, dayHours, splitIntervals);
    if (!v.ok) continue;
    if (capacityOk(time)) slots.push(time);
  }

  return NextResponse.json({
    available: slots.length > 0,
    date,
    partySize,
    slots,
    partyLimits: { min: settings.minGuests, max: settings.maxGuests },
  });
}
