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
import { buildTodaySnapshot } from "@/lib/digests";
import { buildEndOfDayReceiptLines } from "@/lib/receipt-lines";

export async function GET(req: NextRequest) {
  const session = await getServerSession(kitchenAuthOptions);
  const restaurantId = (session?.user as any)?.restaurantId as string | undefined;
  if (!restaurantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const paperWidth = req.nextUrl.searchParams.get("width") === "58" ? "58mm" : "80mm";

  const [stats, restaurant] = await Promise.all([
    buildTodaySnapshot(restaurantId),
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { defaultLanguage: true },
    }),
  ]);
  if (!stats) {
    return NextResponse.json({ error: "snapshot_failed" }, { status: 500 });
  }

  const locale = restaurant?.defaultLanguage || "en";
  const lines = await buildEndOfDayReceiptLines(stats, paperWidth, locale);

  return NextResponse.json({
    ok: true,
    type: "end_of_day",
    width: paperWidth === "58mm" ? 58 : 80,
    stats,
    lines,
  });
}
