/**
 * GET /api/kitchen/print-job/reservation/[id]
 *
 * Parallel to /api/kitchen/print-job/[orderId] but for reservation
 * receipts. Returns {bytes, lines} so the native Capacitor app can
 * print reservations the same way it prints orders:
 *
 *   - `bytes`  base64-encoded ESC/POS — raw TCP printing on
 *              Epson / Bixolon / Citizen and other ESC/POS-over-9100
 *              printers.
 *   - `lines`  structured ReceiptLine[] — Star printers via the
 *              StarXpand bitmap renderer on Android (raw ESC/POS
 *              gets silently discarded by Star TSP firmware, hence
 *              the parallel format).
 *
 * Both formats render the SAME reservation receipt produced by
 * `buildReservationReceipt` / `buildReservationReceiptLines` in
 * src/lib/receipt.ts and src/lib/receipt-lines.ts — confirmation
 * code, party size, date, time, table assignment if any, deposit /
 * pre-order totals.
 *
 * Auth: kitchen session, scoped to the kitchen's restaurant —
 * caller can't print other restaurants' bookings by guessing IDs.
 *
 * Query params:
 *   width — "58" or "80" (paper width in mm). Default 80.
 *
 * Luigi 2026-06-01: closes the direct-LAN reservation print gap so
 * reservations have full parity with orders — same print options,
 * same setup method, same direct + PrintNode dual-path coverage.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { kitchenAuthOptions } from "@/lib/auth-kitchen";
import prisma from "@/lib/db";
import { buildReservationReceipt } from "@/lib/receipt";
import { buildReservationReceiptLines } from "@/lib/receipt-lines";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(kitchenAuthOptions);
  const restaurantId = (session?.user as any)?.restaurantId as string | undefined;
  if (!restaurantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const paperWidth = req.nextUrl.searchParams.get("width") === "58" ? "58mm" : "80mm";

  const reservation = await prisma.reservation.findFirst({
    where: { id, restaurantId },
    include: {
      table: { select: { name: true } },
      restaurant: { select: { name: true, defaultLanguage: true } },
    },
  });

  if (!reservation) {
    return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
  }

  const data = {
    restaurantName: reservation.restaurant.name,
    confirmationCode: reservation.confirmationCode,
    customerName: reservation.customerName,
    customerPhone: reservation.customerPhone,
    customerEmail: reservation.customerEmail,
    partySize: reservation.partySize,
    date: reservation.date,
    time: reservation.time,
    tableName: reservation.table?.name ?? null,
    notes: reservation.notes,
    depositAmount: reservation.depositAmount,
    depositPaid: reservation.depositPaid,
    preOrderTotal: reservation.preOrderTotal,
    status: reservation.status,
    createdAt: new Date(),
  };
  const locale = reservation.restaurant.defaultLanguage || "en";

  // Build BOTH formats from the same source data.
  const bytesBuf = await buildReservationReceipt(data, paperWidth, "starprnt", locale);
  const lines = await buildReservationReceiptLines(data, paperWidth, locale);

  return NextResponse.json({
    ok: true,
    reservationId: reservation.id,
    width: paperWidth === "58mm" ? 58 : 80,
    type: "reservation",
    bytes: bytesBuf.toString("base64"),
    lines,
  });
}
