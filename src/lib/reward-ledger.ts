/**
 * Reward Dollars ledger (store-credit wallet, Program 3, 2026-06-27).
 *
 * Mirrors the coupon-ledger philosophy: an append-only `RewardLedger` is the
 * source of truth; the cached `RewardAccount.balance` is mutated ATOMICALLY;
 * money is consumed/earned on FULFILLMENT (completed order), released on
 * miss/reject. Everything here is try/caught and NEVER throws on the hot order
 * path — only `claimForOrder` can refuse, and it does so by returning a typed
 * result (so the caller proceeds at credit=0, never failing the order).
 *
 * Money is Float to match every other money column + the Math.round(x*100)/100
 * convention used throughout the order route. Credit is a PAYMENT, not a
 * discount — it never touches the tax base.
 *
 * The hard guarantees:
 *  - balance can never go negative (atomic `WHERE balance >= amount`).
 *  - exactly ≤1 spend AND ≤1 earn row per order per account
 *    (@@unique([accountId, orderId, reason])).
 */
import prisma from "@/lib/db";
import { round2, computeApplied } from "@/lib/reward-math";

export { computeApplied } from "@/lib/reward-math";

/** Current balance (0 if no account). Never throws. Cacheable seam. */
export async function getBalance(opts: { restaurantId: string; customerId: string }): Promise<number> {
  try {
    const a = await prisma.rewardAccount.findUnique({
      where: { restaurantId_customerId: { restaurantId: opts.restaurantId, customerId: opts.customerId } },
      select: { balance: true },
    });
    return round2(a?.balance ?? 0);
  } catch (e) {
    console.error("[reward getBalance]", e);
    return 0;
  }
}

async function ensureAccount(restaurantId: string, customerId: string) {
  return prisma.rewardAccount.upsert({
    where: { restaurantId_customerId: { restaurantId, customerId } },
    create: { restaurantId, customerId },
    update: {},
    select: { id: true, balance: true },
  });
}

/** Add (positive) or deduct (negative, clamped ≥0) credit. Idempotent for
 *  orderId-tied grants via @@unique([accountId, orderId, reason]). Never throws. */
export async function grant(opts: {
  restaurantId: string;
  customerId: string;
  amount: number;
  reason: string; // grant | earn | signup_bonus | adjust | expire
  note?: string | null;
  orderId?: string | null;
}): Promise<{ ok: boolean; balanceAfter: number }> {
  const amount = round2(opts.amount);
  if (!Number.isFinite(amount) || amount === 0) {
    return { ok: false, balanceAfter: await getBalance(opts) };
  }
  try {
    const acct = await ensureAccount(opts.restaurantId, opts.customerId);
    if (opts.orderId) {
      const existing = await prisma.rewardLedger.findUnique({
        where: { accountId_orderId_reason: { accountId: acct.id, orderId: opts.orderId, reason: opts.reason } },
        select: { id: true },
      });
      if (existing) return { ok: true, balanceAfter: round2(acct.balance) }; // idempotent
    }
    const balanceAfter = await prisma.$transaction(async (tx) => {
      const a = await tx.rewardAccount.update({
        where: { id: acct.id },
        data: {
          balance: { increment: amount },
          lifetimeEarned: amount > 0 ? { increment: amount } : undefined,
        },
        select: { balance: true },
      });
      let bal = round2(a.balance);
      if (bal < 0) { await tx.rewardAccount.update({ where: { id: acct.id }, data: { balance: 0 } }); bal = 0; }
      await tx.rewardLedger.create({
        data: { accountId: acct.id, amount, balanceAfter: bal, reason: opts.reason, note: opts.note ?? null, orderId: opts.orderId ?? null },
      });
      return bal;
    });
    return { ok: true, balanceAfter };
  } catch (e: any) {
    if (e?.code === "P2002") return { ok: true, balanceAfter: await getBalance(opts) }; // idempotent race
    console.error("[reward grant]", e);
    return { ok: false, balanceAfter: 0 };
  }
}

/** Atomically RESERVE (decrement) credit toward an order BEFORE the order row
 *  exists — the spend ledger row is written post-create by `recordSpendForOrder`,
 *  and `refundClaim` re-credits if order.create then fails. NEVER throws; refuses
 *  via a typed result so the caller proceeds at 0. The atomic
 *  `WHERE balance >= applied` guarantees no over-draw / negative balance under
 *  concurrency (two orders draining the same wallet: loser gets 0 rows). */
