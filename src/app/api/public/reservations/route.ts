import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { validateBooking, type ReservationSettingsLike } from "@/lib/reservation-validation";
import { sendReservationConfirmation, sendNewReservationNotification } from "@/lib/email";

function generateConfirmationCode(): string {
  // 6-char uppercase, no ambiguous chars (no O/0/I/1)
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

function sanitize(s: unknown, max = 500): string {
  return String(s ?? "").trim().slice(0, max);
}

// Server-side capacity check: are there enough open slots at this time?
// Considers existing confirmed/seated reservations plus the holdMinutes buffer.
async function checkCapacity(
  restaurantId: string,
  s: ReservationSettingsLike,
  date: string,
  time: string,
  partySize: number,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const slotStart = new Date(`${date}T${time}:00`);
  const halfSlot = (s.slotLengthMinutes ?? 30) * 60 * 1000;

  // Fetch reservations on the same date that aren't cancelled / no_show
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      restaurantSlug,
      customerName, customerEmail, customerPhone,
      partySize, date, time, notes,
      preOrderItems,
    } = body;

    if (!restaurantSlug || !customerName || !customerPhone || !partySize || !date || !time) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { slug: restaurantSlug, isActive: true },
      select: {
        id: true, name: true, email: true, slug: true, acceptsReservations: true,
        reservationSettings: true, defaultLanguage: true,
      },
    });
    if (!restaurant) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    if (!restaurant.acceptsReservations) {
      return NextResponse.json({ error: "This restaurant is not accepting reservations." }, { status: 400 });
    }

    const settings = restaurant.reservationSettings;
    if (!settings) {
      return NextResponse.json({ error: "Reservation settings not configured. Please contact the restaurant." }, { status: 400 });
    }

    // Validate against rules
    const v = validateBooking(settings as ReservationSettingsLike, { date, time, partySize: parseInt(String(partySize)) }, new Date());
    if (!v.ok) return NextResponse.json({ error: v.reason }, { status: 400 });

    // Capacity
    const cap = await checkCapacity(restaurant.id, settings as ReservationSettingsLike, date, time, parseInt(String(partySize)));
    if (!cap.ok) return NextResponse.json({ error: cap.reason }, { status: 409 });

    // Optional pre-order — for v1 store only the precomputed total. (Full Order
    // creation reuses the /api/orders flow; we don't duplicate the validator here.)
    let preOrderTotal = 0;
    if (Array.isArray(preOrderItems) && preOrderItems.length > 0 && settings.allowPreOrder) {
      preOrderTotal = preOrderItems.reduce((sum: number, it: any) =>
        sum + (Number(it.price) * Number(it.quantity || 1)), 0);
    }

    const code = generateConfirmationCode();
    const wantsDeposit = settings.requireDeposit && settings.depositAmount > 0;
    const initialStatus = wantsDeposit ? "pending" : (settings.autoConfirm ? "confirmed" : "pending");

    const reservation = await prisma.reservation.create({
      data: {
        restaurantId: restaurant.id,
        confirmationCode: code,
        status: initialStatus,
        customerName: sanitize(customerName, 100),
        customerEmail: customerEmail ? sanitize(customerEmail, 254).toLowerCase() : null,
        customerPhone: sanitize(customerPhone, 30),
        partySize: parseInt(String(partySize)),
        date,
        time,
        notes: notes ? sanitize(notes, 500) : null,
        depositAmount: wantsDeposit ? settings.depositAmount * parseInt(String(partySize)) : 0,
        depositPaid: false,
        preOrderTotal,
      },
    });

    // Notifications (placeholder if EMAIL_ENABLED is false — logs to console)
    if (reservation.customerEmail) {
      await sendReservationConfirmation({
        to: reservation.customerEmail,
        customerName: reservation.customerName,
        restaurantName: restaurant.name,
        partySize: reservation.partySize,
        date: reservation.date,
        time: reservation.time,
        confirmationCode: reservation.confirmationCode,
        status: initialStatus === "confirmed" ? "confirmed" : "pending",
        depositAmount: reservation.depositAmount,
        preOrderTotal,
        locale: restaurant.defaultLanguage || "en",
      });
    }
    if (restaurant.email) {
      await sendNewReservationNotification({
        to: restaurant.email ?? "",
        restaurantName: restaurant.name,
        customerName: reservation.customerName,
        partySize: reservation.partySize,
        date: reservation.date,
        time: reservation.time,
        confirmationCode: reservation.confirmationCode,
        status: initialStatus === "confirmed" ? "confirmed" : "pending",
        dashboardUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/admin/reservations`,
        locale: restaurant.defaultLanguage || "en",
      });
    }

    return NextResponse.json({
      ok: true,
      confirmationCode: reservation.confirmationCode,
      status: reservation.status,
      depositRequired: wantsDeposit,
      depositAmount: reservation.depositAmount,
    });
  } catch (e: any) {
    console.error("[POST /api/public/reservations]", e);
    return NextResponse.json({ error: e?.message ?? "Reservation failed" }, { status: 500 });
  }
}
