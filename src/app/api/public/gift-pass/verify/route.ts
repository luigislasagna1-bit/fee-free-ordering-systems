/**
 * POST /api/public/gift-pass/verify — read-only preview of a Gift Wallet
 * Pass code. NO writes, NO cookie. Body: { slug, code }. Returns a uniform
 * `{ ok:false, reason:"invalid" }` for not-found/wrong-restaurant/expired/
 * revoked so this cannot be used to enumerate valid codes or grant ids.
 * The claim page (src/app/order/[slug]/gift/[grantId]/page.tsx) renders
 * NOTHING sensitive until this call succeeds — a grant id in a URL is a
 * cuid, not a secret, so this is what actually gates disclosure of the
 * amount/sender/note.
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { rateLimitShared, getClientIp } from "@/lib/rate-limit";
import { verifyCode } from "@/lib/gift-wallet-pass";
import { formatCurrency } from "@/lib/utils";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  // 10/min per IP — this is defence-in-depth, not the security boundary (see
  // rate-limit.ts's fail-open note); the 80-bit code entropy is the real one.
  if (!(await rateLimitShared(`giftpass-verify:ip:${ip}`, 10, 60_000))) {
    return NextResponse.json({ ok: false, reason: "rate_limited" }, { status: 429 });
  }

  let body: { slug?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });
  }
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  const code = typeof body.code === "string" ? body.code : "";
  if (!slug || !code) return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: { id: true, isActive: true, rewardsEnabled: true, name: true, currency: true },
  });
  if (!restaurant || !restaurant.isActive) return NextResponse.json({ ok: false, reason: "invalid" }, { status: 404 });
  if (!restaurant.rewardsEnabled) return NextResponse.json({ ok: false, reason: "rewards_off" }, { status: 400 });

  const res = await verifyCode({ restaurantId: restaurant.id, code });
  if (!res.ok) return NextResponse.json({ ok: false, reason: res.reason });

  const grant = await prisma.pendingRewardGrant.findUnique({
    where: { id: res.grantId },
    select: { note: true },
  });

  return NextResponse.json({
    ok: true,
    amountLabel: formatCurrency(res.amount, restaurant.currency),
    restaurantName: restaurant.name,
    note: grant?.note ?? null,
  });
}
