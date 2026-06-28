/**
 * Pure evaluation for configurable Reward Dollars earn rules (no prisma →
 * unit-testable). The DB layer (src/lib/reward-earn.ts) loads the rules + order
 * context and calls these to decide which grants to make.
 *
 * Triggers:
 *   - "signup"      → flat credit when an account is created (optionally only
 *                     within a date-window campaign)
 *   - "first_order" → the customer's first completed order
 *   - "order_over"  → an order whose subtotal ≥ orderThreshold
 *   - "nth_order"   → every Nth completed order (nthInterval)
 *
 * Amount = flat earnAmount if set, else earnPercent of the order basis. Each
 * fired grant carries an idempotency reason `earn:<trigger>:<ruleId>` so the
 * ledger's unique([accountId, orderId, reason]) prevents any double-grant.
 * Luigi 2026-06-27.
 */
import { round2 } from "@/lib/reward-math";

export type EarnTrigger = "signup" | "first_order" | "order_over" | "nth_order";

export interface EarnRule {
  id: string;
  active: boolean;
  triggerType: string;
  earnAmount?: number | null;
  earnPercent?: number | null;
  orderThreshold?: number | null;
  nthInterval?: number | null;
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
}

const ms = (d: Date | string | number) => (d instanceof Date ? d.getTime() : new Date(d).getTime());

/** Is the rule active AND within its (optional) campaign window at instant `at`?
 *  A null window bound means open-ended on that side. */
export function isWindowActive(rule: EarnRule, at: Date): boolean {
  if (!rule.active) return false;
  const t = at.getTime();
  if (rule.startsAt != null && t < ms(rule.startsAt)) return false;
  if (rule.endsAt != null && t > ms(rule.endsAt)) return false;
  return true;
}

/** Credit a rule awards: flat earnAmount if positive, else earnPercent of basis. */
export function computeRuleAmount(rule: EarnRule, basis: number): number {
  if (rule.earnAmount != null && rule.earnAmount > 0) return round2(rule.earnAmount);
  if (rule.earnPercent != null && rule.earnPercent > 0) return round2(Math.max(0, basis) * (rule.earnPercent / 100));
  return 0;
}

/** Signup-trigger grants for a new account created at `at`. Signup has no order
 *  basis, so only flat earnAmount rules pay out. */
export function signupGrantsFor(rules: EarnRule[], at: Date): Array<{ ruleId: string; amount: number; reason: string }> {
  const out: Array<{ ruleId: string; amount: number; reason: string }> = [];
  for (const r of rules) {
    if (r.triggerType !== "signup") continue;
    if (!isWindowActive(r, at)) continue;
    const amount = r.earnAmount != null && r.earnAmount > 0 ? round2(r.earnAmount) : 0;
    if (amount > 0) out.push({ ruleId: r.id, amount, reason: `earn:signup:${r.id}` });
  }
  return out;
}

export interface OrderEarnContext {
  at: Date;
  basis: number;               // subtotal − discounts (for percent rules)
  orderSubtotal: number;       // pre-discount subtotal (for order_over threshold)
  completedOrderCount: number; // count INCLUDING this order (their Nth order)
}

/** Order-completion grants from first_order / order_over / nth_order rules. */
export function orderEarnGrantsFor(
  rules: EarnRule[],
  ctx: OrderEarnContext,
): Array<{ ruleId: string; triggerType: string; amount: number; reason: string }> {
  const out: Array<{ ruleId: string; triggerType: string; amount: number; reason: string }> = [];
  for (const r of rules) {
    if (!isWindowActive(r, ctx.at)) continue;
    let matches = false;
    switch (r.triggerType) {
      case "first_order":
        matches = ctx.completedOrderCount === 1;
        break;
      case "order_over":
        matches = r.orderThreshold != null && ctx.orderSubtotal >= r.orderThreshold;
        break;
      case "nth_order":
        matches = !!r.nthInterval && r.nthInterval > 0 && ctx.completedOrderCount % r.nthInterval === 0;
        break;
      default:
        matches = false; // "signup" handled separately; unknown types ignored
    }
    if (!matches) continue;
    const amount = computeRuleAmount(r, ctx.basis);
    if (amount > 0) out.push({ ruleId: r.id, triggerType: r.triggerType, amount, reason: `earn:${r.triggerType}:${r.id}` });
  }
  return out;
}
