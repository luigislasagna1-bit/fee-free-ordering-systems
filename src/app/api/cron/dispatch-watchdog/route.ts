/**
 * Dispatch watchdog — the "never again" layer behind the auto-accept ShipDay
 * outage (fixed cf88e72e, 2026-08-10: auto-accepted orders bypassed the ONE
 * dispatch trigger — the kitchen Accept PATCH — and silently never reached
 * ShipDay for 3 days. Luigi: "it needs to never happen again").
 *
 * Every 10 minutes (vercel.json), find PAID delivery orders in a live status
 * that no courier ever saw — no shipdayOrderId AND no FeeFree
 * DeliveryAssignment — at restaurants that actually dispatch (ShipDay or
 * FeeFree config enabled), and push each through the same
 * dispatchAcceptedOrderSafe() wrapper the primary triggers use. Whatever
 * future bug forgets to dispatch, the worst case becomes "courier ~10-20
 * minutes late + a loud log", never "silently never".
 *
 * Why this can't misfire:
 *  - 10-minute grace (createdAt <= now-10min) so the primary triggers always
 *    get first shot; 48h floor keeps the scan bounded and prunes ancient rows.
 *  - paymentStatus "paid" only — matches the prepaid-only courier rule; both
 *    card-captured and fully-credit-covered orders land on "paid".
 *  - dispatchAcceptedOrderSafe carries every guard (already-dispatched,
 *    prepaid, provider resolution, FeeFree autoSend manual_hold) — a repeat
 *    visit skips harmlessly, so e.g. FeeFree manual-hold restaurants show up
 *    as candidates every run and are quietly skipped, never double-queued.
 *  - "RESCUED" is logged ONLY when the re-read shows a dispatch actually
 *    happened — that line means a primary trigger failed and must be
 *    investigated, not that the watchdog is chatty.
 *
 * Scale seam: at current volume (single-digit dispatching restaurants) the
 * narrow createdAt window + take cap needs no index. If delivery volume
 * grows, add a partial index on Order(createdAt) WHERE type='delivery' AND
 * "shipdayOrderId" IS NULL.
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { dispatchAcceptedOrderSafe } from "@/lib/delivery-dispatch";

const GRACE_MS = 10 * 60_000;
const WINDOW_MS = 48 * 3600_000;
const MAX_ROWS = 50;

export const maxDuration = 55;

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET;
  const isCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`;
  if (!isCron) {
    const user = await getSessionUser();
    if (user?.role !== "superadmin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = Date.now();
  const candidates = await prisma.order.findMany({
    where: {
      type: "delivery",
      status: { in: ["accepted", "preparing", "ready"] },
      paymentStatus: "paid",
      shipdayOrderId: null,
      deliveryAssignment: { is: null },
      createdAt: { gte: new Date(now - WINDOW_MS), lte: new Date(now - GRACE_MS) },
      restaurant: {
        OR: [
          { shipdayConfig: { is: { enabled: true } } },
          { feefreeDeliveryConfig: { is: { enabled: true } } },
        ],
      },
    },
    orderBy: { createdAt: "asc" },
    take: MAX_ROWS,
    select: { id: true, orderNumber: true },
  });

  let rescued = 0;
  let skipped = 0;
  for (const o of candidates) {
    await dispatchAcceptedOrderSafe(o.id);
    const after = await prisma.order.findUnique({
      where: { id: o.id },
      select: { shipdayOrderId: true, deliveryAssignment: { select: { id: true } } },
    });
    if (after?.shipdayOrderId || after?.deliveryAssignment) {
      rescued++;
      console.error(`[dispatch-watchdog] RESCUED ${o.orderNumber} — a primary dispatch trigger missed it; investigate`);
    } else {
      // Guard-skipped (manual hold / provider says no / ShipDay rejected —
      // the wrapper already logged and, for rejections, paged staff).
      skipped++;
    }
  }

  console.log(`[dispatch-watchdog] candidates=${candidates.length} rescued=${rescued} skipped=${skipped}`);
  return NextResponse.json({ candidates: candidates.length, rescued, skipped });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
