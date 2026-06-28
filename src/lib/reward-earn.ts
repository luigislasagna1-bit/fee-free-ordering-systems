/**
 * DB layer for configurable Reward Dollars earn rules (Program 3 expansion,
 * 2026-06-27). Loads a restaurant's RewardEarnRules + order/customer context and
 * grants the matching credit via the reward ledger. Every function is try/caught
 * and NEVER throws on the hot path (a reward-DB hiccup must never fail an order or
 * a signup). Idempotent: each grant uses reason `earn:<trigger>:<ruleId>` + the
 * order id (or `signup:<customerId>`), so the ledger's unique constraint blocks
 * any double-grant.
 *
 * This is ADDITIVE to the base %-back (Restaurant.rewardEarn*, granted by
 * awardForOrder with reason "earn") and the flat signup bonus
 * (Restaurant.rewardSignupBonus, reason "signup_bonus").
 */
import prisma from "@/lib/db";
import { grant } from "@/lib/reward-ledger";
import { signupGrantsFor, orderEarnGrantsFor, type EarnRule } from "@/lib/reward-rules";

async function activeRules(restaurantId: string): Promise<EarnRule[]> {
  return prisma.rewardEarnRule.findMany({
    where: { restaurantId, active: true },
    select: {
      id: true, active: true, triggerType: true, earnAmount: true, earnPercent: true,
      orderThreshold: true, nthInterval: true, startsAt: true, endsAt: true,
    },
  });
}

/** Signup-campaign grants for a newly created account (additive to the flat
 *  rewardSignupBonus). Fire-and-forget; never throws. */
export async function grantSignupRules(opts: { restaurantId: string; customerId: string; rewardsEnabled: boolean }): Promise<void> {
  try {
    if (!opts.rewardsEnabled) return;
    const rules = await activeRules(opts.restaurantId);
    const grants = signupGrantsFor(rules, new Date());
    for (const g of grants) {
      await grant({
        restaurantId: opts.restaurantId,
        customerId: opts.customerId,
        amount: g.amount,
        reason: g.reason,
        orderId: `signup:${opts.customerId}`,
      });
    }
  } catch (e) {
    console.error("[reward grantSignupRules]", e);
  }
}

/** Order-completion grants from first_order / order_over / nth_order rules.
 *  Idempotent per (order, rule). Never throws. */
export async function awardEarnRulesForOrder(opts: { orderId: string }): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: opts.orderId },
      select: {
        restaurantId: true, customerId: true, subtotal: true, couponDiscount: true,
        promoDiscount: true, completedAt: true,
        restaurant: { select: { rewardsEnabled: true } },
      },
    });
    if (!order?.customerId || !order.restaurant?.rewardsEnabled) return;

    const rules = await activeRules(order.restaurantId);
    if (rules.length === 0) return;

    // Their Nth completed order (this one included). Cheap count; for the rare
    // case of several of one customer's orders completing in a single sweep the
    // rank can tie — acceptable for promotional bonuses (v1).
    const completedOrderCount = await prisma.order.count({
      where: { customerId: order.customerId, status: "completed" },
    });

    const basis = Math.max(0, Math.round(((order.subtotal ?? 0) - (order.couponDiscount ?? 0) - (order.promoDiscount ?? 0)) * 100) / 100);
    const grants = orderEarnGrantsFor(rules, {
      at: order.completedAt ?? new Date(),
      basis,
      orderSubtotal: order.subtotal ?? 0,
      completedOrderCount,
    });

    for (const g of grants) {
      await grant({
        restaurantId: order.restaurantId,
        customerId: order.customerId,
        amount: g.amount,
        reason: g.reason,
        orderId: opts.orderId,
        note: g.triggerType,
      });
    }
  } catch (e) {
    console.error("[reward awardEarnRulesForOrder]", e);
  }
}
