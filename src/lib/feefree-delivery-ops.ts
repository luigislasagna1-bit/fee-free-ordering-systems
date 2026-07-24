/**
 * Shared source-of-truth for the restaurant-facing FeeFreeDelivery operations
 * panel (v1.1 Phase 6, plan §4.6). The five queries that used to live inlined in
 * `src/app/admin/delivery/pool/FeeFreeDeliveryOps.tsx` (owed this cycle, delivered
 * this week, active deliveries, held-for-manual-dispatch orders, the store's own
 * coordinates) plus the derived owed/held/next-charge values live here so the
 * desktop RSC and the future `/api/admin/feefree-delivery/ops` JSON route render
 * from ONE query definition and can never drift (the desktop/app billing-drift
 * risk, plan §10.7).
 *
 * Query-layer ONLY — this module returns raw numbers/rows and does NOT format
 * money. Formatting is the render's job and the currency split is enforced at the
 * call site (AGENTS.md): the owed/settlement figure is PLATFORM money, so callers
 * render it with PLATFORM_CURRENCY; the hardcoded `usd()` helper in the desktop
 * component is never lifted in here (plan §8, currency split).
 *
 * Scale (AGENTS.md 100→10k target): every query is `select`-only and take-capped
 * (active ≤50, held ≤25), no N+1, no per-row awaits. `held` is filtered in-memory
 * but only over the ≤25 rows the DB already returned — not a load-then-filter of an
 * unbounded set. All predicates are on `DeliveryAssignment` / `Order`
 * (restaurantId-scoped) side tables. Seam for a per-restaurant ~5s micro-cache on
 * the `/ops` payload is noted in plan §5.4.
 */
import prisma from "@/lib/db";
import { deliveryWeekStart, deliveryWeekEnd } from "@/lib/feefree-delivery";
import { ASSIGNMENT_LIVE } from "@/lib/driver-assignment";

/** Close of the current Sat→Fri Toronto week — the next Saturday 00:00, when the
 *  weekly settlement runs (once billing is un-paused). Rendered as the projected
 *  charge date in the ops panel. */
function nextChargeDate(now: Date): Date {
  return deliveryWeekEnd(deliveryWeekStart(now)); // next Saturday 00:00 Toronto
}

export type FeeFreeDeliveryOpsActive = {
  id: string;
  status: string;
  driver: { name: string; ratingPct: number | null } | null;
  order: {
    orderNumber: string;
    customerName: string;
    deliveryLat: number | null;
    deliveryLng: number | null;
  };
};

export type FeeFreeDeliveryOpsHeld = {
  id: string;
  orderNumber: string;
  customerName: string;
  paymentStatus: string;
  total: number;
  creditApplied: number | null;
};

export type FeeFreeDeliveryOpsData = {
  /** Outstanding platform fee this cycle, in CENTS (PLATFORM money — render with PLATFORM_CURRENCY). */
  owed: number;
  /** Count of deliveries completed in the current Saturday→Friday billing week. */
  deliveredThisWeek: number;
  /** Close of the current Sat→Fri Toronto week (next Saturday 00:00) — projected charge date. */
  charge: Date;
  /** Delivery orders held for manual dispatch (autoSend off), already narrowed to prepaid — the first 25 (see heldCapped). */
  held: FeeFreeDeliveryOpsHeld[];
  /** Live (non-terminal) deliveries with their assigned driver + order — the first 50 (see activeCapped). */
  active: FeeFreeDeliveryOpsActive[];
  /** True only when a genuine 51st live delivery exists beyond the 50 in `active`
   *  (over-fetch-by-1 — never fires at exactly 50). */
  activeCapped: boolean;
  /** True only when a genuine 26th prepaid hold exists beyond the 25 in `held`
   *  (over-fetch-by-1, judged post prepaid-filter — never fires at exactly 25). */
  heldCapped: boolean;
  /** The store's own coordinates — for the restaurant→customer distance on each active delivery. */
  rest: { lat: number | null; lng: number | null } | null;
};

