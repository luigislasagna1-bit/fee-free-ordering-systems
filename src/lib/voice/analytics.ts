/**
 * Nabil AI dashboard analytics — the aggregation seam for /admin/phone-ordering.
 *
 * Two layers, deliberately separated:
 *   1. PURE aggregation helpers (after-hours logic, series bucketing,
 *      histograms, conversion math) — no Prisma import, unit-tested in
 *      analytics.test.ts.
 *   2. Thin DB fetchers (fetchVoiceAnalytics / fetchVoiceMonthRevenue) that run
 *      the few restaurant-scoped queries and hand the rows to layer 1. Prisma
 *      is loaded LAZILY inside the fetchers so importing this module in vitest
 *      never constructs a PrismaClient (src/lib/db.ts throws without
 *      DATABASE_URL at import time).
 *
 * Money rule: every revenue figure goes through `collectedOf` (store credit is
 * a tender, not income) and is attributed by joining Order.orderNumber to
 * VoiceCall.orderNumber, always scoped to the restaurant. That join ALWAYS
 * carries REPORT_ORDER_STATUS_WHERE — including upsell revenue, which is
 * stamped on the call at hangup but must still drop out when the order is
 * later rejected/cancelled.
 */
import {
  rowIntervals,
  localDowAndHHMM,
  dateKeyInTimezone,
  type HoursInterval,
  type OpeningHoursRow,
} from "@/lib/restaurant-hours";
import { collectedOf, type MoneyRow } from "@/lib/reports/collected";
import { REPORT_ORDER_STATUS_WHERE } from "@/lib/reports/order-filter";
import { phoneDigitsKey } from "@/lib/phone";

// ── Types ─────────────────────────────────────────────────────────────

/** The VoiceCall projection the aggregates need — matches the fetcher select. */
export type AnalyticsCall = {
  id: string;
  startedAt: Date;
  durationSeconds: number | null;
  outcome: string | null;
  language: string | null;
  sentiment: string | null;
  orderNumber: string | null;
  fromNumber: string;
  customerId: string | null;
  upsellCents: number | null;
  transferReason: string | null;
};

/** Outcome taxonomy (matches the voice service — see the build contract). */
export const CALL_OUTCOMES = [
  "order_placed",
  "reservation_booked",
  "faq_answered",
  "transferred",
  "message_taken",
  "abandoned",
  "abandoned_with_cart",
  "dropped",
  "spam",
  "error",
] as const;

export type RecentCall = {
  id: string;
  startedAt: Date;
  fromNumber: string;
  outcome: string | null;
  durationSeconds: number | null;
  sentiment: string | null;
  orderNumber: string | null;
  customerName: string | null;
  /** Collected money of the linked order, null when no order. */
  total: number | null;
};

/** One row of the Overview "Top callers" card — a phone number, never an
 *  online customer (phone history is a separate world by design). */
export type TopCaller = {
  /** phoneDigitsKey(fromNumber) — the caller-page route key. */
  digits: string;
  fromNumber: string;
  customerId: string | null;
  /** Display name when the voice session resolved one, else null. */
  name: string | null;
  calls: number;
  orders: number;
  /** Collected money across the caller's linked orders in range. */
  spend: number;
  lastCallAt: Date;
};

export type VoiceAnalytics = {
  calls: number;
  durationSeconds: number;
  /** durationSeconds as hours, 1 decimal place — "Staff hours reclaimed". */
  staffHours: number;
  outcomes: Record<string, number>;
  /** Zero-filled per-local-day series across the whole range. */
  perDay: { key: string; count: number }[];
  /** 24 buckets, index = local hour of day. */
  perHour: number[];
  /** 7 buckets, index = local day of week (0 = Sunday). */
  perDow: number[];
  afterHours: number;
  languages: Record<string, number>;
  sentiments: Record<string, number>;
  /** Calls with outcome "error" — the amber "needs attention" figure. */
  needsAttention: number;
  ordersLinked: number;
  /** Collected (order value − store credit), major currency units. */
  revenue: number;
  avgOrderValue: number;
  upsellCents: number;
  recent: RecentCall[];
  topCallers: TopCaller[];
};

