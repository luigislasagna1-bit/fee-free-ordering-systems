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
import { CUSTOMER_ROW_ORDER } from "@/lib/customer-row";
import { mintPassForGrant } from "@/lib/gift-wallet-pass";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type PassInfo = { codeHint: string; expiresAt: string; revoked: boolean; exchanged: boolean };

function giftShape(
  g: {
    id: string; email: string; name: string; amount: number; note: string | null;
    status: string; createdAt: Date; claimedAt: Date | null; emailSentAt: Date | null;
  },
  pass?: PassInfo | null,
) {
  return {
    id: g.id, email: g.email, name: g.name, amount: g.amount, note: g.note,
    status: g.status, createdAt: g.createdAt.toISOString(),
    claimedAt: g.claimedAt?.toISOString() ?? null,
    emailSentAt: g.emailSentAt?.toISOString() ?? null,
    // Gift Wallet Pass — admin support display ONLY (last-4 hint, never the
    // full code, which is never even stored). Null when no pass was ever
    // minted (e.g. an old gift created before this feature shipped).
    pass: pass ?? null,
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
  // Fail-open on the pass lookup alone: a schema-push that hasn't landed yet
  // (deployment-ordering — the GiftWalletPass table is additive, pushed
  // separately per the standing rule) must never break the EXISTING gift
  // list this page already showed before this feature existed. Worst case,
  // rows render with pass:null (no code/status/expiry column) until the
  // table exists — never a 500 on a page that used to work.
  let passes: { grantId: string; codeHint: string; expiresAt: Date; revokedAt: Date | null; exchangeCount: number }[] = [];
  if (gifts.length) {
    try {
      passes = await prisma.giftWalletPass.findMany({
        where: { grantId: { in: gifts.map((g) => g.id) } },
        select: { grantId: true, codeHint: true, expiresAt: true, revokedAt: true, exchangeCount: true },
      });
    } catch (e) {
      console.error("[reward-gifts GET] giftWalletPass lookup failed — degrading to pass:null", e);
    }
  }
  const passByGrantId = new Map(
    passes.map((p) => [
      p.grantId,
      { codeHint: p.codeHint, expiresAt: p.expiresAt.toISOString(), revoked: !!p.revokedAt, exchanged: p.exchangeCount > 0 } as PassInfo,
    ]),
  );
  return NextResponse.json({ gifts: gifts.map((g) => giftShape(g, passByGrantId.get(g.id))) });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
  // Storefront root — the instant-path "Order now" CTA (existing RewardGift email).
  const orderUrl = restaurantOrderUrl(r as any, "");
  // The INVITE's CTA must land on the SIGN-UP FORM itself, not the storefront
  // root: on a branded host with the hosted-site add-on the root serves the
  // MARKETING page (proxy design), which stranded Luigi's first test recipient.
  // /account/signup is the dedicated signup page in the order tree.
  const signupUrl = restaurantOrderUrl(r as any, "/account/signup");
  const locale = r.defaultLanguage || "en";
  const amountLabel = formatCurrency(amount, r.currency);

  // ── ONE UNREDEEMED GIFT PER GUEST (Luigi, 2026-07-31) ────────────────────
  // A `pending` gift is money the recipient has NOT collected yet. Stacking a
  // second one on the same address is almost always a mistake — the owner
  // assumes the first never arrived and sends again — and it used to cause real
  // loss: once the recipient became account-grade by ANY route, the next gift
  // took the instant path and the original pending row was orphaned, invisible
  // to everyone while the owner believed both had landed.
  //
  // So refuse, and hand the admin UI everything it needs to offer the right
  // action instead: resend the instructions, or revoke and re-issue.
  const outstanding = await prisma.pendingRewardGrant.findFirst({
    where: { restaurantId, email, status: "pending" },
    orderBy: { createdAt: "desc" },
    select: { id: true, amount: true, createdAt: true, emailSentAt: true },
  });
  if (outstanding) {
    return NextResponse.json(
      {
        error: "already_pending",
        code: "already_pending",
        outstanding: {
          id: outstanding.id,
          amount: outstanding.amount,
          createdAt: outstanding.createdAt.toISOString(),
          emailSentAt: outstanding.emailSentAt?.toISOString() ?? null,
        },
      },
      { status: 409 },
    );
  }

  // Existing ACCOUNT holder? (Case-insensitive so legacy mixed-case rows match;
  // prefer the credentialed row — same convention as the orders route.)
  const existing = await prisma.customer.findFirst({
    where: { restaurantId, email: { equals: email, mode: "insensitive" } },
    orderBy: CUSTOMER_ROW_ORDER as any,
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
      restaurantId,
      customerName: name || existing.name || "",
      restaurantName: r.name,
      amountLabel,
      rewardLabel,
      balanceLabel: formatCurrency(balance, r.currency),
      note,
      orderUrl,
      restaurantEmail: r.email,
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
  // Claim stays lazy — a Gift Wallet Pass is minted alongside it, but the
  // grant itself only ever flips to "claimed" when someone actually spends
  // it (exchange) or signs up. That is what preserves the revoke path and
  // stops a CRM row existing for a link nobody clicked.
  const gift = await prisma.pendingRewardGrant.create({
    data: { restaurantId, email, name, amount, note, status: "pending", createdBy: user!.id },
  });

  // Gift Wallet Pass — the no-account spend path (2026-08-03). A mint
  // failure must never break gift creation: log and fall back to the
  // signup-only email (degraded, never broken).
  let spendUrl: string | null = null;
  let passCode: string | null = null;
  let codeExpiryLabel: string | null = null;
  let mintedPassInfo: PassInfo | null = null;
  try {
    const minted = await mintPassForGrant({ restaurantId, grantId: gift.id });
    if (minted) {
      passCode = minted.code;
      spendUrl = `${restaurantOrderUrl(r as any, `/gift/${gift.id}`)}#g=${minted.code.replace(/-/g, "")}`;
      codeExpiryLabel = minted.expiresAt.toLocaleDateString(locale || undefined, {
        timeZone: r.timezone || "UTC",
        year: "numeric", month: "long", day: "numeric",
      });
      mintedPassInfo = {
        codeHint: minted.code.replace(/-/g, "").slice(-4),
        expiresAt: minted.expiresAt.toISOString(),
        revoked: false,
        exchanged: false,
      };
    }
  } catch (e) {
    console.error("[reward-gift mint pass]", e);
  }

  sendRewardGiftInviteEmail({
    to: email,
    restaurantId,
    customerName: name,
    restaurantName: r.name,
    amountLabel,
    rewardLabel,
    note,
    orderUrl: signupUrl,
    restaurantEmail: r.email,
    locale,
    spendUrl,
    code: passCode,
    codeExpiryLabel,
  })
    .then((res2) => prisma.pendingRewardGrant.update({ where: { id: gift.id }, data: { emailSentAt: res2.success ? new Date() : null } }).catch(() => {}))
    .catch((e) => console.error("[reward-gift invite email]", e instanceof Error ? e.message : e));

  return NextResponse.json({
    ok: true,
    instant: false,
    gift: giftShape({ ...gift }, mintedPassInfo),
  });
}
