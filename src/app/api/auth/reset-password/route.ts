import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/db";
import { validatePassword } from "@/lib/password";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!rateLimit(`reset:${ip}`, 10, 60 * 60_000)) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }

  try {
    const { token, password } = await req.json();
    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Invalid reset link" }, { status: 400 });
    }
    const pwError = validatePassword(password);
    if (pwError) return NextResponse.json({ error: pwError }, { status: 400 });

    const tokenRow = await prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!tokenRow || tokenRow.usedAt) {
      return NextResponse.json({ error: "Reset link invalid or already used. Request a new one." }, { status: 400 });
    }
    if (tokenRow.expiresAt < new Date()) {
      return NextResponse.json({ error: "Reset link expired. Request a new one." }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.$transaction([
      prisma.user.update({ where: { id: tokenRow.userId }, data: { passwordHash } }),
      prisma.passwordResetToken.update({ where: { id: tokenRow.id }, data: { usedAt: new Date() } }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[POST /api/auth/reset-password]", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