// ── Pure helpers (unit-tested) ────────────────────────────────────────

/** Shift a YYYY-MM-DD key by N days (noon-UTC anchor dodges DST edges). */
export function addDaysToKey(key: string, delta: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Local YYYY-MM-DD key for a Date in the restaurant's timezone (falls back
 *  to server-local when tz is missing/invalid — mirrors report pages). */
export function localDayKey(d: Date, tz?: string | null): string {
  if (tz) {
    try {
      return dateKeyInTimezone(d, tz);
    } catch {
      /* invalid tz → server-local fallback */
    }
  }
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Inclusive list of day keys between two YYYY-MM-DD keys (capped at 400). */
export function dayKeysInRange(fromKey: string, toKey: string): string[] {
  const keys: string[] = [];
  let key = fromKey;
  for (let i = 0; i < 400 && key <= toKey; i++) {
    keys.push(key);
    key = addDaysToKey(key, 1);
  }
  return keys;
}

/** Zero-filled per-day counts: every key in `keys` appears even with 0 calls. */
export function bucketByDayKey(keys: string[], callKeys: string[]): { key: string; count: number }[] {
  const counts = new Map<string, number>(keys.map((k) => [k, 0]));
  for (const k of callKeys) {
    const cur = counts.get(k);
    if (cur !== undefined) counts.set(k, cur + 1);
  }
  return keys.map((key) => ({ key, count: counts.get(key) ?? 0 }));
}

/** 24-bucket histogram from local hours (values outside 0..23 are dropped). */
export function hourHistogram(hours: number[]): number[] {
  const buckets = new Array(24).fill(0);
  for (const h of hours) if (Number.isInteger(h) && h >= 0 && h < 24) buckets[h]++;
  return buckets;
}

/** 7-bucket histogram from local days-of-week (0 = Sunday). */
export function dowHistogram(dows: number[]): number[] {
  const buckets = new Array(7).fill(0);
  for (const d of dows) if (Number.isInteger(d) && d >= 0 && d < 7) buckets[d]++;
  return buckets;
}

/** Count occurrences of each non-empty value. */
export function countBy(values: ReadonlyArray<string | null | undefined>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) {
    if (!v) continue;
    out[v] = (out[v] ?? 0) + 1;
  }
  return out;
}

/** Orders-per-call conversion percentage. 0 calls → 0 (never NaN). */
export function conversionPct(orders: number, calls: number): number {
  if (calls <= 0) return 0;
  return Math.round((orders / calls) * 1000) / 10;
}

/** Total call time as staff hours reclaimed, 1 decimal place. */
export function staffHoursReclaimed(totalSeconds: number): number {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return 0;
  return Math.round((totalSeconds / 3600) * 10) / 10;
}

/** Group OpeningHours rows into per-day interval lists (index = dayOfWeek,
 *  0 = Sunday). Rows are read through rowIntervals() — THE split-hours seam. */
export function buildIntervalsByDow(rows: OpeningHoursRow[]): HoursInterval[][] {
  const byDay: HoursInterval[][] = Array.from({ length: 7 }, () => []);
  for (const row of rows) {
    if (row.dayOfWeek >= 0 && row.dayOfWeek <= 6) {
      byDay[row.dayOfWeek].push(...rowIntervals(row));
    }
  }
  return byDay;
}

/**
 * Is a local HH:MM inside any open window? Checks BOTH the day's own
 * intervals AND the previous day's overnight (closesNextDay) tails — a call
 * at Sat 01:30 is in-hours when Friday runs 22:00–02:00.
 */
