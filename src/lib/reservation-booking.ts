/**
 * Shared reservation booking helpers — used by BOTH the standalone booking
 * route (`/api/public/reservations`) AND the combined reserve-then-order path
 * (`/api/orders` with a `reservation` payload). Keeping these in one place
 * guarantees a pre-order booking can NEVER bypass the same capacity / slot
 * rules a normal booking goes through. Luigi 2026-06-08.
 */
import prisma from "@/lib/db";
import type { ReservationSettingsLike } from "@/lib/reservation-validation";

/** 6-char uppercase confirmation code, no ambiguous chars (no O/0/I/1). */
export function generateConfirmationCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

/**
 * Server-side capacity check: are there enough open slots at this time?
 * Considers existing pending/confirmed/seated/completed reservations plus the
 * holdMinutes buffer, against maxPerSlot (bookings) and maxGuests (heads).
 */
export async function checkReservationCapacity(
  restaurantId: string,
  s: ReservationSettingsLike,
  date: string,
  time: string,
  partySize: number,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const slotStart = new Date(`${date}T${time}:00`);
  const halfSlot = (s.slotLengthMinutes ?? 30) * 60 * 1000;

  // Fetch reservations on the same date that aren't cancelled / no_show / rejected
  const same = await prisma.reservation.findMany({
    where: {
      restaurantId,
      date,
      status: { in: ["pending", "confirmed", "seated", "completed"] },
    },
    select: { time: true, partySize: true, durationMinutes: true },
  });

  // Count concurrent reservations whose window overlaps this slot
  let concurrentBookings = 0;
  let concurrentGuests = 0;
  for (const r of same) {
    const rStart = new Date(`${date}T${r.time}:00`).getTime();
    const rEnd = rStart + (r.durationMinutes + s.holdMinutes) * 60 * 1000;
    const wantStart = slotStart.getTime();
    const wantEnd = wantStart + halfSlot;
    if (rStart < wantEnd && rEnd > wantStart) {
      concurrentBookings++;
      concurrentGuests += r.partySize;
    }
  }
  if (concurrentBookings >= s.maxPerSlot) {
    return { ok: false, reason: "Sorry — this time slot is fully booked. Please pick another time." };
  }
  if (concurrentGuests + partySize > s.maxGuests) {
    return { ok: false, reason: "We can't fit a party that size at this time. Please pick another time." };
  }
  return { ok: true };
}
