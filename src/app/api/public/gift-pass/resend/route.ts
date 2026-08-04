/**
 * POST /api/public/gift-pass/resend — the recipient's OWN self-serve
 * recovery lever (distinct from the admin's manual resend). Body:
 * { slug, grantId }. Sends ONLY to the address stored on the grant — NEVER
 * a request-supplied one, so this cannot be used to redirect someone else's
 * gift. Gated on `grant.status === "pending"` ALONE, deliberately
 * independent of the pass/code/session state, so expiry, a crash mid-
 * exchange, a wrong device, or a consumed session are all self-recoverable
 * in one tap without the recipient needing to know which failure mode they
 * hit.
 *
 * A fresh code is ALWAYS minted (the raw code is never stored — sha256 at
 * rest — so "resend the exact same one" is not literally possible; a fresh
 * mint also has the side benefit of invalidating a possibly-forwarded
 * original). The holder never ends up with zero valid codes — this is not
 * a griefing vector: it is gated on grantId (public in the claim-page URL,
 * not a secret) plus per-grant + per-IP throttles plus a DB-enforced
 * lifetime cap, and it can only ever hand the STORED address a fresh code —
 * it can never reveal or redirect one.
 *
 * ALWAYS returns the same generic body regardless of outcome (found/not
 * found/throttled) — not a status oracle.
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { rateLimitShared, getClientIp } from "@/lib/rate-limit";
import { mintPassForGrant } from "@/lib/gift-wallet-pass";
import { sendRewardGiftInviteEmail } from "@/lib/email";
import { formatCurrency } from "@/lib/utils";
import { restaurantOrderUrl } from "@/lib/restaurant-url";

const GENERIC_RESPONSE = { ok: true };
const LIFETIME_RESEND_CAP = 20;

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const ipOk = await rateLimitShared(`giftpass-resend:ip:${ip}`, 10, 60 * 60_000);
  if (!ipOk) return NextResponse.json(GENERIC_RESPONSE); // uniform — never reveal throttling

  let body: { slug?: string; grantId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(GENERIC_RESPONSE);
  }
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  const grantId = typeof body.grantId === "string" ? body.grantId.trim() : "";
  if (!slug || !grantId) return NextResponse.json(GENERIC_RESPONSE);

  try {
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug },
      select: {
        id: true, isActive: true, rewardsEnabled: true, name: true, email: true,
        currency: true, defaultLanguage: true, timezone: true, hoursFormat: true,
        rewardLabelSingular: true, rewardLabelPlural: true,
        subdomain: true, customDomain: true, customDomainStatus: true, slug: true,
      },
    });
    if (!restaurant || !restaurant.isActive || !restaurant.rewardsEnabled) return NextResponse.json(GENERIC_RESPONSE);

    const grant = await prisma.pendingRewardGrant.findFirst({
      where: { id: grantId, restaurantId: restaurant.id, status: "pending" },
      select: { id: true, email: true, name: true, amount: true, note: true },
    });
    if (!grant) return NextResponse.json(GENERIC_RESPONSE);

    const grantOk = await rateLimitShared(`giftpass-resend:grant:${grant.id}`, 3, 60 * 60_000);
    if (!grantOk) return NextResponse.json(GENERIC_RESPONSE);

    const pass = await prisma.giftWalletPass.findUnique({ where: { grantId: grant.id }, select: { resendCount: true } });
    if (pass && pass.resendCount >= LIFETIME_RESEND_CAP) return NextResponse.json(GENERIC_RESPONSE);

    const minted = await mintPassForGrant({ restaurantId: restaurant.id, grantId: grant.id });
    if (!minted) return NextResponse.json(GENERIC_RESPONSE); // never break the caller on a mint failure

    await prisma.giftWalletPass
      .update({ where: { id: minted.passId }, data: { resendCount: { increment: 1 }, lastResendAt: new Date() } })
      .catch(() => {});

    const rewardLabel = restaurant.rewardLabelPlural?.trim() || restaurant.rewardLabelSingular?.trim() || "Reward Dollars";
    const locale = restaurant.defaultLanguage || "en";
    const spendUrl = `${restaurantOrderUrl(restaurant as any, `/gift/${grant.id}`)}#g=${minted.code.replace(/-/g, "")}`;
    const codeExpiryLabel = minted.expiresAt.toLocaleDateString(locale || undefined, {
      timeZone: restaurant.timezone || "UTC",
      year: "numeric", month: "long", day: "numeric",
    });
    const signupUrl = restaurantOrderUrl(restaurant as any, "/account/signup");

    sendRewardGiftInviteEmail({
      to: grant.email, // ALWAYS the address stored on the grant — never a caller-supplied one
      restaurantId: restaurant.id,
      customerName: grant.name,
      restaurantName: restaurant.name,
      amountLabel: formatCurrency(grant.amount, restaurant.currency),
      rewardLabel,
      note: grant.note,
      orderUrl: signupUrl,
      restaurantEmail: restaurant.email,
      locale,
      spendUrl,
      code: minted.code,
      codeExpiryLabel,
    }).catch((e) => console.error("[gift-pass public resend email]", e instanceof Error ? e.message : e));
  } catch (e) {
    console.error("[gift-pass public resend]", e);
  }

  return NextResponse.json(GENERIC_RESPONSE);
}