export function isWithinIntervals(
  hhmm: string,
  dayIntervals: HoursInterval[],
  prevDayIntervals: HoursInterval[],
): boolean {
  for (const iv of dayIntervals) {
    if (iv.closesNextDay) {
      if (hhmm >= iv.open) return true;
    } else if (hhmm >= iv.open && hhmm < iv.close) {
      return true;
    }
  }
  for (const iv of prevDayIntervals) {
    if (iv.closesNextDay && hhmm < iv.close) return true;
  }
  return false;
}

/** After-hours = outside every open window for that local moment. */
export function isAfterHours(dow: number, hhmm: string, byDay: HoursInterval[][]): boolean {
  const today = byDay[dow] ?? [];
  const prev = byDay[(dow + 6) % 7] ?? [];
  return !isWithinIntervals(hhmm, today, prev);
}

/**
 * Group calls by phone number and rank callers by collected spend, then call
 * count. Anonymous / unparseable numbers are skipped — there is nothing to
 * click through to. `collectedByNumber` must already be REPORT_ORDER_STATUS
 * filtered so a rejected order contributes nothing (same rule as `revenue`).
 */
export function topCallersFrom(
  calls: ReadonlyArray<Pick<AnalyticsCall, "fromNumber" | "customerId" | "orderNumber" | "startedAt">>,
  collectedByNumber: ReadonlyMap<string, number>,
  limit = 5,
): Omit<TopCaller, "name">[] {
  const byDigits = new Map<string, Omit<TopCaller, "name">>();
  for (const c of calls) {
    const digits = phoneDigitsKey(c.fromNumber);
    if (!digits) continue;
    const collected = c.orderNumber ? collectedByNumber.get(c.orderNumber) : undefined;
    const cur = byDigits.get(digits);
    if (cur) {
      cur.calls++;
      if (collected != null) {
        cur.orders++;
        cur.spend += collected;
      }
      if (!cur.customerId && c.customerId) cur.customerId = c.customerId;
      if (c.startedAt > cur.lastCallAt) cur.lastCallAt = c.startedAt;
    } else {
      byDigits.set(digits, {
        digits,
        fromNumber: c.fromNumber,
        customerId: c.customerId,
        calls: 1,
        orders: collected != null ? 1 : 0,
        spend: collected ?? 0,
        lastCallAt: c.startedAt,
      });
    }
  }
  return [...byDigits.values()]
    .map((r) => ({ ...r, spend: Math.round(r.spend * 100) / 100 }))
    .sort((a, b) => b.spend - a.spend || b.calls - a.calls || b.lastCallAt.getTime() - a.lastCallAt.getTime())
    .slice(0, limit);
}

/**
 * PURE compositor: everything on the Overview tab except the recent-activity
 * feed (which needs customer-name rows the fetcher joins separately).
 */
