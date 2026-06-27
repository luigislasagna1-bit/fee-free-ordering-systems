/**
 * Pure money math for Reward Dollars — no prisma, so it's unit-testable in
 * isolation. Used by reward-ledger.ts (DB layer) + the checkout preview.
 */
export const round2 = (n: number) => Math.round(n * 100) / 100;

/** How much credit to apply toward an order — clamped to balance, order total,
 *  and the max-% cap; honouring a minimum balance and a processor min-charge
 *  floor on the residual. Returns 0 + a reason code when nothing applies. */
export function computeApplied(o: {
  requested: number;
  balance: number;
  orderTotal: number;
  minRedeemBalance: number;
  maxRedeemPercent: number;
  minCharge?: number;
}): { applied: number; code?: "below_min" | "noop" } {
  const { balance, orderTotal } = o;
  if (!(balance > 0) || !(orderTotal > 0)) return { applied: 0, code: "noop" };
  if (balance < o.minRedeemBalance) return { applied: 0, code: "below_min" };
  const maxByPct = o.maxRedeemPercent > 0 ? orderTotal * (o.maxRedeemPercent / 100) : orderTotal;
  let applied = round2(Math.min(Math.max(0, o.requested), balance, orderTotal, maxByPct));
  const minCharge = o.minCharge ?? 0;
  if (minCharge > 0 && applied > 0) {
    const residual = round2(orderTotal - applied);
    if (residual > 0 && residual < minCharge) {
      // Don't leave a sub-minimum residual on the card: either fully cover the
      // order (if balance + cap allow), or leave exactly the floor.
      if (balance >= orderTotal && orderTotal <= maxByPct) applied = round2(orderTotal);
      else applied = Math.max(0, round2(orderTotal - minCharge));
    }
  }
  if (applied <= 0) return { applied: 0, code: "noop" };
  return { applied };
}
