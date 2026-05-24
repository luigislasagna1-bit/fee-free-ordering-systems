/**
 * POST /api/customer/reset-password
 *
 * Customer-side mirror of /api/auth/reset-password. Validates the token,
 * sets the new password hash, marks the token used. Single-use, expires
 * after 1 hour. Rate-limited 10 / hour / IP.
 *
 * After a successful reset we DO NOT auto-sign-in — the user has to
 * sign in with the new password. Reasons: (1) defense-in-depth in case
 * the reset email was intercepted, (2) consistent with the User-side
 * flow, (3) simpler — they're already at the reset page and a single
 * navigate to /account/login is fine.
 */
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/db";
import { validatePassword } from "@/lib/password";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!rateLimit(`customer-reset:${ip}`, 10, 60 * 60_000)) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }

  try {
    const { token, password } = await req.json();
    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Invalid reset link" }, { status: 400 });
    }
    const pwError = validatePassword(password);
    if (pwError) return NextResponse.json({ error: pwError }, { status: 400 });

    const tokenRow = await prisma.customerPasswordResetToken.findUnique({
      where: { token },
      include: { customerAccount: { select: { id: true } } },
    });

    if (!tokenRow || tokenRow.usedAt) {
      return NextResponse.json(
        { error: "Reset link invalid or already used. Request a new one." },
        { status: 400 },
      );
    }
    if (tokenRow.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "Reset link expired. Request a new one." },
        { status: 400 },
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.$transaction([
      prisma.customerAccount.update({
        where: { id: tokenRow.customerAccountId },
        data: { passwordHash },
      }),
      prisma.customerPasswordResetToken.update({
        where: { id: tokenRow.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("[POST /api/customer/reset-password]", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