export function computeVoiceAnalytics(input: {
  calls: AnalyticsCall[];
  hoursRows: OpeningHoursRow[];
  orders: Array<MoneyRow & { orderNumber: string }>;
  range: { from: Date; to: Date };
  timezone: string | null;
}): Omit<VoiceAnalytics, "recent" | "topCallers"> {
  const { calls, hoursRows, orders, range, timezone } = input;
  const tz = timezone ?? undefined;
  const byDay = buildIntervalsByDow(hoursRows);

  const dayKeys = dayKeysInRange(localDayKey(range.from, tz), localDayKey(range.to, tz));
  // `orders` arrives already filtered by REPORT_ORDER_STATUS_WHERE (fetcher),
  // so this set IS the "orders that count" list.
  const liveOrderNumbers = new Set(orders.map((o) => o.orderNumber));
  const callDayKeys: string[] = [];
  const hours: number[] = [];
  const dows: number[] = [];
  let afterHours = 0;
  let durationSeconds = 0;
  let upsellCents = 0;

  for (const c of calls) {
    const { dow, hhmm } = localDowAndHHMM(c.startedAt, tz);
    callDayKeys.push(localDayKey(c.startedAt, tz));
    hours.push(parseInt(hhmm.slice(0, 2), 10));
    dows.push(dow);
    if (isAfterHours(dow, hhmm, byDay)) afterHours++;
    durationSeconds += c.durationSeconds ?? 0;
    // Upsell money is REVENUE — it must obey the same canonical status filter
    // as `revenue`/`ordersLinked`: a rejected/cancelled/TEST- order (the
    // status can change long after the intelligence pass stamped upsellCents)
    // contributes nothing.
    if (c.orderNumber && liveOrderNumbers.has(c.orderNumber)) upsellCents += c.upsellCents ?? 0;
  }

  const outcomes = countBy(calls.map((c) => c.outcome));
  const revenue = Math.round(orders.reduce((s, o) => s + collectedOf(o), 0) * 100) / 100;
  const ordersLinked = orders.length;

  return {
    calls: calls.length,
    durationSeconds,
    staffHours: staffHoursReclaimed(durationSeconds),
    outcomes,
    perDay: bucketByDayKey(dayKeys, callDayKeys),
    perHour: hourHistogram(hours),
    perDow: dowHistogram(dows),
    afterHours,
    languages: countBy(calls.map((c) => c.language)),
    sentiments: countBy(calls.map((c) => c.sentiment)),
    needsAttention: outcomes["error"] ?? 0,
    ordersLinked,
    revenue,
    avgOrderValue: ordersLinked > 0 ? Math.round((revenue / ordersLinked) * 100) / 100 : 0,
    upsellCents,
  };
}

// ── Thin DB fetchers (server only — prisma loaded lazily) ─────────────

const CALL_FETCH_CAP = 5000; // ~180 calls/day for a 28-day range; safety net

/**
 * The Overview tab's data in 5 queries (calls, hours, orders join,
 * recent-caller names) — all restaurant-scoped and date-ranged.
 */
export async function fetchVoiceAnalytics(
  restaurantId: string,
  range: { from: Date; to: Date },
  timezone: string | null,
): Promise<VoiceAnalytics> {
  const { default: prisma } = await import("@/lib/db");

  const [calls, hoursRows] = await Promise.all([
    prisma.voiceCall.findMany({
      where: { restaurantId, startedAt: { gte: range.from, lte: range.to } },
      orderBy: { startedAt: "desc" },
      take: CALL_FETCH_CAP,
      select: {
        id: true,
        startedAt: true,
        durationSeconds: true,
        outcome: true,
        language: true,
        sentiment: true,
        orderNumber: true,
        fromNumber: true,
        customerId: true,
        upsellCents: true,
        transferReason: true,
      },
    }),
    prisma.openingHours.findMany({
      where: { restaurantId, service: null },
      select: { dayOfWeek: true, isOpen: true, openTime: true, closeTime: true, closesNextDay: true, intervals: true },
    }),
  ]);

  const orderNumbers = Array.from(
    new Set(calls.map((c) => c.orderNumber).filter((n): n is string => !!n)),
  );
  const orders = orderNumbers.length
    ? await prisma.order.findMany({
        // Merge the canonical status/TEST- filter with the voice join — the
        // orderNumber `in` and `not` clauses must live in ONE filter object.
        where: {
          restaurantId,
          status: REPORT_ORDER_STATUS_WHERE.status,
          orderNumber: { ...REPORT_ORDER_STATUS_WHERE.orderNumber, in: orderNumbers },
        },
        select: { orderNumber: true, total: true, creditApplied: true },
      })
    : [];

  const collectedByNumber = new Map(orders.map((o) => [o.orderNumber, collectedOf(o)]));
  const recentCalls = calls.slice(0, 8);
  const topCallers = topCallersFrom(calls, collectedByNumber);
  // One name lookup for both the feed and the top-callers card. Read-only:
  // the name on file is shown, but phone history never links INTO the online
  // customer area — the two stay separate by design (Luigi 2026-08-22).
  const nameCustomerIds = Array.from(
    new Set([...recentCalls, ...topCallers].map((c) => c.customerId).filter((id): id is string => !!id)),
  );
  const customers = nameCustomerIds.length
    ? await prisma.customer.findMany({
        where: { restaurantId, id: { in: nameCustomerIds } },
        select: { id: true, name: true },
      })
    : [];
  const customerName = new Map(customers.map((c) => [c.id, c.name]));

  const summary = computeVoiceAnalytics({ calls, hoursRows, orders, range, timezone });

  return {
    ...summary,
    topCallers: topCallers.map((r) => ({ ...r, name: r.customerId ? customerName.get(r.customerId) ?? null : null })),
    recent: recentCalls.map((c) => ({
      id: c.id,
      startedAt: c.startedAt,
      fromNumber: c.fromNumber,
      outcome: c.outcome,
      durationSeconds: c.durationSeconds,
      sentiment: c.sentiment,
      orderNumber: c.orderNumber,
      customerName: c.customerId ? customerName.get(c.customerId) ?? null : null,
      total: c.orderNumber ? collectedByNumber.get(c.orderNumber) ?? null : null,
    })),
  };
}

