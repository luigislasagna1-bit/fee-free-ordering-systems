/**
 * Daily + monthly digest computation.
 *
 * Aggregates a restaurant's orders for an OPERATIONAL day (or last month) into
 * the `DigestStats` shape consumed by the End-of-Day report (kitchen + admin),
 * the emailed digests, and the print builder. "Previous period" deltas compare
 * against the previous operational day (daily) or the same calendar month a
 * year ago (monthly).
 *
 * Operational day = CLOSE-TO-CLOSE, not the calendar day (Fabrizio cms0gyexp
 * #13, 2026-07-31): day N runs from day N−1's effective closing time to day
 * N's effective closing time. So an order/booking placed AFTER tonight's close
 * (e.g. a 23:53 reservation when the store closed at 23:00) belongs to
 * TOMORROW's business day — the end-of-day report sent minutes after closing
 * can never miss activity, and the morning catch-up never re-reports a day
 * with only after-close noise. Overnight closers (02:00) keep their long-
 * standing behavior — that was already close-to-close. Closed/hour-less days
 * end at midnight so consecutive windows always chain with no gap or overlap.
 * The effective close comes from rowIntervals() (split-hours aware — the LAST
 * interval's end), falling back to the legacy openTime/closeTime envelope.
 */

import prisma from "@/lib/db";
import type { DigestStats } from "@/lib/email";
import { parseLocalDateTimeInTz, dateKeyInTimezone, rowIntervals } from "@/lib/restaurant-hours";
import { isOnlineCapturedPayment } from "@/lib/payment-classify";

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

export type DigestHoursRow = {
  dayOfWeek: number;
  isOpen: boolean;
  openTime: string | null;
  closeTime: string | null;
  closesNextDay: boolean;
  service: string | null;
  /** Split-hours JSON — read ONLY through rowIntervals(). */
  intervals?: unknown;
};

/** Day-of-week (0=Sun) for a YYYY-MM-DD key (noon-UTC anchor). */
function dowOfKey(key: string): number {
  return new Date(`${key}T12:00:00Z`).getUTCDay();
}

/** The hours row for a weekday — prefer the default (service=null) row. */
function pickHoursRow(rows: DigestHoursRow[], dow: number): DigestHoursRow | null {
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
 * The instant business day `dayKey` ENDS: the latest interval close of that
 * day's hours (split-hours aware; a closesNextDay interval ends on the next
 * calendar day), or midnight for closed / hour-less days. Because every day
 * ends somewhere in [its own close, next midnight], consecutive days chain
 * into gap-free windows. Exported for the closing-time digest sweep, which
 * fires the emailed report a few minutes after this instant.
 */
export function operationalDayEnd(rows: DigestHoursRow[], dayKey: string, tz: string): Date {
  const nextKey = addDaysToKey(dayKey, 1);
  const midnight = parseLocalDateTimeInTz(nextKey, 0, 0, tz);
  const ivs = rowIntervals(pickHoursRow(rows, dowOfKey(dayKey)));
  let end: Date | null = null;
  for (const iv of ivs) {
    const c = parseHHMM(iv.close);
    if (!c) continue;
    const candidate = parseLocalDateTimeInTz(iv.closesNextDay ? nextKey : dayKey, c.h, c.m, tz);
    if (!end || candidate.getTime() > end.getTime()) end = candidate;
  }
  return end ?? midnight;
}

/**
 * Operational-day [start, end) for `dayKey` in the restaurant's tz:
 * close-to-close. `start` = when the PREVIOUS business day ended; `end` = this
 * day's own effective close (midnight when closed). Falls back to the calendar
 * day when hours are absent or the chain degenerates (e.g. a >24h overnight
 * row) — the safe shape that can never lose an order between windows.
 */
function operationalDayWindow(rows: DigestHoursRow[], dayKey: string, tz: string): [Date, Date] {
  const calStart = parseLocalDateTimeInTz(dayKey, 0, 0, tz);
  const calEnd = parseLocalDateTimeInTz(addDaysToKey(dayKey, 1), 0, 0, tz);
  if (!rows.length) return [calStart, calEnd];

  const start = operationalDayEnd(rows, addDaysToKey(dayKey, -1), tz);
  const end = operationalDayEnd(rows, dayKey, tz);
  if (start.getTime() >= end.getTime()) return [calStart, calEnd];
  return [start, end];
}

/** The operational-day key that `now` currently falls in. Early-morning hours
 *  belong to the previous business day for overnight closers. The tail between
 *  tonight's close and midnight still maps to TODAY — the live EOD view keeps
 *  showing the day that just ended (frozen at close) instead of flipping to an
 *  empty tomorrow while staff reconcile the till. */