export async function reserveCredit(opts: {
  restaurantId: string;
  customerId: string;
  requested: number;
  orderTotal: number;
  minRedeemBalance: number;
  maxRedeemPercent: number;
  minCharge?: number;
}): Promise<{ ok: true; applied: number } | { ok: false; code: "below_min" | "noop" | "insufficient"; available: number }> {
  try {
    const acct = await prisma.rewardAccount.findUnique({
      where: { restaurantId_customerId: { restaurantId: opts.restaurantId, customerId: opts.customerId } },
      select: { id: true, balance: true },
    });
    const balance = round2(acct?.balance ?? 0);
    const calc = computeApplied({ ...opts, balance });
    if (!acct || calc.applied <= 0) return { ok: false, code: calc.code ?? "noop", available: balance };
    const applied = calc.applied;
    const rows = await prisma.$executeRaw`
      UPDATE "RewardAccount"
      SET "balance" = "balance" - ${applied},
          "lifetimeRedeemed" = "lifetimeRedeemed" + ${applied},
          "updatedAt" = now()
      WHERE id = ${acct.id} AND "balance" >= ${applied}
    `;
    if (rows === 0) return { ok: false, code: "insufficient", available: await getBalance(opts) };
    return { ok: true, applied };
  } catch (e) {
    console.error("[reward reserveCredit]", e);
    return { ok: false, code: "noop", available: 0 };
  }
}

/** Compensating action when order.create fails AFTER a successful claim — give
 *  the credit back (no ledger row was written yet, so just re-credit). */
export async function refundClaim(opts: { restaurantId: string; customerId: string; amount: number }): Promise<void> {
  const amount = round2(opts.amount);
  if (amount <= 0) return;
  try {
    const acct = await prisma.rewardAccount.findUnique({
      where: { restaurantId_customerId: { restaurantId: opts.restaurantId, customerId: opts.customerId } },
      select: { id: true },
    });
    if (!acct) return;
    await prisma.$executeRaw`UPDATE "RewardAccount" SET "balance" = "balance" + ${amount}, "lifetimeRedeemed" = "lifetimeRedeemed" - ${amount} WHERE id = ${acct.id}`;
  } catch (e) { console.error("[reward refundClaim]", e); }
}

/** Persist the spend ledger row after order.create (the claim already decremented
 *  the balance; this records it against the new order id). Idempotent. */
export async function recordSpendForOrder(opts: { restaurantId: string; customerId: string; orderId: string; applied: number }): Promise<void> {
  const applied = round2(opts.applied);
  if (applied <= 0) return;
  try {
    const acct = await prisma.rewardAccount.findUnique({
      where: { restaurantId_customerId: { restaurantId: opts.restaurantId, customerId: opts.customerId } },
      select: { id: true, balance: true },
    });
    if (!acct) return;
    await prisma.rewardLedger.create({
      data: { accountId: acct.id, amount: -applied, balanceAfter: round2(acct.balance), reason: "spend", status: "applied", orderId: opts.orderId },
    });
  } catch (e: any) {
    if (e?.code !== "P2002") console.error("[reward recordSpendForOrder]", e); // P2002 = already recorded
  }
}

/** Order completed → spent credit becomes permanent (applied → redeemed). Idempotent. */
export async function redeemForOrder(orderId: string): Promise<void> {
  try {
    await prisma.rewardLedger.updateMany({
      where: { orderId, reason: "spend", status: "applied" },
      data: { status: "redeemed" },
    });
  } catch (e) { console.error("[reward redeemForOrder]", e); }
}

/** Order missed/rejected/cancelled → return the spent credit. Idempotent (only
 *  acts on a still-"applied" spend row). */
export async function releaseForOrder(orderId: string): Promise<void> {
  try {
    const spend = await prisma.rewardLedger.findFirst({
      where: { orderId, reason: "spend", status: "applied" },
      select: { id: true, accountId: true, amount: true },
    });
    if (!spend) return;
    const refund = round2(Math.abs(spend.amount));
    if (refund <= 0) { await prisma.rewardLedger.update({ where: { id: spend.id }, data: { status: "released" } }); return; }
    await prisma.$transaction(async (tx) => {
      const a = await tx.rewardAccount.update({
        where: { id: spend.accountId },
        data: { balance: { increment: refund }, lifetimeRedeemed: { decrement: refund } },
        select: { balance: true },
      });
      await tx.rewardLedger.update({ where: { id: spend.id }, data: { status: "released" } });
      await tx.rewardLedger.create({
        data: { accountId: spend.accountId, amount: refund, balanceAfter: round2(a.balance), reason: "release", orderId },
      });
    });
  } catch (e) { console.error("[reward releaseForOrder]", e); }
}