/**
 * Month-to-date COLLECTED revenue from voice-placed orders (the "You've made
 * $X this month with Nabil AI" headline). Calendar month in the restaurant's
 * timezone.
 */
export async function fetchVoiceMonthRevenue(
  restaurantId: string,
  timezone: string | null,
): Promise<number> {
  const { default: prisma } = await import("@/lib/db");
  const { parseLocalDateTimeInTz } = await import("@/lib/restaurant-hours");

  const tz = timezone ?? undefined;
  const monthStartKey = `${localDayKey(new Date(), tz).slice(0, 7)}-01`;
  const from = parseLocalDateTimeInTz(monthStartKey, 0, 0, tz);

  const calls = await prisma.voiceCall.findMany({
    where: { restaurantId, startedAt: { gte: from }, orderNumber: { not: null } },
    select: { orderNumber: true },
    take: CALL_FETCH_CAP,
  });
  const orderNumbers = Array.from(
    new Set(calls.map((c) => c.orderNumber).filter((n): n is string => !!n)),
  );
  if (orderNumbers.length === 0) return 0;

  const orders = await prisma.order.findMany({
    where: {
      restaurantId,
      status: REPORT_ORDER_STATUS_WHERE.status,
      orderNumber: { ...REPORT_ORDER_STATUS_WHERE.orderNumber, in: orderNumbers },
    },
    select: { total: true, creditApplied: true },
  });
  return Math.round(orders.reduce((s, o) => s + collectedOf(o), 0) * 100) / 100;
}

/**
 * Range-scoped upsell revenue in CENTS — THE one seam for every "Upsell
 * revenue" figure (Overview KPI via computeVoiceAnalytics, Upsells tab
 * mini-stat via this fetcher) so the two can never disagree. Same rule as
 * `revenue`: only calls whose linked order survives REPORT_ORDER_STATUS_WHERE
 * count, because VoiceCall.upsellCents is stamped once at call time and never
 * revisited when the kitchen later rejects/cancels the order.
 */
export async function fetchUpsellRevenueCents(
  restaurantId: string,
  range: { from: Date; to: Date },
): Promise<number> {
  const { default: prisma } = await import("@/lib/db");

  const calls = await prisma.voiceCall.findMany({
    where: {
      restaurantId,
      startedAt: { gte: range.from, lte: range.to },
      upsellCents: { gt: 0 },
      orderNumber: { not: null },
    },
    select: { orderNumber: true, upsellCents: true },
    take: CALL_FETCH_CAP,
  });
  if (calls.length === 0) return 0;

  const orderNumbers = Array.from(
    new Set(calls.map((c) => c.orderNumber).filter((n): n is string => !!n)),
  );
  const orders = await prisma.order.findMany({
    where: {
      restaurantId,
      status: REPORT_ORDER_STATUS_WHERE.status,
      orderNumber: { ...REPORT_ORDER_STATUS_WHERE.orderNumber, in: orderNumbers },
    },
    select: { orderNumber: true },
  });
  const live = new Set(orders.map((o) => o.orderNumber));

  return calls.reduce(
    (sum, c) => sum + (c.orderNumber && live.has(c.orderNumber) ? c.upsellCents ?? 0 : 0),
    0,
  );
}

