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
import { weekStartUtc, weekEndUtc } from "@/lib/feefree-delivery";
import { ASSIGNMENT_LIVE } from "@/lib/driver-assignment";

/** Next Monday 00:10 UTC — when the weekly settlement cron charges the card. */
function nextChargeDate(now: Date): Date {
  const start = weekStartUtc(now);
  const nextMon = weekEndUtc(start); // next Monday 00:00
  nextMon.setUTCMinutes(10);
  return nextMon;
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
  /** Count of deliveries completed in the current Monday→Monday billing week. */
  deliveredThisWeek: number;
  /** When the weekly settlement cron next charges the card (next Monday 00:10 UTC). */
  charge: Date;
  /** Delivery orders held for manual dispatch (autoSend off), already narrowed to prepaid. */
  held: FeeFreeDeliveryOpsHeld[];
  /** Live (non-terminal) deliveries with their assigned driver + order, ≤50. */
  active: FeeFreeDeliveryOpsActive[];
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
  const weekStart = weekStartUtc(now);
  const weekEnd = weekEndUtc(now);

  const [owedAgg, deliveredThisWeek, active, heldOrders, rest] = await Promise.all([
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
      take: 50,
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
      take: 25,
      select: { id: true, orderNumber: true, customerName: true, paymentStatus: true, total: true, creditApplied: true },
    }),
    // The store's own coordinates — for the restaurant→customer distance shown
    // on each active delivery (Luigi 2026-07-15).
    prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { lat: true, lng: true } }),
  ]);

  const owed = owedAgg._sum.platformFeeCents ?? 0;
  const charge = nextChargeDate(now);
  // Only surface holds that would actually dispatch (prepaid).
  const held = heldOrders.filter((o) => o.paymentStatus === "paid" || o.total - (o.creditApplied ?? 0) <= 0.009);

  return { owed, deliveredThisWeek, charge, held, active, rest };
}
