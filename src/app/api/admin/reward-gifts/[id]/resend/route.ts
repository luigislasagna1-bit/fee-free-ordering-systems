/**
 * RESEND a Reward Dollars gift email (Luigi, 2026-07-31).
 *
 * The gift itself is unchanged — this only re-delivers the instructions, for
 * the ordinary cases where the first message never landed: spam folder, typo'd
 * address corrected at the mail server, "I deleted it", or a recipient who
 * simply did not understand what the credit was until asked.
 *
 * Which email goes out follows the gift's CURRENT state rather than what was
 * sent originally, because that state can move underneath it — a `pending` gift
 * whose recipient signed up in the meantime gets claimed by the signup hooks,
 * and re-sending "create an account to claim this" to someone who already has
 * an account (and already has the money) would be nonsense.
 *
 *   pending  → the INVITE ("create your free account and it's yours")
 *   claimed  → the standard gift email, with their live balance
 *
 * Throttled to one send per minute per gift so the button cannot be used to
 * mail-bomb an address, and scoped to the caller's own restaurant.
 */
import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { getBalance } from "@/lib/reward-ledger";
import { sendRewardGiftEmail, sendRewardGiftInviteEmail } from "@/lib/email";
import { formatCurrency } from "@/lib/utils";
import { restaurantOrderUrl } from "@/lib/restaurant-url";
import { isAccountCustomer } from "@/lib/reward-gifts";
import { mintPassForGrant } from "@/lib/gift-wallet-pass";

