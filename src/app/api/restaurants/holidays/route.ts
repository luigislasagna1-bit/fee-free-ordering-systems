/**
 * Restaurant holiday closures.
 *
 * GET  — list all upcoming holidays (past ones pruned at read time so
 *        the UI stays tidy without us needing a cron to clean them up)
 * POST — add/replace a special day:
 *        { date: "YYYY-MM-DD", endDate?: "YYYY-MM-DD", name?: string,
 *          message?: string, rules?: HolidayRule[] }
 *        rules/endDate/message are the Gloriafood-parity extensions
 *        (Luigi 2026-06-11): period closures, per-service rules, custom
 *        open hours and a customer-facing note. Omitted rules = the
 *        legacy "fully closed, all services" behaviour.
 *
 * Deletion is a separate route at /[id] for clean REST shape and to
 * keep the body payload zero (DELETE with body is awkward).
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { parseHolidayRules, validateHolidayRulesAgainstHours } from "@/lib/holiday-rules";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Only show today + future. Past holidays are noise — the UI doesn't
  // need them and we don't gain anything from keeping them visible.
  // Note: this is a render filter only; we don't physically delete the
  // rows (some restaurants may want a historical record, and a future
  // analytics view might surface "we were closed N days last year").
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const holidays = await prisma.restaurantHoliday.findMany({
    // A PERIOD that started in the past is still active until its endDate.
    where: { restaurantId, OR: [{ date: { gte: todayStart } }, { endDate: { gte: todayStart } }] },
    orderBy: { date: "asc" },
  });
  return NextResponse.json({ holidays });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const dateStr = typeof body?.date === "string" ? body.date : "";
  const name = typeof body?.name === "string" && body.name.trim() ? body.name.trim().slice(0, 80) : null;
  const message =
    typeof body?.message === "string" && body.message.trim() ? body.message.trim().slice(0, 200) : null;
  const endDateStr = typeof body?.endDate === "string" && body.endDate ? body.endDate : null;

  if (!DATE_RE.test(dateStr)) {
    return NextResponse.json({ error: "Date must be YYYY-MM-DD" }, { status: 400 });
  }
  if (endDateStr && !DATE_RE.test(endDateStr)) {
    return NextResponse.json({ error: "End date must be YYYY-MM-DD" }, { status: 400 });
  }
  if (endDateStr && endDateStr < dateStr) {
    return NextResponse.json({ error: "End date must be on or after the start date" }, { status: 400 });
  }

  // Sanitise the per-service rules through the same parser the enforcement
  // path uses, so anything we store is guaranteed to resolve. Null result =
  // legacy "fully closed, all services" — store null, not "[]".
  const rules = body?.rules !== undefined ? parseHolidayRules(JSON.stringify(body.rules)) : null;

  // Build a UTC-midnight Date for the requested calendar day. We store
  // as @db.Date which is just a calendar date (no time, no zone) so
  // any midnight in UTC for the right YMD components is fine.
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }
  const endDate = endDateStr ? new Date(`${endDateStr}T00:00:00.000Z`) : null;

  // Exceptional open/closed windows must fit inside the governing service's
  // NORMAL hours for that day — you can't close pickup at a time pickup isn't
  // offered (Luigi 2026-06-26). Authoritative server-side gate; the admin form
  // shows the same check inline. Uses the start date's day-of-week (single-day
  // rules are the norm; a range is bounded by its start day's schedule).
  if (rules) {
    const openingHours = await prisma.openingHours.findMany({
      where: { restaurantId },
      select: { dayOfWeek: true, openTime: true, closeTime: true, isOpen: true, closesNextDay: true, service: true, intervals: true },
    });
    const startDow = date.getUTCDay();
    const offending = validateHolidayRulesAgainstHours(rules, openingHours as any, startDow);
    if (offending) {
      return NextResponse.json(
        {
          error: `That window (${offending.window.open}–${offending.window.close}) is outside the ${offending.service ?? "general"} hours for that day. Exceptional hours must be within the service's normal hours.`,
          code: "window_outside_service_hours",
          service: offending.service,
          window: offending.window,
        },
        { status: 400 },
      );
    }
  }

  try {
    const data = {
      name,
      message,
      endDate,
      rules: rules ? JSON.stringify(rules) : null,
    };
    const holiday = await prisma.restaurantHoliday.upsert({
      where: { restaurantId_date: { restaurantId, date } },
      update: data,
      create: { restaurantId, date, ...data },
    });
    return NextResponse.json({ holiday });
  } catch (err) {
    console.error("[holidays/POST] failed", err);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
