/**
 * THE definition of "money the restaurant actually collected".
 *
 * Store credit ("Reward Dollars" — "Luigi Bucks" at Luigi's) is a **TENDER, not
 * income**. When a customer pays with credit, the restaurant hands over food but
 * receives no cash or card money for that portion. `Order.total` deliberately
 * stays the FULL order value (so tax, receipts and refunds stay intact) and the
 * credit is recorded separately in `Order.creditApplied`:
 *
 *     orderValue  = Order.total                  ← what the food was worth
 *     creditSpent = Order.creditApplied          ← paid with Luigi Bucks
 *     collected   = orderValue − creditSpent     ← real cash/card income
 *
 * Before 2026-08-07 only three surfaces got this right (`summary-rows.ts`,
 * `digests.ts`, the orders CSV export) while every dashboard, KPI and
 * customer-spend figure used a bare `_sum: { total: true }` and therefore
 * counted redeemed credit as revenue. This module is the single seam so the two
 * accounting models can never drift apart again.
 *
 * RULE: never write `total - creditApplied` by hand anywhere else — call
 * `collectedOf` / `splitMoney`. Double-subtracting credit somewhere that already
 * subtracts it is the one way this change can produce a wrong number.
 *
 * Pure module (no Prisma import) so it is unit-testable and safe on the client.
 */

/** Money rows always round to cents the same way the order route does. */
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Prisma `select` fragment for anything that needs the collected figure. */
export const MONEY_SELECT = { total: true, creditApplied: true } as const;

/** Prisma `_sum` fragment for `aggregate` / `groupBy`. */
export const MONEY_SUM = { total: true, creditApplied: true } as const;

export type MoneyRow = { total: number | null; creditApplied?: number | null };

/** Real cash/card collected on ONE order. Never negative. */
export function collectedOf(o: MoneyRow): number {
  return round2(Math.max(0, (o.total ?? 0) - (o.creditApplied ?? 0)));
}

export type MoneySplit = {
  /** Gross value of the orders — what the food was worth. */
  orderValue: number;
  /** Store credit redeemed across them — a tender, never income. */
  creditSpent: number;
  /** orderValue − creditSpent. The income headline. */
  collected: number;
};

export const EMPTY_SPLIT: MoneySplit = { orderValue: 0, creditSpent: 0, collected: 0 };

/** Split a set of orders into the three figures shown side by side. */
export function splitMoney(rows: readonly MoneyRow[]): MoneySplit {
  let orderValue = 0;
  let creditSpent = 0;
  for (const r of rows) {
    orderValue += r.total ?? 0;
    creditSpent += r.creditApplied ?? 0;
  }
  return finalizeSplit(orderValue, creditSpent);
}

/**
 * Same three figures from an already-summed pair — for `aggregate`/`groupBy`
 * results where the rows were never materialized.
 */
export function splitFromSums(totalSum: number | null, creditSum: number | null): MoneySplit {
  return finalizeSplit(totalSum ?? 0, creditSum ?? 0);
}

function finalizeSplit(orderValue: number, creditSpent: number): MoneySplit {
  const gross = round2(orderValue);
  const credit = round2(Math.min(Math.max(0, creditSpent), Math.max(0, gross)));
  return { orderValue: gross, creditSpent: credit, collected: round2(Math.max(0, gross - credit)) };
}

/** Sum two splits (per-location roll-ups, per-day buckets). */
export function addSplit(a: MoneySplit, b: MoneySplit): MoneySplit {
  return finalizeSplit(a.orderValue + b.orderValue, a.creditSpent + b.creditSpent);
}

/**
 * Whether to surface the credit breakdown at all.
 *
 * Restaurants that never ran a rewards program must see byte-identical reports
 * to before this change — so the extra columns/rows appear only once real credit
 * has been redeemed in the window. Mirrors the `showCredit` gate the orders CSV
 * export has used since it shipped.
 */
export function showsCredit(split: MoneySplit): boolean {
  return split.creditSpent > 0;
}
