/**
 * Restaurant holiday closures.
 *
 * GET  — list all upcoming holidays (past ones pruned at read time so
 *        the UI stays tidy without us needing a cron to clean them up)
 * POST — add a new holiday { date: "YYYY-MM-DD", name?: string }
 *
 * Deletion is a separate route at /[id] for clean REST shape and to
 * keep the body payload zero (DELETE with body is awkward).
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";

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
    where: { restaurantId, date: { gte: todayStart } },
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

  if (!DATE_RE.test(dateStr)) {
    return NextResponse.json({ error: "Date must be YYYY-MM-DD" }, { status: 400 });
  }

  // Build a UTC-midnight Date for the requested calendar day. We store
  // as @db.Date which is just a calendar date (no time, no zone) so
  // any midnight in UTC for the right YMD components is fine.
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  try {
    const holiday = await prisma.restaurantHoliday.upsert({
      where: { restaurantId_date: { restaurantId, date } },
      update: { name },
      create: { restaurantId, date, name },
    });
    return NextResponse.json({ holiday });
  } catch (err) {
    console.error("[holidays/POST] failed", err);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
