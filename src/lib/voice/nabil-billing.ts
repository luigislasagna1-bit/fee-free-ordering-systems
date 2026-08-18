/**
 * Nabil AI pricing — PURE math, no prisma / stripe imports (unit-tested in
 * nabil-billing.test.ts; safe to import from client components).
 *
 * Luigi's price (2026-08-18):
 *   US$0.50 per minute of call time, BILLED BY THE SECOND (no rounding).
 *   US$249.99 per month MINIMUM, whichever is higher.
 *   ⇒ monthly charge = max(24999¢, ceil(seconds × 50 / 60)).
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
 * Billing granularity: PER SECOND. Call durations are summed in seconds with
 * no per-call rounding, then the total is converted to dollars at the
 * per-minute rate: ceil(totalSeconds × 50 / 60).
 */

/** US$0.50 per minute — the rate shown to customers and used for billing. */
export const NABIL_PER_MINUTE_CENTS = 50;
/** US$249.99 per month minimum. */
export const NABIL_MONTHLY_MIN_CENTS = 24999;
/** Seconds the monthly minimum "includes" before overage starts:
 *  floor(24999 × 60 / 50) = 29998 (≈ 499 min 58 sec). */
export const NABIL_INCLUDED_SECONDS = Math.floor(NABIL_MONTHLY_MIN_CENTS * 60 / NABIL_PER_MINUTE_CENTS);
/** Display-friendly included minutes: floor(29998 / 60) = 499. */
export const NABIL_INCLUDED_MINUTES = Math.floor(NABIL_INCLUDED_SECONDS / 60);
/** Length of the one-time member demo (see src/lib/voice/nabil-trial.ts). */
export const NABIL_DEMO_DAYS = 7;

/** Billable seconds for ONE call — just the raw duration, no rounding.
 *  Sub-second durations ceil to 1; null / ≤ 0 → 0. */
export function billedSeconds(durationSeconds: number | null | undefined): number {
  if (durationSeconds == null || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
  return Math.ceil(durationSeconds);
}

/** Sum of per-call billable seconds (no per-call rounding to minutes). */
export function billedSecondsForCalls(durations: ReadonlyArray<number | null | undefined>): number {
  let total = 0;
  for (const d of durations) total += billedSeconds(d);
  return total;
}

/** The month's charge in cents: max(minimum, ceil(seconds × 50/60)). */
export function monthlyChargeCents(seconds: number): number {
  const s = Math.max(0, Math.ceil(seconds));
  return Math.max(NABIL_MONTHLY_MIN_CENTS, Math.ceil(s * NABIL_PER_MINUTE_CENTS / 60));
}

/** Overage in cents = the part of the month's charge above the minimum
 *  (what the usage-billing cron invoices). 0 up to and including 24999 sec. */
export function overageCents(seconds: number): number {
  return monthlyChargeCents(seconds) - NABIL_MONTHLY_MIN_CENTS;
}

/** Seconds above the included allowance (display only — money uses overageCents). */
export function overageSeconds(seconds: number): number {
  return Math.max(0, Math.ceil(seconds) - NABIL_INCLUDED_SECONDS);
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
 * Linear month-end projection: seconds so far ÷ fraction of the month elapsed.
 * Before any of the month has elapsed (or with a degenerate window) the
 * projection is the seconds so far. Returns whole seconds (rounded).
 */
export function projectMonthEnd(
  secondsSoFar: number,
  now: Date,
  window: { start: Date; end: Date } = monthWindowUtc(now),
): number {
  const total = window.end.getTime() - window.start.getTime();
  const elapsed = Math.min(Math.max(now.getTime() - window.start.getTime(), 0), total);
  const s = Math.max(0, secondsSoFar);
  if (total <= 0 || elapsed <= 0) return Math.round(s);
  if (elapsed >= total) return Math.round(s);
  return Math.round(s * (total / elapsed));
}

/** Format seconds as "Xm Ys" for display. */
export function formatSecondsAsMinSec(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m === 0) return `${rem}s`;
  if (rem === 0) return `${m}m`;
  return `${m}m ${rem}s`;
}

/** Everything the Overview tile shows, from the month's seconds + "now". */
export function meterSummary(secondsSoFar: number, now: Date, window: { start: Date; end: Date } = monthWindowUtc(now)) {
  const projectedSeconds = projectMonthEnd(secondsSoFar, now, window);
  return {
    seconds: Math.max(0, Math.ceil(secondsSoFar)),
    minutes: Math.max(0, Math.floor(secondsSoFar / 60)),
    includedSeconds: NABIL_INCLUDED_SECONDS,
    includedMinutes: NABIL_INCLUDED_MINUTES,
    overageSeconds: overageSeconds(secondsSoFar),
    overageMinutes: Math.floor(overageSeconds(secondsSoFar) / 60),
    chargeSoFarCents: monthlyChargeCents(secondsSoFar),
    projectedSeconds,
    projectedChargeCents: monthlyChargeCents(projectedSeconds),
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
