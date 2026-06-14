/**
 * GET /api/kitchen/end-of-day
 *
 * Returns today's live snapshot for the kitchen tablet plus the
 * ReceiptLine[] payload so the same data can be printed to the
 * connected thermal printer via the StarXpand bridge.
 *
 * Response:
 *   { ok: true, stats, width: 58|80, lines }
 *
 * Auth: kitchen session, scoped to the kitchen's restaurant.
 *
 * Mirrors the print-job/[orderId] / print-job/reservation/[id] route
 * shape so the kitchen client can reuse the same Star-print plumbing.
 * No raw ESC/POS bytes path yet — Luigi's printer is the Star
 * TSP143IIIW which only consumes the lines format anyway (per the
 * 2026-05-12 printer-pipeline notes).
 *
 * Luigi 2026-06-02.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { kitchenAuthOptions } from "@/lib/auth-kitchen";
import prisma from "@/lib/db";
import { buildTodaySnapshot, buildDayReport, currentOperationalDayKey } from "@/lib/digests";
import { buildEndOfDayReceiptLines } from "@/lib/receipt-lines";

/** How many operational days back the stepper can look (today + the prior 7). */
const LOOKBACK_DAYS = 7;

/** Shift a "YYYY-MM-DD" key by N days (noon-UTC anchor, DST-safe). */
function shiftKey(key: string, delta: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(kitchenAuthOptions);
  const restaurantId = (session?.user as any)?.restaurantId as string | undefined;
  if (!restaurantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const paperWidth = req.nextUrl.searchParams.get("width") === "58" ? "58mm" : "80mm";

  // Resolve the date window. The current OPERATIONAL day is the upper bound;
  // the stepper can go back LOOKBACK_DAYS. A client-supplied ?date= is validated
  // + clamped server-side (never trust the client date).
  const todayKey = await currentOperationalDayKey(restaurantId);
  if (!todayKey) {
    return NextResponse.json({ error: "snapshot_failed" }, { status: 500 });
  }
  const minDayKey = shiftKey(todayKey, -LOOKBACK_DAYS);
  const raw = req.nextUrl.searchParams.get("date");
  let dayKey = todayKey;
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    dayKey = raw < minDayKey ? minDayKey : raw > todayKey ? todayKey : raw;
  }

  const [stats, restaurant] = await Promise.all([
    dayKey === todayKey ? buildTodaySnapshot(restaurantId) : buildDayReport(restaurantId, dayKey),
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { defaultLanguage: true, currency: true },
    }),
  ]);
  if (!stats) {
    return NextResponse.json({ error: "snapshot_failed" }, { status: 500 });
  }

  const locale = restaurant?.defaultLanguage || "en";
  // Currency was previously omitted → the printed slip always showed USD. Pass
  // the restaurant's own currency so the print matches the screen. Luigi 2026-06-14.
  const currency = restaurant?.currency || "usd";
  const lines = await buildEndOfDayReceiptLines(stats, paperWidth, locale, currency);

  return NextResponse.json({
    ok: true,
    type: "end_of_day",
    width: paperWidth === "58mm" ? 58 : 80,
    stats,
    lines,
    dayKey,
    todayKey,
    minDayKey,
  });
}
