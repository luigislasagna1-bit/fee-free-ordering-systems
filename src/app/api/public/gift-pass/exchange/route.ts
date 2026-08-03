/**
 * POST /api/public/gift-pass/exchange — the ONLY place `ff_gift_pass` is
 * minted. Body: { slug, code }. Resolves the code, refuses uniformly on any
 * not-found/wrong-restaurant, resolves-or-creates the guest-twin wallet
 * holder, claims ONLY this pass's grant, and sets a fresh single-active
 * browser session cookie (killing any prior device holding the same code).
 *
 * `redirectTo` is ALWAYS the relative path `/order/<slug>` — never the
 * origin root, which the proxy rewrites to the MARKETING page for
 * hosted-site tenants (the exact trap that stranded Luigi's first test
 * recipient — see the comment in admin/reward-gifts/route.ts).
 */
import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/db";
import { rateLimitShared, getClientIp } from "@/lib/rate-limit";
import { exchangePass, giftPassCookieOptions, normalizeCode, hashCode } from "@/lib/gift-wallet-pass";

/** sha256(ip + UTC-day salt) — never a raw IP at rest, per lastIpHash's contract. */
function dailyIpHash(ip: string): string {
  const day = new Date().toISOString().slice(0, 10);
  return crypto.createHash("sha256").update(`${day}:${ip}`).digest("hex");
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!(await rateLimitShared(`giftpass-exchange:ip:${ip}`, 10, 60_000))) {
    return NextResponse.json({ ok: false, reason: "rate_limited" }, { status: 429 });
  }

  let body: { slug?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });
  }
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  const rawCode = typeof body.code === "string" ? body.code : "";
  if (!slug || !rawCode) return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: { id: true, slug: true, isActive: true, rewardsEnabled: true },
  });
  if (!restaurant || !restaurant.isActive) return NextResponse.json({ ok: false, reason: "invalid" }, { status: 404 });
  if (!restaurant.rewardsEnabled) return NextResponse.json({ ok: false, reason: "rewards_off" }, { status: 400 });

  // Per-grant throttle needs the normalized code's hash to look up the pass
  // row's grantId WITHOUT a separate mutating call — normalizeCode/hashCode
  // are pure, so this costs nothing extra and lets us rate-limit by grant
  // (20/hour) in addition to by IP, bounding a targeted attacker even if
  // they rotate IPs.
  const normalized = normalizeCode(rawCode);
  if (normalized) {
    const codeHash = hashCode(normalized);
    const existingPass = await prisma.giftWalletPass.findUnique({ where: { codeHash }, select: { grantId: true } });
    if (existingPass) {
      if (!(await rateLimitShared(`giftpass-exchange:grant:${existingPass.grantId}`, 20, 3_600_000))) {
        return NextResponse.json({ ok: false, reason: "rate_limited" }, { status: 429 });
      }
    }
  }

  const result = await exchangePass({
    restaurantId: restaurant.id,
    restaurantSlug: restaurant.slug,
    code: rawCode,
    ipHash: dailyIpHash(ip),
  });

  if (!result.ok) return NextResponse.json({ ok: false, reason: result.reason });

  // Mint the cookie on the host the request arrived on — never proxy through
  // another origin. This IS the reason the cookie is minted at click-time.
  const store = await cookies();
  store.set({ ...giftPassCookieOptions(), value: result.sessionSecret });

  return NextResponse.json({ ok: true, balance: result.balance, redirectTo: result.redirectTo });
}