function operationalDayKeyOf(rows: DigestHoursRow[], now: Date, tz: string): string {
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
 *  so the numbers match what the owner actually earned. Cancelled/rejected
 *  orders AND reservations are counted separately (info lines, Fabrizio
 *  cms0gyexp #14), and refunds are netted out of "collected". */
async function aggregate(restaurantId: string, start: Date, end: Date) {
  const [orders, reservationsCount, cancelledReservations, cancelledOrders, missedOrders] =
    await Promise.all([
      prisma.order.findMany({
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
          // Cumulative refunds → the "Refunds" line + netted out of "collected"
          // (Fabrizio cms0gyexp #14: a €20 partial refund still showed as fully
          // collected). Major units, capped by writers at total − creditApplied.
          refundedAmount: true,
          // Promo + coupon discounts → the "Discounts" line on EOD/Summary.
          couponDiscount: true,
          promoDiscount: true,
          // Per-order service fees (JSON [{name, amount}]) → the "Other fees" line.
          appliedServiceFees: true,
        },
      }),
      // Mirror the orders rule: a booking the restaurant rejected or anyone
      // cancelled is NOT a table reservation the owner earned (Fabrizio
      // cms0gyexp #14 — rejected booking #FG6GD5 was inflating the count).
      prisma.reservation.count({
        where: {
          restaurantId,
          createdAt: { gte: start, lt: end },
          status: { notIn: ["cancelled", "rejected"] },
        },
      }),
      prisma.reservation.count({
        where: {
          restaurantId,
          createdAt: { gte: start, lt: end },
          status: { in: ["cancelled", "rejected"] },
        },
      }),
      prisma.order.count({
        where: {
          restaurantId,
          createdAt: { gte: start, lt: end },
          status: { in: ["rejected", "cancelled"] },
          orderNumber: { not: { startsWith: "TEST-" } },
        },
      }),
      // MISSED = auto-rejected for not being accepted in time — drives the
      // digest's "you didn't miss any order" line (was hardcoded true).
      prisma.order.count({
        where: {
          restaurantId,
          createdAt: { gte: start, lt: end },
          status: "rejected",
          cancelledBy: "auto",
          orderNumber: { not: { startsWith: "TEST-" } },
        },
      }),
    ]);

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
  let onlineCardPayments = 0, onlineCardPaymentsAmount = 0;
  let onlinePaypalPayments = 0, onlinePaypalPaymentsAmount = 0;
  let onlineOtherPayments = 0, onlineOtherPaymentsAmount = 0;
  let otherFees = 0;
  let storeCreditRedeemed = 0;
  let discounts = 0;
  let refundedOrders = 0, refundsAmount = 0;

  for (const o of orders) {
    sales += o.total;
    subTotals += o.subtotal;
    taxAmount += o.taxAmount ?? 0;
    deliveryFees += o.deliveryFee ?? 0;
    tips += o.tip ?? 0;
    // Store credit is a TENDER, not cash/card. Track it separately so the
    // payment split + "collected" don't overstate what actually hit the till /
    // card processor. `collectedAmt` = what was really taken in cash/card,
    // NET of any refunds already issued back to the customer.
    const creditUsed = (o as any).creditApplied ?? 0;
    storeCreditRedeemed += creditUsed;
    const chargedBase = Math.max(0, o.total - creditUsed);
    // Refunds only ever move card/PayPal money (writers cap refundedAmount at
    // total − creditApplied; credit goes back to the wallet via the ledger).
    const refunded = Math.min(Math.max(0, (o as any).refundedAmount ?? 0), chargedBase);
    if (refunded > 0) { refundedOrders++; refundsAmount += refunded; }
    const collectedAmt = Math.max(0, chargedBase - refunded);
    discounts += ((o as any).couponDiscount ?? 0) + ((o as any).promoDiscount ?? 0);

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

    // Shared pure predicate (see payment-classify.ts) — PayPal was
    // misclassified as Offline until 2026-07-11, overstating till cash; a
    // refunded card order fell out of the Online bucket until 2026-07-31.
    // Per-method sub-buckets so PayPal money is labeled PayPal, not "card"
    // (Fabrizio cms0gyexp #14).
    const isOnline = isOnlineCapturedPayment(o.paymentMethod, o.paymentStatus);
    if (isOnline) {
      onlinePayments++; onlinePaymentsAmount += collectedAmt;
      if (o.paymentMethod === "paypal") { onlinePaypalPayments++; onlinePaypalPaymentsAmount += collectedAmt; }
      else if (o.paymentMethod === "card") { onlineCardPayments++; onlineCardPaymentsAmount += collectedAmt; }
      else { onlineOtherPayments++; onlineOtherPaymentsAmount += collectedAmt; }
    } else { offlinePayments++; offlinePaymentsAmount += collectedAmt; }
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
    onlineCardPayments, onlineCardPaymentsAmount,
    onlinePaypalPayments, onlinePaypalPaymentsAmount,
    onlineOtherPayments, onlineOtherPaymentsAmount,
    storeCreditRedeemed,
    refundedOrders, refundsAmount,
    cancelledOrders, cancelledReservations, missedOrders,
    // Real cash/card kept = gross revenue − store credit redeemed − refunds
    // issued back to customers.
    collected: Math.max(0, sales - storeCreditRedeemed - refundsAmount),
    discounts,
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
    onlineCardPayments: current.onlineCardPayments,
    onlineCardPaymentsAmount: current.onlineCardPaymentsAmount,
    onlinePaypalPayments: current.onlinePaypalPayments,
    onlinePaypalPaymentsAmount: current.onlinePaypalPaymentsAmount,
    onlineOtherPayments: current.onlineOtherPayments,
    onlineOtherPaymentsAmount: current.onlineOtherPaymentsAmount,
    storeCreditRedeemed: current.storeCreditRedeemed,
    refundedOrders: current.refundedOrders,
    refundsAmount: current.refundsAmount,
    cancelledOrders: current.cancelledOrders,
    cancelledReservations: current.cancelledReservations,
    missedOrders: current.missedOrders,
    collected: current.collected,
    discounts: current.discounts,
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
        select: { dayOfWeek: true, isOpen: true, openTime: true, closeTime: true, closesNextDay: true, service: true, intervals: true },
      },
    },
  });
  if (!restaurant) return null;
  return {
    name: restaurant.name,
    tz: restaurant.timezone ?? "UTC",
    rows: (restaurant.openingHours ?? []) as DigestHoursRow[],
  };
}

/** Build the report for an operational `dayKey`. `isLive` = the day currently
 *  in progress (caps the comparison window to the same elapsed time). */
async function buildOperationalReport(
  restaurantId: string,
  name: string,
  tz: string,
  rows: DigestHoursRow[],
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
