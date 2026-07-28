/**
 * "Gift Reward Dollars" by EMAIL — including to people with no account yet
 * (Luigi 2026-07-28). The admin creates a PendingRewardGrant; if the email
 * already belongs to an ACCOUNT-holding customer the wallet is credited
 * immediately, otherwise the row waits `pending` and the customer-signup /
 * guest-activation hooks call claimPendingGiftsFor() to credit it the moment
 * the account exists. No expiry by design (Luigi).
 *
 * Idempotency: the atomic pending→claimed status flip (updateMany guarded on
 * status:"pending") is the primary gate — same pattern as DriverPayout
 * mark-paid. The wallet credit ALSO carries the synthetic ledger key
 * `gift:<grantId>` (reason "grant"), so even a crash between flip and credit
 * can be safely re-driven without double-crediting. Reason "grant" keeps gift
 * credit outside the refund clawback filter (which only reverses the
 * earn / earn:… / promo:… / signup_bonus reasons).
 */
import prisma from "@/lib/db";
import { grant } from "@/lib/reward-ledger";

/** True when a Customer row is a real ACCOUNT (not a guest CRM row): the
 *  2026-07-09 gate convention — signedUpAt stamp, credentials, or a linked
 *  marketplace account. Gifts only land in accounts (the email promises "sign
 *  up and it's yours"; guests couldn't see or spend the balance anyway). */
export function isAccountCustomer(c: {
  signedUpAt: Date | null;
  passwordHash: string | null;
  customerAccountId: string | null;
}): boolean {
  return c.signedUpAt != null || c.passwordHash != null || c.customerAccountId != null;
}

/**
 * Claim every pending gift for (restaurantId, email) into `customerId`'s
 * wallet. Called from the signup route (fresh + guest-hydration branches),
 * the reset-password guest-activation path, and the create-gift API's
 * instant path. Never throws; returns the number of gifts claimed and the
 * total dollars credited. Safe to call repeatedly.
 */
export async function claimPendingGiftsFor(opts: {
  restaurantId: string;
  customerId: string;
  email: string;
}): Promise<{ claimed: number; totalAmount: number }> {
  const email = opts.email.trim().toLowerCase();
  let claimed = 0;
  let totalAmount = 0;
  try {
    const pending = await prisma.pendingRewardGrant.findMany({
      where: { restaurantId: opts.restaurantId, email, status: "pending" },
      select: { id: true, amount: true, note: true },
      take: 50, // sanity bound; one person never has more than a handful
    });
    for (const g of pending) {
      // Atomic claim — a concurrent signup/retry flips zero rows here.
      const won = await prisma.pendingRewardGrant.updateMany({
        where: { id: g.id, status: "pending" },
        data: { status: "claimed", claimedAt: new Date(), customerId: opts.customerId },
      });
      if (won.count === 0) continue;
      const res = await grant({
        restaurantId: opts.restaurantId,
        customerId: opts.customerId,
        amount: g.amount,
        reason: "grant",
        note: g.note ? `Gift: ${g.note}` : "Gift",
        orderId: `gift:${g.id}`, // ledger-level idempotency backstop
      });
      if (res.ok) {
        claimed += 1;
        totalAmount += g.amount;
      } else {
        // Credit failed (shouldn't happen — grant() never throws): put the
        // gift back so a later claim attempt can retry it. Never lose money.
        await prisma.pendingRewardGrant.updateMany({
          where: { id: g.id, status: "claimed" },
          data: { status: "pending", claimedAt: null, customerId: null },
        });
        console.error(`[reward-gifts] credit failed for gift ${g.id}; reverted to pending`);
      }
    }
  } catch (e) {
    console.error("[reward-gifts] claimPendingGiftsFor failed", e);
  }
  return { claimed, totalAmount };
}
