/**
 * POST /api/customer/forgot-password
 *
 * Customer-side mirror of /api/auth/forgot-password (which is for
 * restaurant-owner `User` accounts). Generates a one-time reset token,
 * persists it to CustomerPasswordResetToken with a 1-hour TTL, and emails
 * the user a /account/reset-password?token=… link using the new
 * PasswordReset React Email template.
 *
 * Anti-enumeration: we always return { ok: true } regardless of whether
 * the email is on file — attackers must not be able to probe the user
 * database via the forgot-password endpoint.
 *
 * Rate-limited 5 / hour / IP — same posture as the restaurant flow.
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { sendPasswordResetEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!rateLimit(`customer-forgot:${ip}`, 5, 60 * 60_000)) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }

  try {
    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase().slice(0, 254);
    const account = await prisma.customerAccount.findUnique({
      where: { email: cleanEmail },
      select: { id: true, email: true, name: true },
    });

    // Anti-enumeration: always claim success even if the email isn't on
    // file. Log internally so we can debug "I never got the email" cases
    // (most often it's because the customer used a different address).
    if (!account) {
      console.log("[customer forgot-password] no account for", cleanEmail);
      return NextResponse.json({ ok: true });
    }

    // Burn any prior unused tokens so an attacker who got hold of an
    // older reset email can't use it now.
    await prisma.customerPasswordResetToken.deleteMany({
      where: { customerAccountId: account.id, usedAt: null },
    });

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60_000); // 1 hour

    await prisma.customerPasswordResetToken.create({
      data: { token, customerAccountId: account.id, expiresAt },
    });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
    const resetUrl = `${baseUrl}/account/reset-password?token=${token}`;
    await sendPasswordResetEmail({
      to: account.email,
      name: account.name,
      resetUrl,
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("[POST /api/customer/forgot-password]", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