/** FULL refund of a completed order → make the wallet whole:
 *   1. return the credit the customer SPENT on the order (the spend row flips
 *      redeemed/applied → "refunded" and the balance is re-credited), and
 *   2. claw back the credit they EARNED on the order (clamp balance ≥ 0).
 *  Idempotent per order (dedicated `refund` / `reverse` ledger reasons, each
 *  unique per [account, order, reason]) + guarded so a retry can't double-apply.
 *  Never throws. Only call on a FULL refund — a partial refund leaves credit as-is.
 *  Luigi 2026-06-30. */
export async function refundForOrder(orderId: string): Promise<void> {
  try {
    const rows = await prisma.rewardLedger.findMany({
      where: { orderId },
      select: { id: true, accountId: true, amount: true, reason: true, status: true },
    });
    if (!rows.length) return;
    const accountId = rows[0].accountId;

    // 1) Return spent credit — only a still-active spend (redeemed/applied). A
    //    spend already released (rejected) or refunded is skipped → idempotent.
    const spend = rows.find((r) => r.reason === "spend" && (r.status === "redeemed" || r.status === "applied"));
    if (spend) {
      const back = round2(Math.abs(spend.amount));
      if (back > 0) {
        await prisma.$transaction(async (tx) => {
          const a = await tx.rewardAccount.update({
            where: { id: accountId },
            data: { balance: { increment: back }, lifetimeRedeemed: { decrement: back } },
            select: { balance: true },
          });
          await tx.rewardLedger.update({ where: { id: spend.id }, data: { status: "refunded" } });
          await tx.rewardLedger.create({ data: { accountId, amount: back, balanceAfter: round2(a.balance), reason: "refund", orderId } });
        });
      }
    }

    // 2) Claw back earned credit (earn / earn:<trigger> / promo:<id> / signup_bonus
    //    tied to this order). One "reverse" row, guarded by both an existence check
    //    (so the balance isn't decremented twice) and the unique constraint.
    const alreadyReversed = await prisma.rewardLedger.findUnique({
      where: { accountId_orderId_reason: { accountId, orderId, reason: "reverse" } },
      select: { id: true },
    });
    if (!alreadyReversed) {
      const earned = round2(
        rows
          .filter((r) => r.amount > 0 && (r.reason === "earn" || r.reason.startsWith("earn:") || r.reason.startsWith("promo:") || r.reason === "signup_bonus"))
          .reduce((s, r) => s + r.amount, 0),
      );
      if (earned > 0) {
        await prisma.$transaction(async (tx) => {
          const a = await tx.rewardAccount.update({
            where: { id: accountId },
            data: { balance: { decrement: earned }, lifetimeEarned: { decrement: earned } },
            select: { balance: true },
          });
          let bal = round2(a.balance);
          if (bal < 0) { await tx.rewardAccount.update({ where: { id: accountId }, data: { balance: 0 } }); bal = 0; }
          await tx.rewardLedger.create({ data: { accountId, amount: -earned, balanceAfter: bal, reason: "reverse", orderId } });
        });
      }
    }
  } catch (e: any) {
    if (e?.code !== "P2002") console.error("[reward refundForOrder]", e);
  }
}

/** Per-order reward summary for receipts/activity (read-only, never throws).
 *  `used` = credit that actually stuck as payment on this order (spend rows NOT
 *  released back); `earned` = credit earned on this order (earn / earn:<trigger>
 *  / reward_credit promo rows — every positive order-tied row except a release).
 *  Cacheable seam: read on the status-poll path, so gate the caller on
 *  rewardsEnabled to avoid the query when the feature is off. */
export async function getOrderRewardSummary(orderId: string): Promise<{ used: number; earned: number }> {
  try {
    const rows = await prisma.rewardLedger.findMany({
      where: { orderId },
      select: { amount: true, reason: true, status: true },
    });
    let used = 0;
    let earned = 0;
    for (const r of rows) {
      if (r.reason === "spend") {
        if (r.status !== "released") used += Math.abs(r.amount); // released = returned, didn't stick
      } else if (r.reason !== "release" && r.amount > 0) {
        earned += r.amount; // earn / earn:<trigger> / promo:<id>
      }
    }
    return { used: round2(used), earned: round2(earned) };
  } catch (e) {
    console.error("[reward getOrderRewardSummary]", e);
    return { used: 0, earned: 0 };
  }
}

