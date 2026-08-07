import "server-only";
import prisma from "@/lib/db";
import { scopeRestaurantFilter, type OrdersScope } from "./scope";

/**
 * The unified cross-restaurant feed behind the partner / superadmin Orders List.
 *
 * ⚠️ This deliberately does NOT use `reportOrderWhere` (src/lib/reports/order-filter.ts).
 * That predicate excludes `rejected` + `cancelled` because the money reports must
 * never count them — but this screen exists precisely so a partner can see
 * "accepted / missed / cancelled at a glance" (Fabrizio, report cmshrr94z001d04l7x8kpet3z).
 * We keep its OTHER half: `TEST-` orders stay hidden.
 *
 * Orders and reservations are merged into one list sorted by `createdAt` — which
 * is exactly GloriaFood's "Placed at" column. The booking's own date/time is a
 * separate "Fulfilment time" column, so there's no conflict.
 */

// ── Vocabularies (mirrors GloriaFood's own filter sets) ──────────────────────
export const FEED_STATUSES = [
  "pending", "accepted", "completed", "missed", "rejected", "cancelled", "seated", "no_show",
] as const;
export type FeedStatus = (typeof FEED_STATUSES)[number];

export const FEED_TYPES = [
  "delivery", "pickup", "on_premise", "catering", "table_reservation", "reservation_preorder",
] as const;
export type FeedType = (typeof FEED_TYPES)[number];

/** Order.type values that roll up into the "On premise" bucket. */
const ON_PREMISE_TYPES = ["dine_in", "take_out"];

/** Merged-feed guard: the deepest page we'll scan across both tables before
 *  asking the user to narrow the range instead of silently getting slower. */
export const MERGE_SCAN_CAP = 2000;

export type FeedRow = {
  kind: "order" | "reservation";
  id: string;
  /** "#1234" for orders, the confirmation code for reservations. */
  ref: string;
  placedAt: Date;
  status: FeedStatus;
  type: FeedType;
  customerName: string;
  /** null when the row carries no money (a plain table booking). */
  total: number | null;
  currency: string;
  paymentMethod: string | null;
  /** Orders: scheduledFor ?? estimatedReady. */
  fulfilmentAt: Date | null;
  /** Reservations: restaurant-local booking slot, as stored. */
  reservationDate: string | null;
  reservationTime: string | null;
  restaurant: { id: string; name: string; companyName: string; address: string; timezone: string | null };
};

export type FeedQuery = {
  scope: OrdersScope;
  range: { from: Date; to: Date };
  q?: string;
  status?: FeedStatus | null;
  types?: FeedType[] | null;
  restaurantId?: string | null;
  page: number;
  size: number;
  /** Export only: take `size` as an explicit row cap and skip the merge-depth
   *  guard (the export is a single bounded pass, not interactive paging). */
  noCap?: boolean;
};

export type FeedResult = {
  rows: FeedRow[];
  total: number;
  pageCount: number;
  /** True when the requested page is past the merge guard — the UI asks the
   *  user to narrow the date range rather than degrading silently. */
  depthCapped: boolean;
  counts: Record<FeedStatus, number> & { all: number };
};

// ── Status derivation ────────────────────────────────────────────────────────

/**
 * "Missed" is not a stored status — it's an order/booking the kitchen never
 * answered and that was auto-rejected. Two markers exist and BOTH must be
 * honoured (verified against production, 2026-08-07):
 *   • `cancelledBy = "auto"`         — written by the auto-reject cron
 *   • `rejectionReason` LIKE "Auto-rejected%" — the marker the kitchen's own
 *     client-side instant-reject writes, and the one `notifications.ts`
 *     already keys its "missed" customer email off.
 * In practice the rejectionReason marker is the common one (prod has ZERO rows
 * with cancelledBy="auto"), so keying only on cancelledBy would have made this
 * bucket permanently empty.
 */
export function isAutoRejected(cancelledBy: string | null, rejectionReason: string | null): boolean {
  return cancelledBy === "auto" || (rejectionReason?.startsWith("Auto-rejected") ?? false);
}

