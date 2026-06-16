/**
 * FREE-plan order cap enforcement.
 *
 * Every restaurant lands on the FREE plan by default and is limited to
 * 100 orders per calendar month — table reservations count toward the SAME
 * pool (Luigi 2026-06-14). Restaurants with ANY active paid add-on
 * are exempt — that's the deal: pay for a feature, get unlimited orders
 * thrown in. The dedicated `unlimited_orders` add-on at $14.99/mo is for
 * restaurants who want the cap lifted without committing to a feature
 * subscription (e.g. cash-only restaurants who don't need card_payments).
 *
 * Counter mechanics:
 *   - `currentMonthOrderCount` increments on every successful
 *     /api/orders POST (called from checkOrderCap → markOrderForCap).
 *   - `currentMonthResetAt` is the FIRST of the next calendar month
 *     (UTC). On every check, if `now >= resetAt` we lazy-reset the
 *     counter to 0 and bump resetAt forward by one month. No cron
 *     needed — rollover happens on the first order of the new month.
 *   - Counter increments for ALL restaurants (free or paid) so we
 *     have honest order-volume data, but enforcement only blocks
 *     restaurants who are actually on the FREE-no-add-on combination.
 *
 * Race safety:
 *   The two-step (read → check → increment) has an inherent race —
 *   two simultaneous orders could both see 99 and both pass. Acceptable
 *   slop. 100 isn't a hard regulatory cap; an occasional 101 is fine.
 *   At higher contention we'd need a SQL-level conditional update;
 *   not worth the complexity at launch.
 */

import prisma from "@/lib/db";
import { hasAnyPaidAddOn } from "@/lib/entitlements";

export const FREE_PLAN_MONTHLY_CAP = 100;

/** Returns the first day of the calendar month AFTER the given date,
 *  at 00:00 UTC. Used as the next-reset timestamp. */
function nextMonthStartUtc(from: Date): Date {
  const next = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return next;
}

export type CapCheckResult =
  | { allowed: true; currentCount: number; cap: number; reason: "exempt_paid_addon" | "under_cap" }
  | { allowed: false; currentCount: number; cap: number; reason: "cap_reached" };

/**
 * Determine whether a restaurant is allowed to receive a new order
 * RIGHT NOW under the FREE-plan cap. Does NOT increment the counter —
 * the caller commits the increment via `incrementOrderCount()` once the
 * order has actually been written. Splitting check + increment keeps
 * the caller honest about pre-flight rejection.
 *
 * Lazy-resets the counter if we've crossed into a new calendar month.
 */
export async function checkOrderCap(restaurantId: string): Promise<CapCheckResult> {
  // Exempt: any active paid add-on lifts the cap. We use the cheap
  // helper from src/lib/entitlements.ts; reads the restaurant's
  // RestaurantAddOn rows once.
  if (await hasAnyPaidAddOn(restaurantId)) {
    // Still surface usage for analytics, but `allowed` is unconditional.
    const r = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { currentMonthOrderCount: true },
    });
    return {
      allowed: true,
      currentCount: r?.currentMonthOrderCount ?? 0,
      cap: FREE_PLAN_MONTHLY_CAP,
      reason: "exempt_paid_addon",
    };
  }

  const r = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { currentMonthOrderCount: true, currentMonthResetAt: true },
  });
  if (!r) {
    // Caller will fail the order for other reasons; behave permissively.
    return { allowed: true, currentCount: 0, cap: FREE_PLAN_MONTHLY_CAP, reason: "under_cap" };
  }

  // Rollover: if we've crossed into a new month, reset the counter
  // BEFORE checking. We do this with a single update so the check is
  // race-safe across page navigations within the same restaurant.
  const now = new Date();
  let effectiveCount = r.currentMonthOrderCount;
  if (!r.currentMonthResetAt || now >= r.currentMonthResetAt) {
    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        currentMonthOrderCount: 0,
        currentMonthResetAt: nextMonthStartUtc(now),
        // New month → re-arm the owner cap-notifications.
        capWarn80SentAt: null,
        capBlockAlertSentAt: null,
      },
    });
    effectiveCount = 0;
  }

  if (effectiveCount >= FREE_PLAN_MONTHLY_CAP) {
    return {
      allowed: false,
      currentCount: effectiveCount,
      cap: FREE_PLAN_MONTHLY_CAP,
      reason: "cap_reached",
    };
  }
  return {
    allowed: true,
    currentCount: effectiveCount,
    cap: FREE_PLAN_MONTHLY_CAP,
    reason: "under_cap",
  };
}

/**
 * Atomically increment the restaurant's order count. Called from
 * /api/orders POST immediately after the Order row is created.
 * Also handles the lazy monthly reset (in case checkOrderCap wasn't
 * called for some reason — e.g. an exempt restaurant skipping the
 * cap check entirely). Fire-and-forget safe — if this fails we
 * tolerate the dropped count rather than failing the order.
 */
export async function incrementOrderCount(restaurantId: string): Promise<number> {
  try {
    const now = new Date();
    const r = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { currentMonthResetAt: true },
    });
    if (!r) return 0;
    if (!r.currentMonthResetAt || now >= r.currentMonthResetAt) {
      // Rollover + this order is the first of the new month. Re-arm the owner
      // cap-notification guards so they can fire again this month.
      await prisma.restaurant.update({
        where: { id: restaurantId },
        data: {
          currentMonthOrderCount: 1,
          currentMonthResetAt: nextMonthStartUtc(now),
          capWarn80SentAt: null,
          capBlockAlertSentAt: null,
        },
      });
      return 1;
    }
    const updated = await prisma.restaurant.update({
      where: { id: restaurantId },
      data: { currentMonthOrderCount: { increment: 1 } },
      select: { currentMonthOrderCount: true },
    });
    return updated.currentMonthOrderCount;
  } catch (e) {
    console.error("[order-cap] incrementOrderCount failed:", e);
    // Swallow — order already exists; analytics may be off by one. Return 0 so
    // the caller's threshold check stays inert (no spurious notification).
    return 0;
  }
}

/**
 * For the admin UI: returns the current usage state so a banner can
 * render the right warning level. Includes whether the restaurant is
 * cap-exempt (any paid add-on). Read-only — no rollover.
 */
export async function getOrderCapUsage(restaurantId: string): Promise<{
  count: number;
  cap: number;
  exempt: boolean;
  resetAt: Date | null;
  /** "ok" (<80), "warning" (80-99), "cap_reached" (>=100). Always "ok" when exempt. */
  level: "ok" | "warning" | "cap_reached";
}> {
  const [r, exempt] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { currentMonthOrderCount: true, currentMonthResetAt: true },
    }),
    hasAnyPaidAddOn(restaurantId),
  ]);
  const count = r?.currentMonthOrderCount ?? 0;
  const resetAt = r?.currentMonthResetAt ?? null;
  let level: "ok" | "warning" | "cap_reached" = "ok";
  if (!exempt) {
    if (count >= FREE_PLAN_MONTHLY_CAP) level = "cap_reached";
    else if (count >= 80) level = "warning";
  }
  return { count, cap: FREE_PLAN_MONTHLY_CAP, exempt, resetAt, level };
}
