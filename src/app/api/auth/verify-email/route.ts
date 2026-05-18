import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/db";
import { sendVerifyEmail } from "@/lib/email";
import { getSessionUser } from "@/lib/session";

/**
 * GET /api/auth/verify-email?token=xxx
 *
 * Consumes the token. On success, sets:
 *   - User.emailVerifiedAt = now()
 *   - User.emailVerifyToken = null  (one-shot use)
 *   - Restaurant.ownerEmailVerifiedAt = now() (denormalized for setup checklist)
 *
 * Redirects back to /verify-email?status=ok or ?status=invalid so the
 * landing page can render a friendly result. We use a redirect (not JSON)
 * because the user reaches this URL by clicking an email link, and seeing
 * a UI page is far more useful than a JSON response.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const base = new URL(req.url);
  base.pathname = "/verify-email";
  base.search = "";

  if (!token || token.length < 16 || token.length > 128) {
    base.searchParams.set("status", "invalid");
    return NextResponse.redirect(base);
  }

  const user = await prisma.user.findUnique({
    where: { emailVerifyToken: token },
    select: { id: true, email: true, restaurantId: true, emailVerifiedAt: true },
  });
  if (!user) {
    base.searchParams.set("status", "invalid");
    return NextResponse.redirect(base);
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        emailVerifiedAt: user.emailVerifiedAt ?? now,
        emailVerifyToken: null,
      },
    });
    if (user.restaurantId) {
      await tx.restaurant.update({
        where: { id: user.restaurantId },
        data: { ownerEmailVerifiedAt: now },
      });
    }
  });

  base.searchParams.set("status", "ok");
  return NextResponse.redirect(base);
}

/**
 * POST /api/auth/verify-email
 *
 * "Resend verification email" — requires an authenticated session. Generates
 * a fresh token, saves it on the User row (invalidating any previous token),
 * and emails the verify link to the user's address.
 */
export async function POST(_req: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { id: true, email: true, name: true, emailVerifiedAt: true, restaurantId: true },
  });
  if (!user) return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  if (user.emailVerifiedAt) {
    return NextResponse.json({ ok: true, alreadyVerified: true });
  }

  const restaurant = user.restaurantId
    ? await prisma.restaurant.findUnique({
        where: { id: user.restaurantId },
        select: { defaultLanguage: true },
      })
    : null;

  const token = crypto.randomBytes(32).toString("base64url");
  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerifyToken: token },
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
  await sendVerifyEmail({
    to: user.email,
    name: user.name,
    // Point at the API route, not the page — see register/route.ts comment.
    verifyUrl: `${baseUrl}/api/auth/verify-email?token=${token}`,
    locale: restaurant?.defaultLanguage || "en",
  }).catch((err) => {
    console.error("[verify-email POST] send failed", err);
  });

  return NextResponse.json({ ok: true });
}
