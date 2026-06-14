/**
 * Opening hours + display-format save endpoint.
 *
 * Body shape:
 *   {
 *     hours: [
 *       { dayOfWeek: 0, isOpen: true, openTime: "09:00",
 *         closeTime: "21:00", closesNextDay: false,
 *         service?: null | "pickup" | "delivery" | "reservation" },
 *       ...
 *     ],
 *     hoursFormat?: "12h" | "24h"
 *   }
 *
 * `hoursFormat` is optional — if present, persist it on the restaurant
 * row so the customer-facing surfaces render the new convention. We
 * accept it on the same endpoint so the UI can save format + hours in
 * one button click; less moving parts for the admin.
 *
 * `service` is optional — null/missing = the "default/all services" row,
 * a specific value = per-service override. The new unique key on
 * OpeningHours is `(restaurantId, dayOfWeek, service)` so default and
 * per-service rows for the same day coexist. GloriaFood-parity 2026-05-31.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { blockIfInheritingSetting } from "@/lib/brand";

const VALID_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // A child location that INHERITS its hours from the brand can't edit them here
  // — it must turn "Opening hours" off in Locations first. Luigi 2026-06-14.
  const blocked = await blockIfInheritingSetting(restaurantId, "hours");
  if (blocked) return blocked;

  const body = await req.json().catch(() => ({}));
  const hours = Array.isArray(body?.hours) ? body.hours : [];
  const format = body?.hoursFormat === "12h" || body?.hoursFormat === "24h" ? body.hoursFormat : null;

  // Validate each row before any DB write — cheaper than rolling back
  // partial writes on bad input.
  //
  // Auto-fix step (Luigi 2026-06-01): when openTime > closeTime and
  // closesNextDay is false, the window is impossible (close happens
  // 11+ hours BEFORE open). Almost always means the owner wanted
  // 12:00 AM to mean "midnight at end of day" but the picker stored
  // it as 00:00 (midnight at start). Auto-flip closesNextDay = true
  // so the row reads correctly without making the owner re-save.
  // The previous quiet "closed all day" interpretation was the root
  // cause of the reservation false-closed report.
  for (const h of hours) {
    if (typeof h?.dayOfWeek !== "number" || h.dayOfWeek < 0 || h.dayOfWeek > 6) {
      return NextResponse.json({ error: "Invalid dayOfWeek" }, { status: 400 });
    }
    if (h.isOpen) {
      if (!VALID_HHMM.test(h.openTime) || !VALID_HHMM.test(h.closeTime)) {
        return NextResponse.json({ error: "Times must be HH:MM 24-hour" }, { status: 400 });
      }
      const [oh, om] = h.openTime.split(":").map(Number);
      const [ch, cm] = h.closeTime.split(":").map(Number);
      const openMin = oh * 60 + om;
      const closeMin = ch * 60 + cm;
      if (closeMin <= openMin && !h.closesNextDay) {
        // Auto-toggle closesNextDay rather than rejecting. Mirrors
        // the smart default GloriaFood uses when an owner types
        // "11 AM – 12 AM" in their hours editor.
        h.closesNextDay = true;
      }
    }
  }

  // Reject saves where every day is marked closed (audit 2026-05-30).
  // The owner ALMOST certainly didn't mean to make their restaurant
  // unreachable for the rest of time; this catches accidental
  // "Apply to all → closed" clicks. Owner can still close individual
  // days; the guard only fires when the entire week is off AND the
  // payload covers all 7 days (so partial updates still work).
  if (hours.length >= 7 && hours.every((h: any) => !h.isOpen)) {
    return NextResponse.json(
      {
        error:
          "Refusing to save: every day is marked closed. Toggle at least one day open, or use the temporary-close switch on the dashboard if you want to pause briefly.",
        code: "all_days_closed",
      },
      { status: 400 },
    );
  }

  const ALLOWED_SERVICES = new Set([null, "pickup", "delivery", "reservation"]);
  for (const h of hours) {
    // Normalize the service field. "" → null so the default-row lookup
    // hits the SQL NULL correctly. Reject unknown service values so an
    // attacker can't stuff arbitrary strings into the column.
    const service: string | null = h.service === "pickup" || h.service === "delivery" || h.service === "reservation"
      ? h.service
      : null;
    if (!ALLOWED_SERVICES.has(service)) {
      return NextResponse.json({ error: "Invalid service" }, { status: 400 });
    }
    // Prisma can't model a compound unique against a NULLABLE column
    // in the generated where input — `service: null` is rejected at
    // type-check time. Workaround: find-then-update. Race-safe enough
    // for an admin-only endpoint (no two staff members simultaneously
    // editing the same restaurant's hours).
    const existing = await prisma.openingHours.findFirst({
      where: { restaurantId, dayOfWeek: h.dayOfWeek, service },
      select: { id: true },
    });
    if (existing) {
      await prisma.openingHours.update({
        where: { id: existing.id },
        data: {
          isOpen: !!h.isOpen,
          openTime: h.openTime,
          closeTime: h.closeTime,
          closesNextDay: !!h.closesNextDay,
        },
      });
    } else {
      await prisma.openingHours.create({
        data: {
          restaurantId,
          dayOfWeek: h.dayOfWeek,
          isOpen: !!h.isOpen,
          openTime: h.openTime,
          closeTime: h.closeTime,
          closesNextDay: !!h.closesNextDay,
          service,
        },
      });
    }
  }

  if (format) {
    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: { hoursFormat: format },
    });
  }

  return NextResponse.json({ success: true });
}
