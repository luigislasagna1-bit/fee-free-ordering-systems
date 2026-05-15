import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { sendPasswordResetEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!rateLimit(`forgot:${ip}`, 5, 60 * 60_000)) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }

  try {
    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase().slice(0, 254);
    const user = await prisma.user.findUnique({
      where: { email: cleanEmail },
      include: { restaurant: { select: { defaultLanguage: true } } },
    });

    // Always return ok=true — never reveal whether the email exists (anti-enumeration).
    if (!user) {
      console.log("[forgot-password] no user for", cleanEmail);
      return NextResponse.json({ ok: true });
    }

    // Burn any previous unused tokens
    await prisma.passwordResetToken.deleteMany({
      where: { userId: user.id, usedAt: null },
    });

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60_000); // 1 hour

    await prisma.passwordResetToken.create({
      data: { token, userId: user.id, expiresAt },
    });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
    const resetUrl = `${baseUrl}/reset-password?token=${token}`;
    await sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      resetUrl,
      locale: user.restaurant?.defaultLanguage || "en",
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[POST /api/auth/forgot-password]", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
