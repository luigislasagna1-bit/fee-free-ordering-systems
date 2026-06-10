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

    // ── Simple-mode END-OF-DAY roll ─────────────────────────────────────
    // An order is NEVER auto-completed just because its prep / ready time
    // elapsed. Staff complete each order MANUALLY (the kitchen taps Mark
    // Complete, which also stamps manuallyClearedAt and moves it straight to
    // the Complete tab). An order the kitchen never gets to stays "accepted"
    // and actionable in In Progress for the rest of the day. Luigi 2026-06-08:
    // "just because its ready time passes, doesnt mean it should be marked
    // complete" + "it should stay in in progress until the day is over".
    //
    // The ONLY automatic transition is the day rolling over: once an order's
    // due time (estimatedReady — for scheduled orders this equals the chosen
    // slot) falls before the START OF TODAY in the restaurant's timezone, it
    // belonged to a previous day, so it's swept to "completed" so it leaves In
    // Progress and lands in Complete. Today's due-but-unfinished orders, and
    // future-scheduled orders (estimatedReady still ahead), are left untouched.
    //
    // Tracking-mode restaurants are skipped entirely: their staff manually
    // flip status through Preparing → Ready → Complete, and silently
    // auto-completing those would suppress the per-stage customer notifications.
    if (resolvedMode === "simple") {
      const now = new Date();
      await prisma.order.updateMany({
        where: {
          restaurantId,
          // Simple mode reaches "ready" only via the manual "Mark Ready" action
          // (which already sets manuallyClearedAt); included for completeness.
          status: { in: ["accepted", "ready"] },
          OR: [
            // Due on a previous day → roll it.
            { estimatedReady: { not: null, lt: startOfToday } },
            // No due time recorded → fall back to the order's own day so a
            // prior-day order can never get stranded between tabs.
            { estimatedReady: null, createdAt: { lt: startOfToday } },
          ],
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
          select: { id: true, orderId: true, partySize: true, date: true, time: true, confirmationCode: true, status: true },
        })
      : [];
    const bookingByOrderId = new Map(bookings.map((b) => [b.orderId as string, b]));

    // ── First-order flag (reseller report cmq3knaqj, FABRIZIO) ──────────────
    // Badge an order when it's the customer's FIRST-EVER order at this
    // restaurant, recognising the customer by PHONE *or* EMAIL (Luigi 2026-06-09)
    // — so a returning guest is matched on either identifier. Two groupBys find
    // each phone's + each email's earliest order; an order is "first" only when
    // its createdAt equals the earliest across BOTH identifiers. O(1) queries
    // regardless of feed size.
    const phones = Array.from(
      new Set(orders.map((o) => (o as any).customerPhone).filter((p: unknown): p is string => !!p)),
    );
    const emails = Array.from(
      new Set(orders.map((o) => (o as any).customerEmail).filter((e: unknown): e is string => !!e)),
    );
    const firstAtByPhone = new Map<string, number>();
    const firstAtByEmail = new Map<string, number>();
    // Fulfillment-aware "first order" (Luigi 2026-06-10): a cancelled / rejected /
    // MISSED (auto-rejected) prior order must NOT count, so the badge agrees with
    // the first-buy special + coupon ledger — all of which judge "new customer"
    // by FULFILLED orders only. Without this filter a customer whose first order
    // was cancelled correctly got the welcome discount but the kitchen tile never
    // showed the ⭐ FIRST ORDER badge. Same exclusion set as
    // FAILED_ORDER_STATES in /api/orders + apply-promos. Keep these in sync.
    const FAILED_ORDER_STATES = ["cancelled", "rejected"];
    if (phones.length > 0) {
      const g = await prisma.order.groupBy({
        by: ["customerPhone"],
        where: { restaurantId, customerPhone: { in: phones }, status: { notIn: FAILED_ORDER_STATES } },
        _min: { createdAt: true },
      });
      for (const row of g) {
        if (row.customerPhone && row._min.createdAt) firstAtByPhone.set(row.customerPhone, row._min.createdAt.getTime());
      }
    }
    if (emails.length > 0) {
      const g = await prisma.order.groupBy({
        by: ["customerEmail"],
        where: { restaurantId, customerEmail: { in: emails }, status: { notIn: FAILED_ORDER_STATES } },
        _min: { createdAt: true },
      });
      for (const row of g) {
        if (row.customerEmail && row._min.createdAt) firstAtByEmail.set(row.customerEmail, row._min.createdAt.getTime());
      }
    }

    const ordersWithReservation = orders.map((o) => {
      const b = bookingByOrderId.get(o.id);
      const phone = (o as any).customerPhone as string | null;
      const email = (o as any).customerEmail as string | null;
      // Earliest order time across this customer's phone AND email histories.
      const candidates = [
        phone ? firstAtByPhone.get(phone) : undefined,
        email ? firstAtByEmail.get(email) : undefined,
      ].filter((n): n is number => typeof n === "number");
      const earliest = candidates.length ? Math.min(...candidates) : undefined;
      const isFirstOrder =
        earliest !== undefined && earliest === new Date(o.createdAt).getTime();
      return {
        ...o,
        isFirstOrder,
        reservation: b
          ? { id: b.id, partySize: b.partySize, date: b.date, time: b.time, confirmationCode: b.confirmationCode, status: b.status }
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