export function deriveStatus(
  raw: string,
  cancelledBy: string | null,
  rejectionReason: string | null,
  kind: "order" | "reservation",
): FeedStatus {
  switch (raw) {
    case "pending": return "pending";
    case "accepted":
    case "preparing":
    case "ready": return "accepted";
    case "confirmed": return "accepted"; // reservation equivalent of accepted
    case "completed": return "completed";
    case "cancelled": return "cancelled";
    case "seated": return kind === "reservation" ? "seated" : "accepted";
    case "no_show": return "no_show";
    case "rejected": return isAutoRejected(cancelledBy, rejectionReason) ? "missed" : "rejected";
    default: return "pending";
  }
}

/** SQL form of isAutoRejected — kept next to it so the two can't drift. */
const AUTO_REJECTED_OR = [
  { cancelledBy: "auto" },
  { rejectionReason: { startsWith: "Auto-rejected" } },
];

/** Raw status/cancelledBy conditions for a unified status — the inverse of
 *  deriveStatus, used to push the filter down into SQL. */
function statusWhere(status: FeedStatus, kind: "order" | "reservation"): Record<string, unknown> | null {
  switch (status) {
    case "pending": return { status: "pending" };
    case "accepted":
      return kind === "order"
        ? { status: { in: ["accepted", "preparing", "ready"] } }
        : { status: { in: ["confirmed", "accepted"] } };
    case "completed": return { status: "completed" };
    case "cancelled": return { status: "cancelled" };
    case "missed": return { status: "rejected", OR: AUTO_REJECTED_OR };
    case "rejected":
      // NULL-safe inverse of AUTO_REJECTED_OR. Written as explicit null branches
      // rather than a bare NOT, because `NOT (col = x)` drops NULL rows in SQL —
      // and a manual reject usually has BOTH columns null.
      return {
        status: "rejected",
        AND: [
          { OR: [{ cancelledBy: null }, { cancelledBy: { not: "auto" } }] },
          { OR: [{ rejectionReason: null }, { NOT: { rejectionReason: { startsWith: "Auto-rejected" } } }] },
        ],
      };
    case "seated": return kind === "reservation" ? { status: "seated" } : null;
    case "no_show": return kind === "reservation" ? { status: "no_show" } : null;
    default: return null;
  }
}

// ── Type routing ─────────────────────────────────────────────────────────────

/** Which tables a type filter needs. Selecting only order-types (or only
 *  reservation-types) unlocks the FAST PATH: a single indexed query with real
 *  skip/take, no merging. */
function splitTypes(types: FeedType[] | null | undefined): {
  orderTypes: string[] | null; // null = all order types
  wantOrders: boolean;
  wantReservations: boolean;
  reservationPreorder: boolean | null; // true = only w/ pre-order, false = only plain, null = both
} {
  if (!types || types.length === 0) {
    return { orderTypes: null, wantOrders: true, wantReservations: true, reservationPreorder: null };
  }
  const orderTypes: string[] = [];
  if (types.includes("delivery")) orderTypes.push("delivery");
  if (types.includes("pickup")) orderTypes.push("pickup");
  if (types.includes("on_premise")) orderTypes.push(...ON_PREMISE_TYPES);
  if (types.includes("catering")) orderTypes.push("catering");

  const plain = types.includes("table_reservation");
  const preorder = types.includes("reservation_preorder");
  return {
    orderTypes: orderTypes.length > 0 ? orderTypes : null,
    wantOrders: orderTypes.length > 0,
    wantReservations: plain || preorder,
    reservationPreorder: plain && preorder ? null : preorder ? true : plain ? false : null,
  };
}

export function orderType(raw: string): FeedType {
  if (raw === "delivery") return "delivery";
  if (raw === "pickup") return "pickup";
  if (raw === "catering") return "catering";
  return "on_premise";
}

// ── WHERE builders ───────────────────────────────────────────────────────────

function orderWhere(qy: FeedQuery, split: ReturnType<typeof splitTypes>): Record<string, unknown> {
  const AND: Record<string, unknown>[] = [
    {
      restaurant: scopeRestaurantFilter(qy.scope, qy.restaurantId),
      createdAt: { gte: qy.range.from, lte: qy.range.to },
      // Keep reportOrderWhere's test-order exclusion; drop its status exclusion.
      orderNumber: { not: { startsWith: "TEST-" } },
    },
  ];
  if (split.orderTypes) AND.push({ type: { in: split.orderTypes } });
  if (qy.status) {
    const w = statusWhere(qy.status, "order");
    if (!w) return { AND: [{ id: "__never__" }] }; // reservation-only status ⇒ no orders
    AND.push(w);
  }
  if (qy.q) {
    AND.push({
      OR: [
        { customerName: { contains: qy.q, mode: "insensitive" as const } },
        { customerEmail: { contains: qy.q, mode: "insensitive" as const } },
        { customerPhone: { contains: qy.q } },
        { orderNumber: { contains: qy.q } },
      ],
    });
  }
  return { AND };
}