/**
 * Load the FeeFreeDelivery ops panel data for one restaurant. `restaurantId` is
 * always derived from the caller's session — never trusted from the client
 * (AGENTS.md). Every row is scoped to it.
 */
export async function getFeeFreeDeliveryOpsData(restaurantId: string): Promise<FeeFreeDeliveryOpsData> {
  const now = new Date();
  const weekStart = deliveryWeekStart(now);
  const weekEnd = deliveryWeekEnd(weekStart); // FIX: was deliveryWeekEnd(now) → up to a 14-day window

  const [owedAgg, deliveredThisWeek, activeRows, heldOrders, rest] = await Promise.all([
    // Outstanding = frozen fees not yet rolled into a settlement.
    prisma.deliveryAssignment.aggregate({
      _sum: { platformFeeCents: true },
      where: { restaurantId, status: "delivered", settlementId: null },
    }),
    prisma.deliveryAssignment.count({
      where: { restaurantId, status: "delivered", deliveredAt: { gte: weekStart, lt: weekEnd } },
    }),
    // Positive live-status list (shared ASSIGNMENT_LIVE, complement of
    // ASSIGNMENT_TERMINAL) — `in` lets Postgres run tight (restaurantId,
    // status) index probes over only the live rows instead of walking the
    // restaurant's whole assignment history the way `notIn` terminal did.
    prisma.deliveryAssignment.findMany({
      where: { restaurantId, status: { in: [...ASSIGNMENT_LIVE] } },
      orderBy: { createdAt: "asc" },
      take: 51, // over-fetch by 1 → cap flag detects a genuine 51st (no exact-50 false "more exist")
      select: {
        id: true, status: true,
        driver: { select: { name: true, ratingPct: true } },
        order: { select: { orderNumber: true, customerName: true, deliveryLat: true, deliveryLng: true } },
      },
    }),
    // Delivery orders in a live status, prepaid-ish, with NO assignment yet
    // (autoSend off holds them here for manual send).
    prisma.order.findMany({
      where: {
        restaurantId,
        type: "delivery",
        status: { in: ["accepted", "preparing", "ready"] },
        deliveryAssignment: null,
      },
      orderBy: { createdAt: "desc" },
      take: 26, // over-fetch by 1 (pre-filter) → cap flag detects a genuine 26th prepaid hold
      select: { id: true, orderNumber: true, customerName: true, paymentStatus: true, total: true, creditApplied: true },
    }),
    // The store's own coordinates — for the restaurant→customer distance shown
    // on each active delivery (Luigi 2026-07-15).
    prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { lat: true, lng: true } }),
  ]);

  const owed = owedAgg._sum.platformFeeCents ?? 0;
  const charge = nextChargeDate(now);

  // Over-fetch-by-1 + slice so a "showing the first N" note fires ONLY when an
  // (N+1)th row genuinely exists. With the old `length >= N` on a take:N query,
  // EXACTLY N rows (no N+1) still read "more exist" — the exact-N off-by-one
  // flagged in the 2026-07-20 review. Now length===N with no N+1 ⇒ not capped.
  const activeCapped = activeRows.length > 50;
  const active = activeRows.slice(0, 50);

  // Held is prepaid-FILTERED, so the cap is judged on the DISPLAYED (post-filter)
  // count from a take:26 scan: >25 prepaid holds ⇒ a real 26th exists → slice to
  // 25 and flag. (The 26-row scan still bounds it, same as before.)
  const heldAll = heldOrders.filter((o) => o.paymentStatus === "paid" || o.total - (o.creditApplied ?? 0) <= 0.009);
  const heldCapped = heldAll.length > 25;
  const held = heldAll.slice(0, 25);

  return {
    owed, deliveredThisWeek, charge, held, active, rest,
    activeCapped, heldCapped,
  };
}
