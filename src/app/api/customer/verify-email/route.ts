/**
 * Customer-side email verification.
 *
 * Mirrors the User-side flow at /api/auth/verify-email but operates on
 * CustomerAccount. Two endpoints in one file:
 *
 *   GET ?token=...          consumes the token → emailVerifiedAt = now()
 *                           Redirects to /account?verified=ok|invalid for UX.
 *   POST                    "resend verification" — requires an authenticated
 *                           customer session. Issues a fresh token + emails it.
 *                           Rate-limited 5 / hour / customer account.
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/db";
import { sendVerifyEmail } from "@/lib/email";
import { getCurrentCustomer } from "@/lib/customer-session";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  // Redirect back to the customer account page with a status flag so we
  // can show a toast there. /account is the natural landing for both
  // success and failure (signed-in or not, they'll see something sane).
  const base = new URL(req.url);
  base.pathname = "/account";
  base.search = "";

  if (!token || token.length < 16 || token.length > 128) {
    base.searchParams.set("verified", "invalid");
    return NextResponse.redirect(base);
  }

  const account = await prisma.customerAccount.findUnique({
    where: { emailVerifyToken: token },
    select: { id: true, emailVerifiedAt: true },
  });
  if (!account) {
    base.searchParams.set("verified", "invalid");
    return NextResponse.redirect(base);
  }

  // Idempotent — clicking a stale link after success still lands cleanly.
  await prisma.customerAccount.update({
    where: { id: account.id },
    data: {
      emailVerifiedAt: account.emailVerifiedAt ?? new Date(),
      emailVerifyToken: null,
    },
  });

  base.searchParams.set("verified", "ok");
  return NextResponse.redirect(base);
}

/**
 * POST — "Resend verification email." Requires a signed-in customer.
 * Rate-limited so a single account can't abuse it.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!rateLimit(`customer-resend-verify:${ip}`, 5, 60 * 60_000)) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }

  const me = await getCurrentCustomer();
  if (!me) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  if (me.emailVerifiedAt) {
    return NextResponse.json({ ok: true, alreadyVerified: true });
  }

  const token = crypto.randomBytes(32).toString("base64url");
  await prisma.customerAccount.update({
    where: { id: me.id },
    data: { emailVerifyToken: token },
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
  await sendVerifyEmail({
    to: me.email,
    name: me.name,
    verifyUrl: `${baseUrl}/api/customer/verify-email?token=${token}`,
  }).catch((err) => {
    console.error("[customer verify POST] send failed", err);
  });

  return NextResponse.json({ ok: true });
}
