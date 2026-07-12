/**
 * Dunning / failed-payment grace period (Luigi 2026-06-15).
 *
 * When a subscription charge fails we do NOT cut service. Instead we start a
 * GRACE clock: paid features stay on (see grantingAddOnWhere in
 * src/lib/entitlements.ts), and a daily cron (/api/cron/dunning) nudges the
 * owner — and their reseller, if any — with a countdown. When the clock
 * expires the paid features drop automatically (the entitlement query stops
 * matching the past_due rows once graceEndsAt passes); the free tier keeps
 * working so the restaurant never loses the ability to take orders.
 *
 * The clock lives at TWO levels, set together on failure:
 *   - Restaurant.{dunningStartedAt, graceEndsAt, lastDunnedOn} — the coarse
 *     "this restaurant has a billing problem" flag that drives the cron +
 *     the day-X-of-N countdown + the admin banner.
 *   - RestaurantAddOn.graceEndsAt — per add-on, the source of truth the
 *     entitlement check reads so each failed add-on's features stay granted
 *     until ITS grace expires (denormalized so the hot path is one flat read).
 */

// NOTE: prisma is lazily imported inside the DB helpers below (not at module
// top) so the pure countdown helpers — graceDeadline / daysLeft / dayStamp —
// can be imported in unit tests without pulling in the Prisma client (which
// throws at import when DATABASE_URL is unset, e.g. under vitest).

/** Grace window length, in days, before paid features drop. GloriaFood-style
 *  10 days (Luigi 2026-06-15). Single source of truth — used by the webhooks,
 *  the cron, and the countdown copy. */
export const GRACE_DAYS = 10;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The moment grace expires, GRACE_DAYS after `from`. */
export function graceDeadline(from: Date = new Date()): Date {
  return new Date(from.getTime() + GRACE_DAYS * DAY_MS);
}

/** Whole days remaining (0..GRACE_DAYS) until paid features drop. Rounds UP so
 *  "11 hours left" still reads as "1 day left", never "0". */
export function daysLeft(graceEndsAt: Date, now: Date = new Date()): number {
  const ms = graceEndsAt.getTime() - now.getTime();
  if (ms <= 0) return 0;
  return Math.min(GRACE_DAYS, Math.ceil(ms / DAY_MS));
}

/** YYYY-MM-DD in UTC — the once-per-day idempotency key for the daily nudge
 *  (`Restaurant.lastDunnedOn`). UTC is fine: it only needs to change once per
 *  calendar day so a re-run of the cron the same day doesn't double-send. */
export function dayStamp(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Start (or preserve) the restaurant-level grace clock after a failed charge.
 * Idempotent: if a clock is already running we DON'T reset it — Stripe retries
 * and multiple failing subscriptions must not keep pushing the deadline out.
 * Returns true only when a NEW clock was started, so the caller can fire the
 * immediate "day 0" notice exactly once.
 */
export async function startRestaurantGrace(restaurantId: string): Promise<boolean> {
  const prisma = (await import("@/lib/db")).default;
  const r = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { graceEndsAt: true },
  });
  if (r?.graceEndsAt && r.graceEndsAt > new Date()) return false; // already running
  const now = new Date();
  await prisma.restaurant.update({
    where: { id: restaurantId },
    data: { dunningStartedAt: now, graceEndsAt: graceDeadline(now), lastDunnedOn: null },
  });
  return true;
}

/** Clear the restaurant-level grace clock on recovery (a successful charge). */
export async function clearRestaurantGrace(restaurantId: string): Promise<void> {
  const prisma = (await import("@/lib/db")).default;
  await prisma.restaurant.update({
    where: { id: restaurantId },
    data: { dunningStartedAt: null, graceEndsAt: null, lastDunnedOn: null },
  });
}

/**
 * Clear the restaurant-level grace clock ONLY when no billing problem remains:
 *   - the PLATFORM plan isn't past_due (Restaurant.subscriptionStatus), and
 *   - no add-on is still inside its own failed-payment grace window
 *     (status=past_due with a live graceEndsAt). A past_due row whose grace
 *     already EXPIRED is "downgraded" — its dunning story is over (features
 *     dropped, final notice sent) — so it must not hold the restaurant-level
 *     clock hostage forever.
 *
 * The clock is a COARSE "this restaurant has a billing problem" flag started
 * by ANY failed charge (platform plan or add-on). Clearing it on just any
 * paid invoice was wrong in both directions: an add-on renewal killed the
 * countdown for a past_due platform plan (and each later retry-failure
 * restarted a fresh clock, pushing the deadline out forever), while a
 * platform renewal killed the countdown — and the grace-expiry Multi-Location
 * cascade — for a still-failing add-on.
 *
 * Safe to call on ANY potential recovery (paid invoice, subscription status
 * flip, add-on cancellation): it no-ops with a single point read when no
 * clock is running. Returns true when the clock was actually cleared.
 */
export async function clearRestaurantGraceIfHealthy(restaurantId: string): Promise<boolean> {
  const prisma = (await import("@/lib/db")).default;
  const r = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { graceEndsAt: true, subscriptionStatus: true },
  });
  if (!r?.graceEndsAt) return false; // no clock running — nothing to clear
  if (r.subscriptionStatus === "past_due") return false; // platform plan still failing
  const failingAddOns = await prisma.restaurantAddOn.count({
    where: { restaurantId, status: "past_due", graceEndsAt: { gt: new Date() } },
  });
  if (failingAddOns > 0) return false; // an add-on is still inside its grace window
  await clearRestaurantGrace(restaurantId);
  return true;
}

/** Per-add-on billing health for the in-context admin notices (Luigi 2026-06-15).
 *  - active      → subscribed + paid (or no notice needed)
 *  - grace       → charge failed, still within the grace window (show countdown)
 *  - downgraded  → grace expired, paid features dropped for non-payment
 *  - inactive    → never subscribed, or voluntarily cancelled (no dunning notice) */
export type AddOnBillingState =
  | { state: "active" }
  | { state: "grace"; daysLeft: number; graceEndsAt: Date }
  | { state: "downgraded" }
  | { state: "inactive" };

/** Resolve the dunning state of ONE add-on for a restaurant, by add-on slug.
 *  Drives <AddOnBillingNotice> on each add-on's settings page so the owner sees
 *  exactly what happened to that feature and why. */
export async function getAddOnBillingState(
  restaurantId: string,
  addOnSlug: string,
): Promise<AddOnBillingState> {
  const prisma = (await import("@/lib/db")).default;
  const row = await prisma.restaurantAddOn.findFirst({
    where: { restaurantId, addOn: { slug: addOnSlug } },
    select: { status: true, graceEndsAt: true },
  });
  if (!row) return { state: "inactive" };
  if (row.status === "active" || row.status === "trialing") return { state: "active" };
  if (row.status === "past_due" && row.graceEndsAt) {
    const now = new Date();
    if (row.graceEndsAt > now) {
      return { state: "grace", daysLeft: daysLeft(row.graceEndsAt, now), graceEndsAt: row.graceEndsAt };
    }
    return { state: "downgraded" };
  }
  // cancelled / incomplete / past_due without a grace stamp → not a dunning state
  return { state: "inactive" };
}
