/**
 * Daily + monthly digest computation.
 *
 * Aggregates yesterday's (or last month's) orders for a single restaurant
 * into the `DigestStats` shape consumed by `sendDailyDigestEmail` /
 * `sendMonthlyDigestEmail`. The "previous period" deltas compare against the
 * same weekday a week ago (for daily) or the same calendar month a year ago
 * (for monthly) — a simple, predictable baseline.
 *
 * Called by the cron handlers at `/api/cron/daily-digest` and
 * `/api/cron/monthly-digest`.
 */

import prisma from "@/lib/db";
import type { DigestStats } from "@/lib/email";
import { parseLocalDateTimeInTz, dateKeyInTimezone } from "@/lib/restaurant-hours";

// ── Local-date key math (DST-safe) ──────────────────────────────────────────
// Windows are computed in the RESTAURANT's local timezone, then projected to
// UTC instants (via parseLocalDateTimeInTz) for comparison against order
// timestamps. This fixes "yesterday in UTC" reports for restaurants far from
// UTC — a Sydney restaurant's "yesterday" is now their local yesterday, not
// the UTC one. (Phase 2b timezone sweep.)

/** Shift a "YYYY-MM-DD" key by N days. Noon-UTC anchor dodges DST edges. */
function addDaysToKey(key: string, delta: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** First-of-month key, shifted by N months, for the month containing `key`. */
function monthFirstKey(key: string, monthDelta = 0): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + monthDelta, 1, 12));
  return d.toISOString().slice(0, 10);
}

/** [start, end) for the previous local day in the restaurant's timezone. */
function dailyWindow(now: Date, tz: string): [Date, Date] {
  const todayKey = dateKeyInTimezone(now, tz);
  return [
    parseLocalDateTimeInTz(addDaysToKey(todayKey, -1), 0, 0, tz),
    parseLocalDateTimeInTz(todayKey, 0, 0, tz),
  ];
}

/** Same one-day window a week earlier — daily-comparison baseline. */
function priorDailyWindow(now: Date, tz: string): [Date, Date] {
  const todayKey = dateKeyInTimezone(now, tz);
  return [
    parseLocalDateTimeInTz(addDaysToKey(todayKey, -8), 0, 0, tz),
    parseLocalDateTimeInTz(addDaysToKey(todayKey, -7), 0, 0, tz),
  ];
}

/** [startOfLastMonth, startOfThisMonth) in the restaurant's timezone. */
function monthlyWindow(now: Date, tz: string): [Date, Date] {
  const todayKey = dateKeyInTimezone(now, tz);
  return [
    parseLocalDateTimeInTz(monthFirstKey(todayKey, -1), 0, 0, tz),
    parseLocalDateTimeInTz(monthFirstKey(todayKey, 0), 0, 0, tz),
  ];
}

function priorMonthlyWindow(now: Date, tz: string): [Date, Date] {
  const todayKey = dateKeyInTimezone(now, tz);
  return [
    parseLocalDateTimeInTz(monthFirstKey(todayKey, -13), 0, 0, tz),
    parseLocalDateTimeInTz(monthFirstKey(todayKey, -12), 0, 0, tz),
  ];
}

function pct(current: number, prior: number): number {
  if (!prior) return 0;
  return ((current - prior) / prior) * 100;
}

/** Core aggregator. Pulls every order in the window for one restaurant and
 *  rolls it into a single stats row. Excludes rejected/cancelled orders so
 *  the numbers match what the owner actually earned. */
