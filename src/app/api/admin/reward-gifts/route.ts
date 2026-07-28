/**
 * Gift Reward Dollars by EMAIL — including to people with no account yet
 * (Luigi 2026-07-28, "no expiry and go ahead").
 *
 *   POST { name, email, amount, note? } — create a gift:
 *     • email already belongs to an ACCOUNT customer → wallet credited
 *       instantly (row born `claimed`) + the standard RewardGift email.
 *     • otherwise → PendingRewardGrant waits `pending` + the RewardGiftInvite
 *       email ("create your account with this email and it's yours"); the
 *       signup/activation hooks claim it automatically.
 *   GET — the restaurant's 50 most recent gifts (for the admin list).
 *
 * Restaurant-scoped via the session (never client-supplied); requires
 * rewardsEnabled. Emails here are 1:1 owner-initiated gift notices — the admin
 * form carries the CASL "only people who are genuinely your customers"
 * reminder. Amount clamped to (0, 1,000,000], 2dp (mirrors the manual tool).
 */
import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { grant, getBalance } from "@/lib/reward-ledger";
import { isAccountCustomer } from "@/lib/reward-gifts";
import { sendRewardGiftEmail, sendRewardGiftInviteEmail } from "@/lib/email";
import { formatCurrency } from "@/lib/utils";
import { restaurantOrderUrl } from "@/lib/restaurant-url";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function giftShape(g: {
  id: string; email: string; name: string; amount: number; note: string | null;
  status: string; createdAt: Date; claimedAt: Date | null; emailSentAt: Date | null;
}) {
  return {
    id: g.id, email: g.email, name: g.name, amount: g.amount, note: g.note,
    status: g.status, createdAt: g.createdAt.toISOString(),
    claimedAt: g.claimedAt?.toISOString() ?? null,
    emailSentAt: g.emailSentAt?.toISOString() ?? null,
  };
}

export async function GET() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const gifts = await prisma.pendingRewardGrant.findMany({
    where: { restaurantId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, email: true, name: true, amount: true, note: true, status: true, createdAt: true, claimedAt: true, emailSentAt: true },
  });
  return NextResponse.json({ gifts: gifts.map(giftShape) });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const r = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      rewardsEnabled: true,
      name: true, slug: true, subdomain: true, customDomain: true, customDomainStatus: true,
      defaultLanguage: true, currency: true, rewardLabelSingular: true, rewardLabelPlural: true,
    },
  });
  if (!r?.rewardsEnabled) return NextResponse.json({ error: "rewards_off", code: "rewards_off" }, { status: 400 });

  let body: { name?: string; email?: string; amount?: number; note?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const amount = Math.round((Number(body.amount) || 0) * 100) / 100;
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 200) || null : null;

  if (!name) return NextResponse.json({ error: "missing_name", code: "missing_name" }, { status: 400 });
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "invalid_email", code: "invalid_email" }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
    return NextResponse.json({ error: "invalid_amount", code: "invalid_amount" }, { status: 400 });
  }

  const rewardLabel = r.rewardLabelPlural?.trim() || r.rewardLabelSingular?.trim() || "Reward Dollars";
  const orderUrl = restaurantOrderUrl(r as any, "");
  const locale = r.defaultLanguage || "en";
  const amountLabel = formatCurrency(amount, r.currency);

  // Existing ACCOUNT holder? (Case-insensitive so legacy mixed-case rows match;
  // prefer the credentialed row — same convention as the orders route.)
  const existing = await prisma.customer.findFirst({
    where: { restaurantId, email: { equals: email, mode: "insensitive" } },
    orderBy: { passwordHash: { sort: "desc", nulls: "last" } },
    select: { id: true, name: true, email: true, signedUpAt: true, passwordHash: true, customerAccountId: true },
  });

  if (existing && isAccountCustomer(existing)) {
    // Instant path: credit the wallet now; the gift row is the audit record.
    const gift = await prisma.pendingRewardGrant.create({
      data: {
        restaurantId, email, name, amount, note,
        status: "claimed", claimedAt: new Date(), customerId: existing.id,
        createdBy: user!.id,
      },
    });
    const res = await grant({
      restaurantId, customerId: existing.id, amount,
      reason: "grant", note: note ? `Gift: ${note}` : "Gift",
      orderId: `gift:${gift.id}`,
    });
    if (!res.ok) {
      // Never leave a claimed-but-uncredited row: surface the failure.
      await prisma.pendingRewardGrant.delete({ where: { id: gift.id } }).catch(() => {});
      return NextResponse.json({ error: "credit_failed", code: "credit_failed" }, { status: 500 });
    }
    const balance = await getBalance({ restaurantId, customerId: existing.id });
    sendRewardGiftEmail({
      to: email,
      customerName: name || existing.name || "",
      restaurantName: r.name,
      amountLabel,
      rewardLabel,
      balanceLabel: formatCurrency(balance, r.currency),
      note,
      orderUrl,
      locale,
    })
      .then((res2) => prisma.pendingRewardGrant.update({ where: { id: gift.id }, data: { emailSentAt: res2.success ? new Date() : null } }).catch(() => {}))
      .catch((e) => console.error("[reward-gift email]", e instanceof Error ? e.message : e));
    const fresh = await prisma.pendingRewardGrant.findUnique({
      where: { id: gift.id },
      select: { id: true, email: true, name: true, amount: true, note: true, status: true, createdAt: true, claimedAt: true, emailSentAt: true },
    });
    return NextResponse.json({ ok: true, instant: true, gift: fresh ? giftShape(fresh) : null });
  }

  // Pending path: the gift waits for signup (no expiry — Luigi 2026-07-28).
  const gift = await prisma.pendingRewardGrant.create({
    data: { restaurantId, email, name, amount, note, status: "pending", createdBy: user!.id },
  });
  sendRewardGiftInviteEmail({
    to: email,
    customerName: name,
    restaurantName: r.name,
    amountLabel,
    rewardLabel,
    note,
    orderUrl,
    locale,
  })
    .then((res2) => prisma.pendingRewardGrant.update({ where: { id: gift.id }, data: { emailSentAt: res2.success ? new Date() : null } }).catch(() => {}))
    .catch((e) => console.error("[reward-gift invite email]", e instanceof Error ? e.message : e));

  return NextResponse.json({
    ok: true,
    instant: false,
    gift: giftShape({ ...gift }),
  });
}
