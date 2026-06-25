import type { Prisma } from "@/generated/prisma/client";

/**
 * The CANONICAL "this order really counts" predicate, shared by EVERY report
 * surface (Dashboard, Sales Summary/Trend, List View) so they can never
 * disagree with each other — or with the End-of-Day email.
 *
 * It matches `src/lib/digests.ts` (the End-of-Day engine), which is the most
 * battle-tested definition and the one owners already trust:
 *   - drops `rejected` + `cancelled` orders (never fulfilled / refunded away), and
 *   - drops `TEST-…` orders (owner/staff test orders that would inflate totals).
 *
 * Before this existed, reports filtered `status: "completed"` only while the
 * Dashboard "Orders" card counted EVERY status and EOD used `notIn`. Three
 * definitions → the headline never reconciled with the breakdown. Now there's
 * one. See the report bug Fabrizio raised (2026-06-24).
 */
export function reportOrderWhere(
  restaurantId: string,
  range: { from: Date; to: Date },
): Prisma.OrderWhereInput {
  return {
    restaurantId,
    createdAt: { gte: range.from, lte: range.to },
    status: { notIn: ["rejected", "cancelled"] },
    orderNumber: { not: { startsWith: "TEST-" } },
  };
}

/**
 * The status/test half of the predicate WITHOUT restaurant/date — for nesting
 * inside an `orderItem.groupBy({ where: { order: {...} } })` filter or composing
 * with a caller-supplied `createdAt`/relation clause.
 */
export const REPORT_ORDER_STATUS_WHERE = {
  status: { notIn: ["rejected", "cancelled"] },
  orderNumber: { not: { startsWith: "TEST-" } },
} satisfies Prisma.OrderWhereInput;