async function aggregate(restaurantId: string, start: Date, end: Date) {
  const orders = await prisma.order.findMany({
    where: {
      restaurantId,
      createdAt: { gte: start, lt: end },
      status: { notIn: ["rejected", "cancelled"] },
      // Exclude kitchen "Test Order" rows (orderNumber "TEST-…") so a
      // restaurant's real takings aren't inflated in the EOD/EOM/today
      // figures. Luigi 2026-06-11 (reseller report: test orders must never
      // hit reports, or end-of-day bookkeeping won't reconcile).
      orderNumber: { not: { startsWith: "TEST-" } },
    },
    select: {
      total: true,
      subtotal: true,
      taxAmount: true,
      deliveryFee: true,
      tip: true,
      type: true,
      paymentMethod: true,
      paymentStatus: true,
    },
  });

  const reservationsCount = await prisma.reservation.count({
    where: { restaurantId, createdAt: { gte: start, lt: end } },
  });

  let sales = 0;
  let subTotals = 0;
  let taxAmount = 0;
  let deliveryFees = 0;
  let tips = 0;
  let pickupOrders = 0, pickupSales = 0;
  let deliveryOrders = 0, deliverySales = 0;
  let dineInOrders = 0, dineInSales = 0;
  let offlinePayments = 0, offlinePaymentsAmount = 0;
  let onlinePayments = 0, onlinePaymentsAmount = 0;
  let otherFees = 0;

  for (const o of orders) {
    sales += o.total;
    subTotals += o.subtotal;
    taxAmount += o.taxAmount ?? 0;
    deliveryFees += o.deliveryFee ?? 0;
    tips += o.tip ?? 0;

    const t = (o.type ?? "").toLowerCase();
    if (t === "delivery") { deliveryOrders++; deliverySales += o.total; }
    else if (t === "dine_in" || t === "dinein" || t === "dine-in") { dineInOrders++; dineInSales += o.total; }
    else { pickupOrders++; pickupSales += o.total; }

    const isOnline = o.paymentMethod === "card" && o.paymentStatus === "paid";
    if (isOnline) { onlinePayments++; onlinePaymentsAmount += o.total; }
    else { offlinePayments++; offlinePaymentsAmount += o.total; }
  }

  return {
    sales,
    orders: orders.length,
    avgOrderValue: orders.length ? sales / orders.length : 0,
    tableReservations: reservationsCount,
    subTotals,
    taxAmount,
    deliveryFees,
    tips,
    otherFees,
    pickupOrders, pickupSales,
    deliveryOrders, deliverySales,
    dineInOrders, dineInSales,
    offlinePayments, offlinePaymentsAmount,
    onlinePayments, onlinePaymentsAmount,
    total: sales,
  };
}

function weekdayLabel(d: Date, tz: string): string {
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: tz });
}

function monthLabel(d: Date, tz: string): string {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: tz });
}

/** Build the DigestStats for "yesterday" for a single restaurant. */
export async function buildDailyDigest(restaurantId: string, now = new Date()): Promise<DigestStats | null> {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { name: true, timezone: true },
  });
  if (!restaurant) return null;
  const tz = restaurant.timezone ?? "UTC";

  const [start, end] = dailyWindow(now, tz);
  const [priorStart, priorEnd] = priorDailyWindow(now, tz);
  const [current, prior] = await Promise.all([
    aggregate(restaurantId, start, end),
    aggregate(restaurantId, priorStart, priorEnd),
  ]);

  return {
    restaurantName: restaurant.name,
    periodLabel: weekdayLabel(start, tz),
    comparisonLabel: `vs previous ${start.toLocaleDateString("en-US", { weekday: "long", timeZone: tz })}`,
    sales: current.sales,
    salesDelta: pct(current.sales, prior.sales),
    orders: current.orders,
    ordersDelta: pct(current.orders, prior.orders),
    avgOrderValue: current.avgOrderValue,
    avgOrderValueDelta: pct(current.avgOrderValue, prior.avgOrderValue),
    tableReservations: current.tableReservations,
    reservationsDelta: pct(current.tableReservations, prior.tableReservations),
    pickupOrders: current.pickupOrders,
    pickupSales: current.pickupSales,
    deliveryOrders: current.deliveryOrders,
    deliverySales: current.deliverySales,
    dineInOrders: current.dineInOrders,
    dineInSales: current.dineInSales,
    offlinePayments: current.offlinePayments,
    offlinePaymentsAmount: current.offlinePaymentsAmount,
    onlinePayments: current.onlinePayments,
    onlinePaymentsAmount: current.onlinePaymentsAmount,
    subTotals: current.subTotals,
    taxAmount: current.taxAmount,
    deliveryFees: current.deliveryFees,
    tips: current.tips,
    otherFees: current.otherFees,
    total: current.total,
  };
}

/** Build the DigestStats for TODAY (live snapshot), for an
 *  in-app end-of-day report viewable from /admin/reports/end-of-day.
 *  Same numbers the email digest would compute tomorrow, but using
 *  today's window so the owner can glance at where they stand
 *  mid-service (Fabrizio 2026-06-01). Compares to yesterday rather
 *  than the same weekday last week. */
