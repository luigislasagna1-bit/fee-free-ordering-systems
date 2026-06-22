/**
 * GET /api/kitchen/print-job-token?token=<fcmToken>&orderId=<id>
 *
 * Token-authed print fetch for the NATIVE background-print service, which runs in
 * KitchenKeepAliveService while the kitchen app is CLOSED and has no session
 * cookie — only the device push token (the same token it polls
 * /api/kitchen/alarm-state with).
 *
 * It ATOMICALLY CLAIMS Order.kitchenPrintedAt before returning anything, so a
 * ticket prints exactly once across the background service, the app-open web
 * print, app restarts, and multiple devices. If the claim is lost (already
 * printed by another path), returns { ok:false, alreadyPrinted:true } and the
 * service skips it.
 *
 * On a won claim, returns every receipt the restaurant wants for this order —
 * kitchen ticket (if printKitchen) + customer receipt (if printCustomer) — as
 * structured `lines` for the StarXpand bitmap renderer, with copy counts.
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { buildOrderReceiptPayload } from "@/lib/kitchen-receipt-payload";
import { withDbRetry } from "@/lib/db-retry";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token")?.trim();
  const orderId = url.searchParams.get("orderId")?.trim();
  if (!token || !orderId) {
    return NextResponse.json({ ok: false, error: "token + orderId required" }, { status: 400 });
  }

  const device = await withDbRetry(() =>
    prisma.kitchenPushToken.findUnique({ where: { token }, select: { restaurantId: true } }),
  );
  if (!device) return NextResponse.json({ ok: false, error: "Unknown device" }, { status: 401 });
  const restaurantId = device.restaurantId;

  // The background service calls ?release=1 when a print FAILED (printer off /
  // unreachable) so the order is un-claimed and a later poll re-attempts. Bounded
  // by the 15-min print-list window, so a persistently-off printer eventually
  // stops retrying. Luigi 2026-06-22.
  if (url.searchParams.get("release") === "1") {
    await withDbRetry(() =>
      prisma.order.updateMany({ where: { id: orderId, restaurantId }, data: { kitchenPrintedAt: null } }),
    );
    return NextResponse.json({ ok: true, released: true });
  }

  // Atomic claim — only the FIRST caller (this service vs the web app vs another
  // device) wins; everyone else gets alreadyPrinted and skips. Scoped to an
  // accepted, released, not-yet-printed order in this restaurant.
  const claim = await withDbRetry(() =>
    prisma.order.updateMany({
      where: { id: orderId, restaurantId, status: "accepted", notifiedAt: { not: null }, kitchenPrintedAt: null },
      data: { kitchenPrintedAt: new Date() },
    }),
  );
  if (claim.count === 0) return NextResponse.json({ ok: false, alreadyPrinted: true });

  const settings = await withDbRetry(() =>
    prisma.printerSettings.findUnique({
      where: { restaurantId },
      select: { printKitchen: true, printCustomer: true, kitchenCopies: true, customerCopies: true, paperWidth: true },
    }),
  );
  const paperWidth: "58mm" | "80mm" = settings?.paperWidth === "58mm" ? "58mm" : "80mm";
  const wantKitchen = settings?.printKitchen ?? true;
  const wantCustomer = settings?.printCustomer ?? true;
  const clampCopies = (n: number | null | undefined) => Math.max(1, Math.min(5, Number(n) || 1));

  const jobs: Array<{ type: "kitchen" | "customer"; copies: number; lines: any[] }> = [];
  try {
    if (wantKitchen) {
      const k = await buildOrderReceiptPayload({ orderId, restaurantId, type: "kitchen", paperWidth });
      if (k.ok) jobs.push({ type: "kitchen", copies: clampCopies(settings?.kitchenCopies), lines: k.lines });
    }
    if (wantCustomer) {
      const c = await buildOrderReceiptPayload({ orderId, restaurantId, type: "customer", paperWidth });
      if (c.ok) jobs.push({ type: "customer", copies: clampCopies(settings?.customerCopies), lines: c.lines });
    }
  } catch {
    // Build failed AFTER claiming — release the claim so a later poll re-attempts.
    await prisma.order.updateMany({ where: { id: orderId, restaurantId }, data: { kitchenPrintedAt: null } }).catch(() => {});
    return NextResponse.json({ ok: false, error: "build failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, orderId, width: paperWidth === "58mm" ? 58 : 80, jobs });
}