/** Earn basis for an order = subtotal of NON-excluded items − discounts (clamped
 *  ≥ 0). Items flagged `rewardEarnExcluded` (or in a category flagged so — e.g.
 *  gift cards) don't earn store credit. Shared by the base %-back, the rule
 *  bonuses, and the receipt projection so all three agree. Never throws. Luigi 2026-06-30. */
// The minimum order shape earnBasisForOrder needs. Callers that have already
// loaded the order (awardForOrder, awardEarnRulesForOrder, projectOrderEarn)
// spread this into their own select and pass the result in, so the basis calc
// reuses the single load instead of re-fetching the order. Luigi 2026-06-30.
export const EARN_BASIS_ORDER_SELECT = {
  subtotal: true, couponDiscount: true, promoDiscount: true,
  items: { select: { menuItemId: true, subtotal: true } },
} as const;
export type EarnBasisOrder = {
  subtotal: number | null;
  couponDiscount: number | null;
  promoDiscount: number | null;
  items: { menuItemId: string | null; subtotal: number | null }[];
};

export async function earnBasisForOrder(orderId: string, preloaded?: EarnBasisOrder | null): Promise<number> {
  try {
    const order: EarnBasisOrder | null = preloaded ?? await prisma.order.findUnique({
      where: { id: orderId },
      select: EARN_BASIS_ORDER_SELECT,
    });
    if (!order) return 0;
    // Sum the subtotal of any line whose item (or item's category) is flagged
    // rewardEarnExcluded. OrderItem has no MenuItem relation, so resolve the
    // flags with one bounded findMany over the order's distinct item ids.
    let excluded = 0;
    const ids = [...new Set(order.items.map((i) => i.menuItemId).filter((x): x is string => !!x))];
    if (ids.length) {
      const items = await prisma.menuItem.findMany({
        where: { id: { in: ids } },
        select: { id: true, rewardEarnExcluded: true, category: { select: { rewardEarnExcluded: true } } },
      });
      const excludedIds = new Set(items.filter((m) => m.rewardEarnExcluded || m.category?.rewardEarnExcluded).map((m) => m.id));
      if (excludedIds.size) {
        for (const line of order.items) {
          if (line.menuItemId && excludedIds.has(line.menuItemId)) excluded += line.subtotal ?? 0;
        }
      }
    }
    // Order-level discounts (coupon/promo) are computed against the FULL subtotal,
    // so allocate them PROPORTIONALLY to the earnable portion — otherwise excluding
    // an item would wrongly wipe the whole discount off the earnable base and
    // under-pay earnings. When nothing is excluded gross===subtotal and this
    // reduces to (subtotal − discount), matching the pre-exclusion behaviour.
    const sub = order.subtotal ?? 0;
    const gross = Math.max(0, sub - excluded);
    const discountTotal = (order.couponDiscount ?? 0) + (order.promoDiscount ?? 0);
    const proportionalDiscount = sub > 0 ? discountTotal * (gross / sub) : 0;
    return Math.max(0, round2(gross - proportionalDiscount));
  } catch (e) {
    console.error("[reward earnBasisForOrder]", e);
    return 0;
  }
}

/** Order completed → award auto-earn per the restaurant's settings. Idempotent
 *  (one earn row per order). No-ops when earning is off / basis ≤0 / no customer. */
export async function awardForOrder(opts: { orderId: string }): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: opts.orderId },
      select: {
        restaurantId: true, customerId: true, ...EARN_BASIS_ORDER_SELECT,
        restaurant: { select: { rewardsEnabled: true, rewardEarnEnabled: true, rewardEarnMode: true, rewardEarnPercent: true, rewardEarnPerDollar: true } },
      },
    });
    if (!order?.customerId) return;
    const r = order.restaurant;
    if (!r?.rewardsEnabled || !r.rewardEarnEnabled) return;
    const basis = await earnBasisForOrder(opts.orderId, order); // excludes gift-card-style items; reuses this load
    if (basis <= 0) return;
    const earned = round2(r.rewardEarnMode === "per_dollar" ? basis * (r.rewardEarnPerDollar ?? 0) : basis * ((r.rewardEarnPercent ?? 0) / 100));
    if (earned <= 0) return;
    await grant({ restaurantId: order.restaurantId, customerId: order.customerId, amount: earned, reason: "earn", orderId: opts.orderId });
  } catch (e) { console.error("[reward awardForOrder]", e); }
}
