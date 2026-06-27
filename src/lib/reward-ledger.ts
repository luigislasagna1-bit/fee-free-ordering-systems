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

/** Order completed → award auto-earn per the restaurant's settings. Idempotent
 *  (one earn row per order). No-ops when earning is off / basis ≤0 / no customer. */
export async function awardForOrder(opts: { orderId: string }): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: opts.orderId },
      select: {
        restaurantId: true, customerId: true, subtotal: true, couponDiscount: true, promoDiscount: true,
        restaurant: { select: { rewardsEnabled: true, rewardEarnEnabled: true, rewardEarnMode: true, rewardEarnPercent: true, rewardEarnPerDollar: true } },
      },
    });
    if (!order?.customerId) return;
    const r = order.restaurant;
    if (!r?.rewardsEnabled || !r.rewardEarnEnabled) return;
    const basis = Math.max(0, round2((order.subtotal ?? 0) - (order.couponDiscount ?? 0) - (order.promoDiscount ?? 0)));
    if (basis <= 0) return;
    const earned = round2(r.rewardEarnMode === "per_dollar" ? basis * (r.rewardEarnPerDollar ?? 0) : basis * ((r.rewardEarnPercent ?? 0) / 100));
    if (earned <= 0) return;
    await grant({ restaurantId: order.restaurantId, customerId: order.customerId, amount: earned, reason: "earn", orderId: opts.orderId });
  } catch (e) { console.error("[reward awardForOrder]", e); }
}