/* ──────────────────── most-ordered-by-phone (Overview) ─────────────────── */

/** One row of "what callers actually order". */
export type PopularPhoneItem = {
  /** Menu name as it was sold (OrderItem.name is the order-time snapshot, so a
   *  renamed item still reports under the name the caller was offered). */
  name: string;
  /** Units sold across surviving voice orders. */
  quantity: number;
  /** How many distinct voice orders contained it. */
  orders: number;
};

/** Aggregate order lines into a ranked "most ordered by phone" list. PURE so
 *  the ranking rules are unit-tested; the fetcher only supplies rows.
 *
 *  Deliberately counts UNITS and ORDERS, not money: an item's share of an
 *  order's money is not well defined once promos and store credit are applied
 *  (store credit is a tender, not income — see collected.ts), and the question
 *  this answers is "what should I put in Featured Upsells?", which is a
 *  popularity question. */
export function rankPopularItems(
  rows: Array<{ orderNumber: string; name: string; quantity: number }>,
  limit = 8,
): PopularPhoneItem[] {
  const byName = new Map<string, { quantity: number; orders: Set<string> }>();
  for (const r of rows) {
    const name = (r.name || "").trim();
    if (!name) continue;
    let e = byName.get(name);
    if (!e) {
      e = { quantity: 0, orders: new Set() };
      byName.set(name, e);
    }
    e.quantity += Math.max(0, Number(r.quantity) || 0);
    e.orders.add(r.orderNumber);
  }
  return [...byName.entries()]
    .map(([name, e]) => ({ name, quantity: e.quantity, orders: e.orders.size }))
    .sort((a, b) => b.quantity - a.quantity || b.orders - a.orders || a.name.localeCompare(b.name))
    .slice(0, Math.max(1, limit));
}

/**
 * What phone callers order most — the figure that tells an owner what to put in
 * Featured Upsells (Loman markets "most popular items"; we can be exact because
 * we own the order, not a POS mirror).
 *
 * Same join and same status filter as every other money figure on this page:
 * VoiceCall.orderNumber → Order (restaurant-scoped + REPORT_ORDER_STATUS_WHERE,
 * so a rejected or cancelled order stops counting) → OrderItem.
 */
export async function fetchPopularPhoneItems(
  restaurantId: string,
  range: { from: Date; to: Date },
  limit = 8,
): Promise<PopularPhoneItem[]> {
  const { default: prisma } = await import("@/lib/db");

  const calls = await prisma.voiceCall.findMany({
    where: {
      restaurantId,
      startedAt: { gte: range.from, lte: range.to },
      orderNumber: { not: null },
    },
    select: { orderNumber: true },
    take: CALL_FETCH_CAP,
  });
  const orderNumbers = Array.from(
    new Set(calls.map((c) => c.orderNumber).filter((n): n is string => !!n)),
  );
  if (!orderNumbers.length) return [];

  // One query, restaurant-scoped through the parent order. `take` is a hard
  // ceiling so a busy month can never load an unbounded line set.
  const lines = await prisma.orderItem.findMany({
    where: {
      order: {
        restaurantId,
        status: REPORT_ORDER_STATUS_WHERE.status,
        orderNumber: { ...REPORT_ORDER_STATUS_WHERE.orderNumber, in: orderNumbers },
      },
    },
    select: { name: true, quantity: true, order: { select: { orderNumber: true } } },
    take: 5000,
  });

  return rankPopularItems(
    lines.map((l) => ({ orderNumber: l.order.orderNumber, name: l.name, quantity: l.quantity })),
    limit,
  );
}