export async function buildTodaySnapshot(restaurantId: string, now = new Date()): Promise<DigestStats | null> {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { name: true, timezone: true },
  });
  if (!restaurant) return null;
  const tz = restaurant.timezone ?? "UTC";

  // Today's window in the restaurant's local timezone: [startOfToday, startOfTomorrow).
  const todayKey = dateKeyInTimezone(now, tz);
  const startOfToday = parseLocalDateTimeInTz(todayKey, 0, 0, tz);
  const startOfTomorrow = parseLocalDateTimeInTz(addDaysToKey(todayKey, 1), 0, 0, tz);
  // Comparison: same hours yesterday so the delta is apples-to-apples
  // mid-service (e.g. 2 PM vs 2 PM yesterday).
  const yesterdaySoFarStart = parseLocalDateTimeInTz(addDaysToKey(todayKey, -1), 0, 0, tz);
  const yesterdaySoFarEnd = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [current, prior] = await Promise.all([
    aggregate(restaurantId, startOfToday, startOfTomorrow),
    aggregate(restaurantId, yesterdaySoFarStart, yesterdaySoFarEnd),
  ]);

  return {
    restaurantName: restaurant.name,
    periodLabel: weekdayLabel(startOfToday, tz),
    comparisonLabel: "vs same time yesterday",
    sales: current.sales,
    salesDelta: pct(current.sales, prior.sales),
    orders: current.orders,
    ordersDelta: pct(current.orders, prior.orders),
    avgOrderValue: current.avgOrderValue,
    avgOrderValueDelta: pct(current.avgOrderValue, prior.avgOrderValue),
    tableReservations: current.tableReservations,
    reservationsDelta: pct(current.tableReservations, prior.tableReservations),
    pickupOrders: current.pickupOrders,
    pickupSales: current.pickupSales,
    deliveryOrders: current.deliveryOrders,
    deliverySales: current.deliverySales,
    dineInOrders: current.dineInOrders,
    dineInSales: current.dineInSales,
    offlinePayments: current.offlinePayments,
    offlinePaymentsAmount: current.offlinePaymentsAmount,
    onlinePayments: current.onlinePayments,
    onlinePaymentsAmount: current.onlinePaymentsAmount,
    subTotals: current.subTotals,
    taxAmount: current.taxAmount,
    deliveryFees: current.deliveryFees,
    tips: current.tips,
    otherFees: current.otherFees,
    total: current.total,
  };
}

/** Build the DigestStats for the previous calendar month. */
export async function buildMonthlyDigest(restaurantId: string, now = new Date()): Promise<DigestStats | null> {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { name: true, timezone: true },
  });
  if (!restaurant) return null;
  const tz = restaurant.timezone ?? "UTC";

  const [start, end] = monthlyWindow(now, tz);
  const [priorStart, priorEnd] = priorMonthlyWindow(now, tz);
  const [current, prior] = await Promise.all([
    aggregate(restaurantId, start, end),
    aggregate(restaurantId, priorStart, priorEnd),
  ]);

  return {
    restaurantName: restaurant.name,
    periodLabel: monthLabel(start, tz),
    comparisonLabel: "vs same month last year",
    sales: current.sales,
    salesDelta: pct(current.sales, prior.sales),
    orders: current.orders,
    ordersDelta: pct(current.orders, prior.orders),
    avgOrderValue: current.avgOrderValue,
    avgOrderValueDelta: pct(current.avgOrderValue, prior.avgOrderValue),
    tableReservations: current.tableReservations,
    reservationsDelta: pct(current.tableReservations, prior.tableReservations),
    pickupOrders: current.pickupOrders,
    pickupSales: current.pickupSales,
    deliveryOrders: current.deliveryOrders,
    deliverySales: current.deliverySales,
    dineInOrders: current.dineInOrders,
    dineInSales: current.dineInSales,
    offlinePayments: current.offlinePayments,
    offlinePaymentsAmount: current.offlinePaymentsAmount,
    onlinePayments: current.onlinePayments,
    onlinePaymentsAmount: current.onlinePaymentsAmount,
    subTotals: current.subTotals,
    taxAmount: current.taxAmount,
    deliveryFees: current.deliveryFees,
    tips: current.tips,
    otherFees: current.otherFees,
    total: current.total,
  };
}