function reservationWhere(qy: FeedQuery, split: ReturnType<typeof splitTypes>): Record<string, unknown> {
  const AND: Record<string, unknown>[] = [
    {
      restaurant: scopeRestaurantFilter(qy.scope, qy.restaurantId),
      createdAt: { gte: qy.range.from, lte: qy.range.to },
    },
  ];
  if (split.reservationPreorder === true) AND.push({ orderId: { not: null } });
  if (split.reservationPreorder === false) AND.push({ orderId: null });
  if (qy.status) {
    const w = statusWhere(qy.status, "reservation");
    if (!w) return { AND: [{ id: "__never__" }] };
    AND.push(w);
  }
  if (qy.q) {
    AND.push({
      OR: [
        { customerName: { contains: qy.q, mode: "insensitive" as const } },
        { customerEmail: { contains: qy.q, mode: "insensitive" as const } },
        { customerPhone: { contains: qy.q } },
        { confirmationCode: { contains: qy.q, mode: "insensitive" as const } },
      ],
    });
  }
  return { AND };
}

const RESTAURANT_SELECT = {
  select: { id: true, name: true, address: true, city: true, currency: true, timezone: true,
            parentRestaurant: { select: { name: true } } },
} as const;

type RestaurantRow = {
  id: string; name: string; address: string | null; city: string | null;
  currency: string; timezone: string | null; parentRestaurant: { name: string } | null;
};

function mapRestaurant(r: RestaurantRow) {
  return {
    id: r.id,
    name: r.name,
    companyName: r.parentRestaurant?.name ?? r.name,
    address: [r.address, r.city].filter(Boolean).join(" , "),
    timezone: r.timezone ?? null,
  };
}

// ── The feed ─────────────────────────────────────────────────────────────────

export async function fetchOrderFeed(qy: FeedQuery): Promise<FeedResult> {
  const split = splitTypes(qy.types);
  const skip = (qy.page - 1) * qy.size;

  const oWhere = orderWhere(qy, split);
  const rWhere = reservationWhere(qy, split);

  const [orderCount, resCount] = await Promise.all([
    split.wantOrders ? prisma.order.count({ where: oWhere }) : Promise.resolve(0),
    split.wantReservations ? prisma.reservation.count({ where: rWhere }) : Promise.resolve(0),
  ]);
  const total = orderCount + resCount;
  const pageCount = Math.max(1, Math.ceil(total / qy.size));

  // FAST PATH — one table only: real index-backed skip/take at any depth.
  const singleTable = !split.wantOrders || !split.wantReservations;
  const need = skip + qy.size;
  const depthCapped = !singleTable && need > MERGE_SCAN_CAP && !qy.noCap;

  let rows: FeedRow[] = [];
  if (!depthCapped) {
    const take = singleTable ? qy.size : need;
    const useSkip = singleTable ? skip : 0;

    const [orders, reservations] = await Promise.all([
      split.wantOrders
        ? prisma.order.findMany({
            where: oWhere,
            select: {
              id: true, orderNumber: true, status: true, cancelledBy: true, rejectionReason: true, type: true,
              customerName: true, total: true, paymentMethod: true, createdAt: true,
              scheduledFor: true, estimatedReady: true, restaurant: RESTAURANT_SELECT,
            },
            orderBy: [{ createdAt: "desc" }, { id: "asc" }],
            take,
            skip: useSkip,
          })
        : Promise.resolve([]),
      split.wantReservations
        ? prisma.reservation.findMany({
            where: rWhere,
            select: {
              id: true, confirmationCode: true, status: true, cancelledBy: true, rejectionReason: true, orderId: true,
              customerName: true, depositAmount: true, preOrderTotal: true, createdAt: true,
              date: true, time: true, restaurant: RESTAURANT_SELECT,
            },
            orderBy: [{ createdAt: "desc" }, { id: "asc" }],
            take,
            skip: useSkip,
          })
        : Promise.resolve([]),
    ]);

    const orderRows: FeedRow[] = orders.map((o) => ({
      kind: "order" as const,
      id: o.id,
      ref: `#${o.orderNumber}`,
      placedAt: o.createdAt,
      status: deriveStatus(o.status, o.cancelledBy, o.rejectionReason, "order"),
      type: orderType(o.type),
      customerName: o.customerName,
      total: o.total,
      currency: (o.restaurant as RestaurantRow).currency,
      paymentMethod: o.paymentMethod,
      fulfilmentAt: o.scheduledFor ?? o.estimatedReady ?? null,
      reservationDate: null,
      reservationTime: null,
      restaurant: mapRestaurant(o.restaurant as RestaurantRow),
    }));

    const resRows: FeedRow[] = reservations.map((r) => {
      // A booking with a linked order is GloriaFood's "Reservation & Pre-order".
      const money = (r.preOrderTotal ?? 0) > 0 ? r.preOrderTotal : (r.depositAmount ?? 0) > 0 ? r.depositAmount : null;
      return {
        kind: "reservation" as const,
        id: r.id,
        ref: r.confirmationCode,
        placedAt: r.createdAt,
        status: deriveStatus(r.status, r.cancelledBy, r.rejectionReason, "reservation"),
        type: r.orderId ? ("reservation_preorder" as const) : ("table_reservation" as const),
        customerName: r.customerName,
        total: money,
        currency: (r.restaurant as RestaurantRow).currency,
        paymentMethod: null,
        fulfilmentAt: null,
        reservationDate: r.date,
        reservationTime: r.time,
        restaurant: mapRestaurant(r.restaurant as RestaurantRow),
      };
    });

    rows = [...orderRows, ...resRows];
    if (!singleTable) {
      // Merge both streams on the shared sort key, then take this page's slice.
      rows.sort((a, b) => b.placedAt.getTime() - a.placedAt.getTime() || a.id.localeCompare(b.id));
      rows = rows.slice(skip, skip + qy.size);
    } else {
      rows.sort((a, b) => b.placedAt.getTime() - a.placedAt.getTime() || a.id.localeCompare(b.id));
    }
  }

  return { rows, total, pageCount, depthCapped, counts: await statusCounts(qy, split) };
}

