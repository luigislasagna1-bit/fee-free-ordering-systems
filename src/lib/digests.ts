/**
 * Daily + monthly digest computation.
 *
 * Aggregates a restaurant's orders for an OPERATIONAL day (or last month) into
 * the `DigestStats` shape consumed by the End-of-Day report (kitchen + admin),
 * the emailed digests, and the print builder. "Previous period" deltas compare
 * against the previous operational day (daily) or the same calendar month a
 * year ago (monthly).
 *
 * Operational day vs. calendar day: a restaurant open until 02:00 has those
 * after-midnight orders counted in the PREVIOUS business day's report — not the
 * next calendar day. The window follows store hours (`OpeningHours.closesNextDay`).
 * Luigi 2026-06-14 (reseller report: EOD must align with store hours).
 */

import prisma from "@/lib/db";
import type { DigestStats } from "@/lib/email";
import { parseLocalDateTimeInTz, dateKeyInTimezone } from "@/lib/restaurant-hours";

// ── Local-date key math (DST-safe) ──────────────────────────────────────────
// Windows are computed in the RESTAURANT's local timezone, then projected to
// UTC instants (via parseLocalDateTimeInTz) for comparison against order
// timestamps.

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

// ── Operational-day window (store-hours aware) ───────────────────────────────

type HoursRow = {
  dayOfWeek: number;
  isOpen: boolean;
  openTime: string | null;
  closeTime: string | null;
  closesNextDay: boolean;
  service: string | null;
};

/** Day-of-week (0=Sun) for a YYYY-MM-DD key (noon-UTC anchor). */
function dowOfKey(key: string): number {
  return new Date(`${key}T12:00:00Z`).getUTCDay();
}

/** The hours row for a weekday — prefer the default (service=null) row. */
function pickHoursRow(rows: HoursRow[], dow: number): HoursRow | null {
  const dayRows = rows.filter((r) => r.dayOfWeek === dow);
  return dayRows.find((r) => r.service == null) ?? dayRows[0] ?? null;
}

function parseHHMM(t: string | null | undefined): { h: number; m: number } | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return { h, m };
}

/**
 * Operational-day [start, end) for `dayKey` in the restaurant's tz, honoring
 * close-after-midnight: `end` EXTENDS past midnight only when the day
 * `closesNextDay`; `start` PUSHES later only when the PREVIOUS day closed past
 * midnight (those early hours belong to the previous business day). Falls back
 * to the calendar day when hours are absent or degenerate.
 */
function operationalDayWindow(rows: HoursRow[], dayKey: string, tz: string): [Date, Date] {
  const nextKey = addDaysToKey(dayKey, 1);
  const calStart = parseLocalDateTimeInTz(dayKey, 0, 0, tz);
  const calEnd = parseLocalDateTimeInTz(nextKey, 0, 0, tz);
  if (!rows.length) return [calStart, calEnd];

  const today = pickHoursRow(rows, dowOfKey(dayKey));
  const prev = pickHoursRow(rows, dowOfKey(addDaysToKey(dayKey, -1)));

  let start = calStart;
  const pc = prev && prev.isOpen && prev.closesNextDay ? parseHHMM(prev.closeTime) : null;
  if (pc) start = parseLocalDateTimeInTz(dayKey, pc.h, pc.m, tz);

  let end = calEnd;
  const tc = today && today.isOpen && today.closesNextDay ? parseHHMM(today.closeTime) : null;
  if (tc) end = parseLocalDateTimeInTz(nextKey, tc.h, tc.m, tz);

  if (start.getTime() >= end.getTime()) return [calStart, calEnd];
  return [start, end];
}

/** The operational-day key that `now` currently falls in (early-morning hours
 *  belong to the previous business day for overnight closers). */
function operationalDayKeyOf(rows: HoursRow[], now: Date, tz: string): string {
  const todayKey = dateKeyInTimezone(now, tz);
  const [start] = operationalDayWindow(rows, todayKey, tz);
  return now.getTime() < start.getTime() ? addDaysToKey(todayKey, -1) : todayKey;
}

function pct(current: number, prior: number): number {
  if (!prior) return 0;
  return ((current - prior) / prior) * 100;
}

/** Core aggregator. Pulls every order in the window for one restaurant and
 *  rolls it into a single stats row. Excludes rejected/cancelled + TEST orders
 *  so the numbers match what the owner actually earned. */
