/**
 * Opening hours + display-format save endpoint.
 *
 * Body shape:
 *   {
 *     hours: [
 *       { dayOfWeek: 0, isOpen: true, openTime: "09:00",
 *         closeTime: "21:00", closesNextDay: false },
 *       ...
 *     ],
 *     hoursFormat?: "12h" | "24h"
 *   }
 *
 * `hoursFormat` is optional — if present, persist it on the restaurant
 * row so the customer-facing surfaces render the new convention. We
 * accept it on the same endpoint so the UI can save format + hours in
 * one button click; less moving parts for the admin.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";

const VALID_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const hours = Array.isArray(body?.hours) ? body.hours : [];
  const format = body?.hoursFormat === "12h" || body?.hoursFormat === "24h" ? body.hoursFormat : null;

  // Validate each row before any DB write — cheaper than rolling back
  // partial writes on bad input.
  for (const h of hours) {
    if (typeof h?.dayOfWeek !== "number" || h.dayOfWeek < 0 || h.dayOfWeek > 6) {
      return NextResponse.json({ error: "Invalid dayOfWeek" }, { status: 400 });
    }
    if (h.isOpen) {
      if (!VALID_HHMM.test(h.openTime) || !VALID_HHMM.test(h.closeTime)) {
        return NextResponse.json({ error: "Times must be HH:MM 24-hour" }, { status: 400 });
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

  for (const h of hours) {
    await prisma.openingHours.upsert({
      where: { restaurantId_dayOfWeek: { restaurantId, dayOfWeek: h.dayOfWeek } },
      update: {
        isOpen: !!h.isOpen,
        openTime: h.openTime,
        closeTime: h.closeTime,
        closesNextDay: !!h.closesNextDay,
      },
      create: {
        restaurantId,
        dayOfWeek: h.dayOfWeek,
        isOpen: !!h.isOpen,
        openTime: h.openTime,
        closeTime: h.closeTime,
        closesNextDay: !!h.closesNextDay,
      },
    });
  }

  if (format) {
    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: { hoursFormat: format },
    });
  }

  return NextResponse.json({ success: true });
}
