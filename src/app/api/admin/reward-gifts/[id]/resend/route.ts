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
  if (gift.emailSentAt && Date.now() - gift.emailSentAt.getTime() < RESEND_COOLDOWN_MS) {
    return NextResponse.json({ error: "too_soon", code: "too_soon" }, { status: 429 });
  }

  const r = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      rewardsEnabled: true,
      name: true, email: true, slug: true, subdomain: true, customDomain: true, customDomainStatus: true,
      defaultLanguage: true, currency: true, rewardLabelSingular: true, rewardLabelPlural: true,
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

  let ok = false;
  if (gift.status === "claimed" && gift.customerId) {
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
    });
    ok = res.success;
  }

  if (!ok) return NextResponse.json({ error: "send_failed", code: "send_failed" }, { status: 502 });

  const sentAt = new Date();
  await prisma.pendingRewardGrant.update({ where: { id: gift.id }, data: { emailSentAt: sentAt } }).catch(() => {});
  return NextResponse.json({ ok: true, emailSentAt: sentAt.toISOString() });
}
