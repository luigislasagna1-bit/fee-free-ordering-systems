import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { parseLocalDateTimeInTz, dateKeyInTimezone } from "@/lib/restaurant-hours";

export async function GET() {
  try {
    // Kitchen polling — must accept BOTH the kitchen session (tablet /
    // native app) AND the admin session (when an owner opens /kitchen
    // in the same browser tab as /admin). Using getServerSession with
    // admin authOptions only recognized admin sessions, so the native
    // app's poll silently failed with 401 and new orders never showed
    // up — caught during UAT, see task #92 for the matching bug fix on
    // /api/kitchen/test-order.
    const user = await getSessionUser({ preferKitchen: true });
    const role = user?.role;
    if (!user || !["restaurant_admin", "kitchen_staff", "superadmin"].includes(role ?? "")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const restaurantId = user.restaurantId;
    if (!restaurantId) return NextResponse.json({ error: "No restaurant associated" }, { status: 400 });

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Fetch restaurant config FIRST — the workflow mode drives the
    // simple-mode auto-complete sweep below.
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { kitchenWorkflowMode: true, printNodeEnabled: true, timezone: true },
    });
    const resolvedMode = restaurant?.kitchenWorkflowMode === "tracking" ? "tracking" : "simple";

    // Start of TODAY in the restaurant's timezone. Used below so an order that
    // belongs in the In Progress tab (today's work) is NEVER dropped from the
    // feed, even if it has been cleared from BOTH the All and Complete tabs.
    // Without this, a today order that picked up both per-tab clear flags
    // vanished from In Progress too — Luigi 2026-06-08 (recurring). Only
    // fully-cleared orders from a PRIOR day are retired from the payload.
    const tz = restaurant?.timezone ?? undefined;
    const startOfToday = parseLocalDateTimeInTz(dateKeyInTimezone(new Date(), tz ?? "UTC"), 0, 0, tz);

    // ── Simple-mode auto-complete sweep ─────────────────────────────────
    // Simple workflow has no state transitions during prep — orders sit
    // in "accepted" forever after the kitchen taps Accept. Without this,
    // the display piles up stale rows the kitchen has to scroll past.
    //
    // Sweep: when the kitchen polls (every 4s), flip any of THIS
    // restaurant's "accepted" simple-mode orders whose estimatedReady
    // is more than 15 minutes in the past to "completed". Lazy-on-read
    // pattern — no new cron needed.
    //
    // Tracking-mode restaurants are skipped entirely: their staff
    // manually flip status through Preparing → Ready → Complete,
    // and silently auto-completing those would suppress the customer
    // notifications they expect at each stage.
    if (resolvedMode === "simple") {
      const cutoff = new Date(Date.now() - 15 * 60 * 1000);
      const now = new Date();
      await prisma.order.updateMany({
        where: {
          restaurantId,
          // Also sweep manually-readied orders (Simple mode "Mark Ready" sets
          // status=ready) so they land in reports by end of day. Simple mode
          // only ever reaches "ready" via that manual action.
          status: { in: ["accepted", "ready"] },
          estimatedReady: { not: null, lt: cutoff },
        },
        data: { status: "completed", completedAt: now },
      });
    }

    const orders = await prisma.order.findMany({
      where: {
        restaurantId,
        createdAt: { gte: thirtyDaysAgo },
        // Only show orders that have been "released" — for cash orders
        // that's immediately, for online-card orders that's once Stripe
        // confirms payment via webhook (payment_intent.succeeded).
        // Filters out pending-payment cards so the kitchen never starts
        // cooking food that hasn't been paid for.
        notifiedAt: { not: null },
        // Legacy global clear (orders cleared before the per-tab model).
        clearedFromKitchenAt: null,
        // PER-TAB clear (Luigi 2026-06-04). Each kitchen tab clears
        // independently, so we only DROP an order from the feed entirely
        // once it's been cleared from BOTH clearable tabs (All + Complete)
        // AND it's from a PRIOR day. TODAY's orders are always returned even
        // when cleared from both, because the In Progress tab pins today's work
        // until midnight and must never lose a row to a clear on another tab
        // (Luigi 2026-06-08 — this recurred). The client still filters each tab
        // by its own flag, so a fully-cleared today order is correctly hidden
        // from All + Complete but stays in In Progress.
        NOT: {
          clearedFromAllAt: { not: null },
          clearedFromCompleteAt: { not: null },
          createdAt: { lt: startOfToday },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
      include: {
        items: {
          include: { modifiers: { select: { name: true, priceAdjustment: true } } },
        },
      },
    });

    // ── Reserve-then-order: attach the linked table booking ─────────────────
    // A pre-order order carries a Reservation (Reservation.orderId). Attach its
    // party size + date/time + code so the kitchen can flag the order tile +
    // ticket as "TABLE RESERVATION + PRE-ORDER" and treat it as one unit. One
    // query for the whole page; null for every normal order. Luigi 2026-06-08.
    const orderIds = orders.map((o) => o.id);
    const bookings = orderIds.length > 0
      ? await prisma.reservation.findMany({
          where: { orderId: { in: orderIds } },
          select: { orderId: true, partySize: true, date: true, time: true, confirmationCode: true, status: true },
        })
      : [];
    const bookingByOrderId = new Map(bookings.map((b) => [b.orderId as string, b]));
    const ordersWithReservation = orders.map((o) => {
      const b = bookingByOrderId.get(o.id);
      return {
        ...o,
        reservation: b
          ? { partySize: b.partySize, date: b.date, time: b.time, confirmationCode: b.confirmationCode, status: b.status }
          : null,
      };
    });

    // (restaurant + mode already fetched above for the sweep.)
    return NextResponse.json({
      orders: ordersWithReservation,
      kitchenWorkflowMode: resolvedMode,
      // Surface whether PrintNode backup is enabled so the kitchen UI
      // can hide the PrintNode setup option entirely when the admin
      // has not turned it on. Default false — Direct LAN printer is
      // the main path; PrintNode is opt-in backup only.
      printNodeEnabled: !!restaurant?.printNodeEnabled,
    });
  } catch (err: any) {
    console.error("[kitchen/orders GET]", err);
    return NextResponse.json({ error: err.message ?? "Failed to load orders" }, { status: 500 });
  }
}
