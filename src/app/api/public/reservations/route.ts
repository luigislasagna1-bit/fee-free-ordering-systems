import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { validateBooking, type ReservationSettingsLike } from "@/lib/reservation-validation";
import { generateConfirmationCode, checkReservationCapacity } from "@/lib/reservation-booking";
import { notifyStaff, notifyCustomer } from "@/lib/notifications";

function sanitize(s: unknown, max = 500): string {
  return String(s ?? "").trim().slice(0, max);
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

    // Phone must be an actual number — no letters, at least 6 digits. Mirrors
    // the order route's guard (cmq0vafk5); defense-in-depth against autofill /
    // clients that bypass the keystroke filter on the reservation form.
    if (/[a-z]/i.test(String(customerPhone)) || (String(customerPhone).match(/\d/g)?.length ?? 0) < 6) {
      return NextResponse.json({ error: "Please enter a valid phone number.", code: "invalid_phone" }, { status: 400 });
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { slug: restaurantSlug, isActive: true },
      select: {
        id: true, name: true, email: true, slug: true, acceptsReservations: true,
        reservationSettings: true, defaultLanguage: true, timezone: true,
        // openingHours powers the closed-day server-side guard. Mirror
        // the client check: if the owner explicitly marked the day off
        // (in reservationHours JSON OR Restaurant.openingHours), refuse
        // the booking. Belt-and-suspenders to the disabled client
        // button — hand-crafted POSTs can't sneak through. Luigi
        // 2026-06-01: "if the restaurant is closed in settings, it
        // shouldn't allow anyone to put in a reservation."
        openingHours: { select: { dayOfWeek: true, isOpen: true, service: true } },
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

    // Validate against rules. Pass restaurant.timezone so the
    // proposal's "YYYY-MM-DD HH:MM" string is interpreted as the
    // restaurant's local wall-clock — server runs in UTC on Vercel,
    // so without this a 6 PM Toronto booking parsed as 6 PM UTC
    // (= 2 PM EST) would fail "at least N hours notice" even though
    // it's hours in the future for the customer. Luigi 2026-06-01.
    const v = validateBooking(
      settings as ReservationSettingsLike,
      { date, time, partySize: parseInt(String(partySize)) },
      new Date(),
      restaurant.timezone,
    );
    if (!v.ok) return NextResponse.json({ error: v.reason }, { status: 400 });

    // Closed-day server guard. If the owner marked the day off in
    // either the reservationHours JSON or Restaurant.openingHours
    // (preferring a "reservation"-scoped row when present), refuse
    // the booking. Belt-and-suspenders to the disabled client button.
    const probeDate = new Date(`${date}T00:00:00`);
    const probeDow = probeDate.getDay();
    let resHoursMap: Record<string, { enabled?: boolean }> = {};
    try { resHoursMap = JSON.parse(settings.reservationHours || "{}"); } catch { /* noop */ }
    const explicitResDay = resHoursMap[String(probeDow)];
    let dayBlocked = false;
    if (explicitResDay && explicitResDay.enabled === false) {
      dayBlocked = true;
    } else if (!explicitResDay) {
      // No reservationHours row for the day → check openingHours.
      const resRow = restaurant.openingHours.find(
        (h) => h.dayOfWeek === probeDow && h.service === "reservation",
      );
      const defaultRow = restaurant.openingHours.find(
        (h) => h.dayOfWeek === probeDow && (h.service == null || h.service === ""),
      );
      const row = resRow ?? defaultRow;
      if (row && row.isOpen === false) dayBlocked = true;
    }
    if (dayBlocked) {
      const dayLabel = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][probeDow];
      return NextResponse.json(
        { error: `We're closed on ${dayLabel} — please pick a different date.` },
        { status: 400 },
      );
    }

    // Capacity
    const cap = await checkReservationCapacity(restaurant.id, settings as ReservationSettingsLike, date, time, parseInt(String(partySize)));
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

    // ── Notifications (toggle-aware fan-out) ─────────────────────────────
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    // Customer copy distinguishes "requested" (pending manual acceptance) from
    // "confirmed". Staff copy keeps "pending" (their action item). Luigi 2026-06-04.
    const customerStatus = initialStatus === "confirmed" ? "confirmed" : "requested";
    const staffStatus = initialStatus === "confirmed" ? "confirmed" : "pending";
    notifyCustomer({
      restaurantId: restaurant.id,
      customerEmail: reservation.customerEmail,
      customerLocale: restaurant.defaultLanguage || "en",
      payload: {
        event: "reservationConfirmation",
        customerName: reservation.customerName,
        partySize: reservation.partySize,
        date: reservation.date,
        time: reservation.time,
        confirmationCode: reservation.confirmationCode,
        status: customerStatus,
        depositAmount: reservation.depositAmount,
        preOrderTotal: preOrderTotal ?? undefined,
      },
    }).catch((e) => console.error("[notifyCustomer reservation]", e));
    notifyStaff({
      restaurantId: restaurant.id,
      payload: {
        event: "reservationConfirmed",
        customerName: reservation.customerName,
        partySize: reservation.partySize,
        date: reservation.date,
        time: reservation.time,
        confirmationCode: reservation.confirmationCode,
        status: staffStatus,
        dashboardUrl: `${baseUrl}/admin/reservations`,
      },
    }).catch((e) => console.error("[notifyStaff reservation]", e));

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