const RESEND_COOLDOWN_MS = 60_000;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Restaurant-scoped read: a gift id from another tenant must not resolve.
  const gift = await prisma.pendingRewardGrant.findFirst({
    where: { id, restaurantId },
    select: { id: true, email: true, name: true, amount: true, note: true, status: true, customerId: true, emailSentAt: true },
  });
  if (!gift) return NextResponse.json({ error: "not_found", code: "not_found" }, { status: 404 });
  if (gift.status !== "pending" && gift.status !== "claimed") {
    return NextResponse.json({ error: "not_resendable", code: "not_resendable" }, { status: 400 });
  }

  // ── Claim the send atomically ────────────────────────────────────────────
  // Read-then-send races the revoke button sitting inches away in the same UI:
  // a revoke landing between the read above and the send below would mail an
  // invite for money that no longer exists, and stamp emailSentAt LATER than
  // revokedAt, corrupting the audit trail. Stamping emailSentAt inside a
  // status-guarded updateMany makes the claim the throttle as well — two rapid
  // clicks can only match once, so the cooldown cannot be beaten by
  // concurrency the way a separate read-compare-write could be.
  const cutoff = new Date(Date.now() - RESEND_COOLDOWN_MS);
  const sentAt = new Date();
  const claimed = await prisma.pendingRewardGrant.updateMany({
    where: {
      id: gift.id,
      restaurantId,
      status: gift.status, // must still be the state we decided the email from
      OR: [{ emailSentAt: null }, { emailSentAt: { lt: cutoff } }],
    },
    data: { emailSentAt: sentAt },
  });
  if (claimed.count === 0) {
    // Either the cooldown is still running or the gift moved (revoked/claimed)
    // since the read. Both mean: do not send.
    const fresh = await prisma.pendingRewardGrant.findFirst({
      where: { id: gift.id, restaurantId },
      select: { status: true },
    });
    if (fresh && fresh.status !== gift.status) {
      return NextResponse.json({ error: "changed", code: "not_resendable" }, { status: 409 });
    }
    return NextResponse.json({ error: "too_soon", code: "too_soon" }, { status: 429 });
  }

  const r = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      rewardsEnabled: true,
      name: true, email: true, slug: true, subdomain: true, customDomain: true, customDomainStatus: true,
      defaultLanguage: true, currency: true, rewardLabelSingular: true, rewardLabelPlural: true,
      timezone: true, hoursFormat: true,
    },
  });
  if (!r?.rewardsEnabled) return NextResponse.json({ error: "rewards_off", code: "rewards_off" }, { status: 400 });

  const rewardLabel = r.rewardLabelPlural?.trim() || r.rewardLabelSingular?.trim() || "Reward Dollars";
  const amountLabel = formatCurrency(gift.amount, r.currency);
  const locale = r.defaultLanguage || "en";
  // Same URL split as the create route: the invite must land on the signup FORM
  // (a branded host's root serves the marketing site), the claimed-gift email on
  // the storefront.
  const orderUrl = restaurantOrderUrl(r as any, "");
  const signupUrl = restaurantOrderUrl(r as any, "/account/signup");

  // A "claimed" gift means SOMEONE resolved it — but that someone might be a
  // real ACCOUNT (signup / instant-gift path, can just log in) or a Gift
  // Wallet Pass guest twin (no login exists for them — they still need a
  // spend code). Only the account case gets the plain balance email; the
  // guest-twin case needs a fresh code same as a still-pending gift.
  const claimedCustomer = gift.status === "claimed" && gift.customerId
    ? await prisma.customer.findUnique({
        where: { id: gift.customerId },
        select: { signedUpAt: true, passwordHash: true, customerAccountId: true },
      })
    : null;
  const isGuestTwinClaim = gift.status === "claimed" && claimedCustomer && !isAccountCustomer(claimedCustomer);

  let ok = false;
  if (gift.status === "claimed" && gift.customerId && !isGuestTwinClaim) {
    const balance = await getBalance({ restaurantId, customerId: gift.customerId });
    const res = await sendRewardGiftEmail({
      to: gift.email,
      customerName: gift.name,
      restaurantName: r.name,
      amountLabel,
      rewardLabel,
      balanceLabel: formatCurrency(balance, r.currency),
      note: gift.note,
      orderUrl,
      restaurantEmail: r.email,
      locale,
    });
    ok = res.success;
  } else {
    // Pending gift, OR a claimed-but-guest-twin gift: both need a live spend
    // code. The raw code is never stored (SHA-256 at rest), so "resend the
    // same code" is not literally possible — every resend mints a FRESH one,
    // which also has the benefit of invalidating a possibly-forwarded
    // original. The recipient is left with exactly one valid code at all
    // times (never zero — this is not a griefing vector), just never the
    // SAME text twice.
    let spendUrl: string | null = null;
    let passCode: string | null = null;
    let codeExpiryLabel: string | null = null;
    try {
      const minted = await mintPassForGrant({ restaurantId, grantId: gift.id });
      if (minted) {
        passCode = minted.code;
        spendUrl = `${restaurantOrderUrl(r as any, `/gift/${gift.id}`)}#g=${minted.code.replace(/-/g, "")}`;
        codeExpiryLabel = minted.expiresAt.toLocaleDateString(locale || undefined, {
          timeZone: r.timezone || "UTC",
          year: "numeric", month: "long", day: "numeric",
        });
      }
    } catch (e) {
      console.error("[reward-gift resend mint pass]", e);
    }
    const res = await sendRewardGiftInviteEmail({
      to: gift.email,
      customerName: gift.name,
      restaurantName: r.name,
      amountLabel,
      rewardLabel,
      note: gift.note,
      orderUrl: signupUrl,
      restaurantEmail: r.email,
      locale,
      spendUrl,
      code: passCode,
      codeExpiryLabel,
    });
    ok = res.success;
  }

  if (!ok) {
    // Hand the cooldown back so a transient mail failure doesn't lock the owner
    // out for a minute — restore the previous stamp rather than clearing it, or
    // a failed send would reset a legitimate throttle.
    await prisma.pendingRewardGrant
      .updateMany({ where: { id: gift.id, restaurantId, emailSentAt: sentAt }, data: { emailSentAt: gift.emailSentAt } })
      .catch(() => {});
    return NextResponse.json({ error: "send_failed", code: "send_failed" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, emailSentAt: sentAt.toISOString() });
}
