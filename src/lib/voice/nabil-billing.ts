/**
 * Nabil AI pricing — PURE math, no prisma / stripe imports (unit-tested in
 * nabil-billing.test.ts; safe to import from client components).
 *
 * Luigi's price (2026-08-16, OWNER-ACTIONS A64 (d)):
 *   US$0.60 per call-minute, US$249.99 per month MINIMUM, whichever is higher
 *   ⇒ monthly charge = max(24999¢, minutes × 60¢).
 *
 * How the two halves are collected:
 *   • the US$249.99 minimum  = the `phone_ordering` add-on's Stripe subscription
 *     (charged in advance on the restaurant's own billing anchor);
 *   • the overage            = ONE Stripe invoice item per restaurant per closed
 *     CALENDAR MONTH (UTC), created by /api/cron/nabil-usage-billing on the 1st
 *     and recorded in NabilUsageCharge (src/lib/voice/nabil-usage-billing.ts).
 *
 * Billing period = the UTC calendar month. RestaurantAddOn only stores
 * currentPeriodEnd (not the start), the cron runs once for everybody, and the
 * Overview tile must show the SAME window the cron will bill — so both read
 * `monthWindowUtc()` here. (Anchor-period metering would need Stripe's
 * invoice.created hook per subscription; documented seam, not built.)
 *
 * Rounding rule: EVERY call is rounded UP to the next whole minute (a 61 s call
 * bills 2 minutes; a 0 s / null-duration call bills 0). Minutes are summed per
 * call, never on the month's total seconds.
 */

/** US$0.60 per call-minute. */
export const NABIL_PER_MINUTE_CENTS = 60;
/** US$249.99 per month minimum. */
export const NABIL_MONTHLY_MIN_CENTS = 24999;
/** Minutes the monthly minimum "includes" before overage starts:
 *  floor(24999 / 60) = 416 (416 × 60¢ = 24960¢ ≤ 24999¢; the 417th minute
 *  makes 25020¢ > 24999¢ and is the first billable overage minute). */
export const NABIL_INCLUDED_MINUTES = Math.floor(NABIL_MONTHLY_MIN_CENTS / NABIL_PER_MINUTE_CENTS);
/** Length of the one-time member demo (see src/lib/voice/nabil-trial.ts). */
export const NABIL_DEMO_DAYS = 7;

/** Billed minutes for ONE call: ceil(seconds / 60); 0 for null / ≤ 0. */
export function billedMinutes(durationSeconds: number | null | undefined): number {
  if (durationSeconds == null || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
  return Math.ceil(durationSeconds / 60);
}

/** Sum of per-call billed minutes (each call rounded UP individually). */
export function billedMinutesForCalls(durations: ReadonlyArray<number | null | undefined>): number {
  let total = 0;
  for (const d of durations) total += billedMinutes(d);
  return total;
}

/** The month's charge in cents: max(minimum, minutes × per-minute). */
export function monthlyChargeCents(minutes: number): number {
  const m = Math.max(0, Math.floor(minutes));
  return Math.max(NABIL_MONTHLY_MIN_CENTS, m * NABIL_PER_MINUTE_CENTS);
}

/** Overage in cents = the part of the month's charge above the minimum
 *  (what the usage-billing cron invoices). 0 up to and including 416 min. */
export function overageCents(minutes: number): number {
  return monthlyChargeCents(minutes) - NABIL_MONTHLY_MIN_CENTS;
}

/** Minutes above the included allowance (display only — money uses overageCents). */
export function overageMinutes(minutes: number): number {
  return Math.max(0, Math.floor(minutes) - NABIL_INCLUDED_MINUTES);
}

/** First moment (UTC) of the calendar month containing `d`. */
export function monthStartUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** First moment (UTC) of the calendar month AFTER the one containing `d`. */
export function nextMonthStartUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}

/** First moment (UTC) of the calendar month BEFORE the one containing `d`. */
export function previousMonthStartUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
}

/** [start, end) of the UTC calendar month containing `d` — THE billing window
 *  shared by the Overview tile and the overage cron. */
export function monthWindowUtc(d: Date): { start: Date; end: Date } {
  return { start: monthStartUtc(d), end: nextMonthStartUtc(d) };
}

/** "YYYY-MM" (UTC) — NabilUsageCharge.period + the Stripe idempotency key. */
export function periodKey(monthStart: Date): string {
  return monthStart.toISOString().slice(0, 7);
}

/** Parse "YYYY-MM" → the month's UTC start, or null when malformed. */
export function parsePeriodKey(s: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})$/.exec(s ?? "");
  if (!m) return null;
  const y = Number(m[1]);
  const mon = Number(m[2]);
  if (mon < 1 || mon > 12) return null;
  return new Date(Date.UTC(y, mon - 1, 1));
}

/**
 * Linear month-end projection: minutes so far ÷ fraction of the month elapsed.
 * Before any of the month has elapsed (or with a degenerate window) the
 * projection is the minutes so far. Returns whole minutes (rounded).
 */
export function projectMonthEnd(
  minutesSoFar: number,
  now: Date,
  window: { start: Date; end: Date } = monthWindowUtc(now),
): number {
  const total = window.end.getTime() - window.start.getTime();
  const elapsed = Math.min(Math.max(now.getTime() - window.start.getTime(), 0), total);
  const m = Math.max(0, minutesSoFar);
  if (total <= 0 || elapsed <= 0) return Math.round(m);
  if (elapsed >= total) return Math.round(m);
  return Math.round(m * (total / elapsed));
}

/** Everything the Overview tile shows, from the month's minutes + "now". */
export function meterSummary(minutesSoFar: number, now: Date, window: { start: Date; end: Date } = monthWindowUtc(now)) {
  const projectedMinutes = projectMonthEnd(minutesSoFar, now, window);
  return {
    minutes: Math.max(0, Math.floor(minutesSoFar)),
    includedMinutes: NABIL_INCLUDED_MINUTES,
    overageMinutes: overageMinutes(minutesSoFar),
    chargeSoFarCents: monthlyChargeCents(minutesSoFar),
    projectedMinutes,
    projectedChargeCents: monthlyChargeCents(projectedMinutes),
    perMinuteCents: NABIL_PER_MINUTE_CENTS,
    monthlyMinCents: NABIL_MONTHLY_MIN_CENTS,
  };
}

/** Platform prices are USD (src/lib/marketplace.ts PLATFORM_CURRENCY). Shown
 *  with an explicit "US$" so a CAD/EUR restaurant never mistakes it for its own
 *  currency. */
export function formatUsdCents(cents: number): string {
  return `US$${(cents / 100).toFixed(2)}`;
}
