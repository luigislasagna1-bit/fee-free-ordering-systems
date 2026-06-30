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
import { round2 } from "@/lib/reward-math";
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
        id: true, restaurantId: true, customerId: true, subtotal: true, couponDiscount: true,
        promoDiscount: true, completedAt: true, createdAt: true,
        restaurant: { select: { rewardsEnabled: true } },
      },
    });
    if (!order?.customerId || !order.restaurant?.rewardsEnabled) return;

    const rules = await activeRules(order.restaurantId);
    if (rules.length === 0) return;

    // This order's RANK among the customer's completed orders (1 = first), ranked
    // by createdAt (immutable) so it's stable even when the Simple-mode cron
    // completes several of one customer's orders in a single sweep (counting all
    // "completed" rows would make every order in the batch see the same total →
    // first_order missed / nth_order over-granted; review 2026-06-27). Tie-break
    // on id for the rare same-instant case.
    const completedOrderCount = 1 + await prisma.order.count({
      where: {
        customerId: order.customerId,
        status: "completed",
        id: { not: order.id },
        OR: [
          { createdAt: { lt: order.createdAt } },
          { createdAt: order.createdAt, id: { lt: order.id } },
        ],
      },
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

/** Projected earn for an order that hasn't been completed yet — what the
 *  customer WILL earn when it completes (base %-back + matching earn rules).
 *  Read-only, never grants, never throws. Used to print "you earned X" on a
 *  receipt produced at order/acceptance time, before the completion hook runs.
 *  Returns 0 when earning is off / no customer / basis ≤ 0. Luigi 2026-06-29. */
export async function projectOrderEarn(orderId: string): Promise<number> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        restaurantId: true, customerId: true, subtotal: true, couponDiscount: true,
        promoDiscount: true, createdAt: true, completedAt: true,
        restaurant: {
          select: {
            rewardsEnabled: true, rewardEarnEnabled: true, rewardEarnMode: true,
            rewardEarnPercent: true, rewardEarnPerDollar: true,
          },
        },
      },
    });
    if (!order?.customerId || !order.restaurant?.rewardsEnabled) return 0;
    const basis = Math.max(0, round2((order.subtotal ?? 0) - (order.couponDiscount ?? 0) - (order.promoDiscount ?? 0)));
    if (basis <= 0) return 0;

    const r = order.restaurant;
    let total = 0;
    // Base %-back (mirrors awardForOrder).
    if (r.rewardEarnEnabled) {
      total += round2(r.rewardEarnMode === "per_dollar" ? basis * (r.rewardEarnPerDollar ?? 0) : basis * ((r.rewardEarnPercent ?? 0) / 100));
    }
    // Rule bonuses (first/order_over/nth) — same rank logic as awardEarnRulesForOrder.
    const rules = await activeRules(order.restaurantId);
    if (rules.length) {
      const completedOrderCount = 1 + await prisma.order.count({
        where: {
          customerId: order.customerId, status: "completed", id: { not: orderId },
          OR: [{ createdAt: { lt: order.createdAt } }, { createdAt: order.createdAt, id: { lt: orderId } }],
        },
      });
      const grants = orderEarnGrantsFor(rules, {
        at: order.completedAt ?? new Date(),
        basis, orderSubtotal: order.subtotal ?? 0, completedOrderCount,
      });
      for (const g of grants) total += g.amount;
    }
    return round2(total);
  } catch (e) {
    console.error("[reward projectOrderEarn]", e);
    return 0;
  }
}

/** Grants from "reward_credit" PROMOTIONS that fired on this order (earn via a
 *  special). Reads the order's appliedPromos snapshot — the promo's presence
 *  there proves it qualified at order time — and grants ruleConfig.creditAmount.
 *  Idempotent per (order, promo). Never throws. Luigi 2026-06-27. */
export async function awardPromoCreditsForOrder(opts: { orderId: string }): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: opts.orderId },
      select: {
        restaurantId: true, customerId: true, appliedPromos: true,
        restaurant: { select: { rewardsEnabled: true } },
      },
    });
    if (!order?.customerId || !order.restaurant?.rewardsEnabled || !order.appliedPromos) return;

    let promos: Array<{ promoId?: string; type?: string }> = [];
    try { promos = JSON.parse(order.appliedPromos); } catch { return; }
    const creditPromoIds = promos.filter((p) => p.type === "reward_credit" && p.promoId).map((p) => p.promoId!);
    if (creditPromoIds.length === 0) return;

    for (const promoId of creditPromoIds) {
      const promo = await prisma.promotion.findUnique({ where: { id: promoId }, select: { ruleConfig: true } });
      const rc = (promo?.ruleConfig as any) ?? {};
      const amount = Math.max(0, Math.round((Number(rc.creditAmount) || 0) * 100) / 100);
      if (amount <= 0) continue;
      await grant({
        restaurantId: order.restaurantId,
        customerId: order.customerId,
        amount,
        reason: `promo:${promoId}`,
        orderId: opts.orderId,
        note: "promo",
      });
    }
  } catch (e) {
    console.error("[reward awardPromoCreditsForOrder]", e);
  }
}
