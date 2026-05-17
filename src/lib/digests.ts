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

/** Returns [startOfWindow, endOfWindow] for the previous calendar day in UTC.
 *  We use UTC throughout — Vercel Cron runs on UTC schedules so this is the
 *  least surprising boundary. Restaurants in non-UTC timezones will see
 *  reports for "yesterday in UTC" which is close enough for v1. */
function dailyWindow(now: Date): [Date, Date] {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  return [start, end];
}

/** Same window one week earlier — used for daily-comparison deltas. */
function priorDailyWindow(now: Date): [Date, Date] {
  const [start, end] = dailyWindow(now);
  return [
    new Date(start.getTime() - 7 * 24 * 60 * 60 * 1000),
    new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000),
  ];
}

/** Returns [startOfLastMonth, endOfLastMonth] in UTC. */
function monthlyWindow(now: Date): [Date, Date] {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return [start, end];
}

function priorMonthlyWindow(now: Date): [Date, Date] {
  const start = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), 1));
  return [start, end];
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

function weekdayLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function monthLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** Build the DigestStats for "yesterday" for a single restaurant. */
export async function buildDailyDigest(restaurantId: string, now = new Date()): Promise<DigestStats | null> {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { name: true },
  });
  if (!restaurant) return null;

  const [start, end] = dailyWindow(now);
  const [priorStart, priorEnd] = priorDailyWindow(now);
  const [current, prior] = await Promise.all([
    aggregate(restaurantId, start, end),
    aggregate(restaurantId, priorStart, priorEnd),
  ]);

  return {
    restaurantName: restaurant.name,
    periodLabel: weekdayLabel(start),
    comparisonLabel: `vs previous ${start.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })}`,
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
    select: { name: true },
  });
  if (!restaurant) return null;

  const [start, end] = monthlyWindow(now);
  const [priorStart, priorEnd] = priorMonthlyWindow(now);
  const [current, prior] = await Promise.all([
    aggregate(restaurantId, start, end),
    aggregate(restaurantId, priorStart, priorEnd),
  ]);

  return {
    restaurantName: restaurant.name,
    periodLabel: monthLabel(start),
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