/** Per-status counts for the chips ("accepted / missed / cancelled at a glance").
 *  Uses groupBy so it's two queries regardless of how many statuses exist. */
async function statusCounts(
  qy: FeedQuery,
  split: ReturnType<typeof splitTypes>,
): Promise<Record<FeedStatus, number> & { all: number }> {
  // Count across every status — so the chips always show the full picture, even
  // while one status is selected.
  const base: FeedQuery = { ...qy, status: null };
  const oW = orderWhere(base, split);
  const rW = reservationWhere(base, split);
  // We group by `status` ONLY: "missed" is partly keyed off rejectionReason,
  // which is free text and must never be a GROUP BY key. Instead we count the
  // auto-rejected subset separately and split the rejected bucket with it.
  const missedW = { status: "rejected", OR: AUTO_REJECTED_OR };
  const [orderGroups, resGroups, oMissed, rMissed] = await Promise.all([
    split.wantOrders
      ? prisma.order.groupBy({ by: ["status"], where: oW as never, _count: { _all: true } })
      : Promise.resolve([] as Array<{ status: string; _count: { _all: number } }>),
    split.wantReservations
      ? prisma.reservation.groupBy({ by: ["status"], where: rW as never, _count: { _all: true } })
      : Promise.resolve([] as Array<{ status: string; _count: { _all: number } }>),
    split.wantOrders ? prisma.order.count({ where: { AND: [oW, missedW] } as never }) : Promise.resolve(0),
    split.wantReservations ? prisma.reservation.count({ where: { AND: [rW, missedW] } as never }) : Promise.resolve(0),
  ]);

  const counts = Object.fromEntries(FEED_STATUSES.map((s) => [s, 0])) as Record<FeedStatus, number>;
  let all = 0;
  let rejectedTotal = 0;
  const tally = (groups: Array<{ status: string; _count: { _all: number } }>, kind: "order" | "reservation") => {
    for (const g of groups) {
      all += g._count._all;
      if (g.status === "rejected") { rejectedTotal += g._count._all; continue; } // split below
      counts[deriveStatus(g.status, null, null, kind)] += g._count._all;
    }
  };
  tally(orderGroups, "order");
  tally(resGroups, "reservation");

  counts.missed = oMissed + rMissed;
  counts.rejected = Math.max(0, rejectedTotal - counts.missed);
  return { ...counts, all };
}
