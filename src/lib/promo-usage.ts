import prisma from "@/lib/db";

/**
 * Per-order promotion usage ledger helpers (Luigi 2026-06-30, B5).
 *
 * `Promotion.usedCount` stays the denormalised, hot-path cap counter that the
 * promo engine reads (`usedCount >= usageLimit`) and that the order route bumps
 * atomically at placement (`UPDATE ... WHERE usedCount < usageLimit`) to reject
 * a race-loser before charging. The `PromotionUsage` side-table records WHICH
 * order holds each bumped slot, so the give-back can be made idempotent and
 * independent of the promo's (mutable) cap — the two things a raw counter can't
 * do on its own. See the model doc in schema.prisma.
 */

/**
 * Record the usage rows for an order that just claimed one or more promo slots.
 * Call AFTER `order.create` (needs the real order id) and AFTER the counter was
 * already bumped in the order route. `skipDuplicates` keeps it safe against a
 * retry. Awaited by the caller so the rows land before the response returns
 * (serverless can tear the process down after the response).
 */
export async function writePromotionUsageRows(args: {
  orderId: string;
  restaurantId: string;
  promotionIds: string[];
}): Promise<void> {
  if (args.promotionIds.length === 0) return;
  await prisma.promotionUsage.createMany({
    data: args.promotionIds.map((promotionId) => ({
      promotionId,
      orderId: args.orderId,
      restaurantId: args.restaurantId,
    })),
    skipDuplicates: true,
  });
}

/**
 * Give back every promo usage slot an order holds — IDEMPOTENT and
 * CAP-INDEPENDENT. Deletes this order's usage rows and decrements `usedCount`
 * by exactly one per row ACTUALLY deleted (`DELETE ... RETURNING`), all in one
 * transaction so the row removal and the counter give-back can't drift apart.
 *
 * Why this shape:
 *  • Idempotent — a repeat or CONCURRENT kill (double-click, a manual reject
 *    racing the auto-reject cron, two cron runs) deletes nothing the second
 *    time, so `usedCount` is never double-decremented. The DB row lock on the
 *    DELETE serialises the racers. (Replaces the old raw counter decrement,
 *    whose exactly-once relied on fragile caller-side stale-status guards.)
 *  • Cap-independent — it keys off the ledger row, never the promo's current
 *    `usageLimit`, so an admin toggling a promo's cap mid-order can't desync the
 *    increment/decrement classification.
 *  • Floored — `GREATEST(0, ...)` keeps a stray double-release from ever driving
 *    the counter negative.
 *
 * Never throws (internally caught + logged) so it can't break a kill/cancel
 * flow — mirrors releaseCouponsForOrder / releaseRewardForOrder.
 */
export async function releasePromotionUsageForOrder(orderId: string): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      const deleted = await tx.$queryRaw<Array<{ promotionId: string }>>`
        DELETE FROM "PromotionUsage" WHERE "orderId" = ${orderId}
        RETURNING "promotionId"
      `;
      for (const row of deleted) {
        await tx.$executeRaw`
          UPDATE "Promotion" SET "usedCount" = GREATEST(0, "usedCount" - 1)
          WHERE id = ${row.promotionId}
        `;
      }
    });
  } catch (e) {
    console.error("[releasePromotionUsageForOrder]", e);
  }
}