async function aggregate(restaurantId: string, start: Date, end: Date) {
  const orders = await prisma.order.findMany({
    where: {
      restaurantId,
      createdAt: { gte: start, lt: end },
      status: { notIn: ["rejected", "cancelled"] },
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
      // Reward / store credit spent — so "collected" reflects real cash/card,
      // not the gross total (Luigi 2026-07-02: store credit is a separate tender).
      creditApplied: true,
      // Per-order service fees (JSON [{name, amount}]) → the "Other fees" line.
      appliedServiceFees: true,
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
  let storeCreditRedeemed = 0;

  for (const o of orders) {
    sales += o.total;
    subTotals += o.subtotal;
    taxAmount += o.taxAmount ?? 0;
    deliveryFees += o.deliveryFee ?? 0;
    tips += o.tip ?? 0;
    // Store credit is a TENDER, not cash/card. Track it separately so the
    // payment split + "collected" don't overstate what actually hit the till /
    // card processor. `collectedAmt` = what was really taken in cash/card.
    const creditUsed = (o as any).creditApplied ?? 0;
    storeCreditRedeemed += creditUsed;
    const collectedAmt = Math.max(0, o.total - creditUsed);

    // "Other fees" = sum of the order's applied service fees. Stored as JSON
    // (array or string depending on column type) — parse defensively.
    const rawFees: unknown = (o as any).appliedServiceFees;
    let fees: any[] = Array.isArray(rawFees) ? (rawFees as any[]) : [];
    if (!fees.length && typeof rawFees === "string") {
      try { const p = JSON.parse(rawFees); if (Array.isArray(p)) fees = p; } catch {}
    }
    for (const f of fees) { const a = Number(f?.amount); if (Number.isFinite(a)) otherFees += a; }

    const t = (o.type ?? "").toLowerCase();
    if (t === "delivery") { deliveryOrders++; deliverySales += o.total; }
    else if (t === "dine_in" || t === "dinein" || t === "dine-in") { dineInOrders++; dineInSales += o.total; }
    else { pickupOrders++; pickupSales += o.total; }

    const isOnline = o.paymentMethod === "card" && o.paymentStatus === "paid";
    if (isOnline) { onlinePayments++; onlinePaymentsAmount += collectedAmt; }
    else { offlinePayments++; offlinePaymentsAmount += collectedAmt; }
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
    storeCreditRedeemed,
    // Real cash/card collected = gross revenue − store credit redeemed.
    collected: Math.max(0, sales - storeCreditRedeemed),
    total: sales,
  };
}

type Aggregated = Awaited<ReturnType<typeof aggregate>>;

function weekdayLabel(d: Date, tz: string): string {
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: tz });
}

function monthLabel(d: Date, tz: string): string {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: tz });
}

/** Assemble the DigestStats object from a current + prior aggregate. */
function buildStats(
  restaurantName: string,
  periodLabel: string,
  comparisonLabel: string,
  current: Aggregated,
  prior: Aggregated,
): DigestStats {
  return {
    restaurantName,
    periodLabel,
    comparisonLabel,
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
    storeCreditRedeemed: current.storeCreditRedeemed,
    collected: current.collected,
    subTotals: current.subTotals,
    taxAmount: current.taxAmount,
    deliveryFees: current.deliveryFees,
    tips: current.tips,
    otherFees: current.otherFees,
    total: current.total,
  };
}

async function reportContext(restaurantId: string) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      name: true,
      timezone: true,
      openingHours: {
        select: { dayOfWeek: true, isOpen: true, openTime: true, closeTime: true, closesNextDay: true, service: true },
      },
    },
  });
  if (!restaurant) return null;
  return {
    name: restaurant.name,
    tz: restaurant.timezone ?? "UTC",
    rows: (restaurant.openingHours ?? []) as HoursRow[],
  };
}

/** Build the report for an operational `dayKey`. `isLive` = the day currently
 *  in progress (caps the comparison window to the same elapsed time). */
async function buildOperationalReport(
  restaurantId: string,
  name: string,
  tz: string,
  rows: HoursRow[],
  dayKey: string,
  now: Date,
  isLive: boolean,
): Promise<DigestStats> {
  const [start, end] = operationalDayWindow(rows, dayKey, tz);
  const [prevStart, prevEndFull] = operationalDayWindow(rows, addDaysToKey(dayKey, -1), tz);
  const prevEnd = isLive
    ? new Date(Math.min(prevEndFull.getTime(), prevStart.getTime() + Math.max(0, now.getTime() - start.getTime())))
    : prevEndFull;

  const [current, prior] = await Promise.all([
    aggregate(restaurantId, start, end),
    aggregate(restaurantId, prevStart, prevEnd),
  ]);

  const periodLabel = weekdayLabel(parseLocalDateTimeInTz(dayKey, 12, 0, tz), tz);
  return buildStats(name, periodLabel, isLive ? "vs same time yesterday" : "vs previous day", current, prior);
}

/** DigestStats for "yesterday" (the operational day that just ended) — email digest. */
export async function buildDailyDigest(restaurantId: string, now = new Date()): Promise<DigestStats | null> {
  const ctx = await reportContext(restaurantId);
  if (!ctx) return null;
  const yesterdayKey = addDaysToKey(dateKeyInTimezone(now, ctx.tz), -1);
  return buildOperationalReport(restaurantId, ctx.name, ctx.tz, ctx.rows, yesterdayKey, now, false);
}

/** DigestStats for TODAY (the operational day in progress) — live EOD snapshot. */
export async function buildTodaySnapshot(restaurantId: string, now = new Date()): Promise<DigestStats | null> {
  const ctx = await reportContext(restaurantId);
  if (!ctx) return null;
  const dayKey = operationalDayKeyOf(ctx.rows, now, ctx.tz);
  return buildOperationalReport(restaurantId, ctx.name, ctx.tz, ctx.rows, dayKey, now, true);
}

/** DigestStats for an arbitrary operational `dayKey` (YYYY-MM-DD) — powers the
 *  date stepper / previous-day reports. `isLive` is derived (today vs past). */
export async function buildDayReport(restaurantId: string, dayKey: string, now = new Date()): Promise<DigestStats | null> {
  const ctx = await reportContext(restaurantId);
  if (!ctx) return null;
  const todayKey = operationalDayKeyOf(ctx.rows, now, ctx.tz);
  return buildOperationalReport(restaurantId, ctx.name, ctx.tz, ctx.rows, dayKey, now, dayKey === todayKey);
}

/** The current operational-day key (YYYY-MM-DD) for a restaurant — for the API
 *  to validate a requested `?date=` against the 7-day look-back window. */
export async function currentOperationalDayKey(restaurantId: string, now = new Date()): Promise<string | null> {
  const ctx = await reportContext(restaurantId);
  if (!ctx) return null;
  return operationalDayKeyOf(ctx.rows, now, ctx.tz);
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
  return buildStats(restaurant.name, monthLabel(start, tz), "vs same month last year", current, prior);
}
