/**
 * POST /api/restaurants/[slug]/account/forgot-password
 *
 * Per-restaurant customer "request a password reset" endpoint. Mirrors
 * the marketplace-side /api/customer/forgot-password but scoped to a
 * single restaurant — the password reset token persists on the
 * Customer row (Customer.passwordResetToken + passwordResetExpiresAt),
 * which already lives in the schema, so no migration is required.
 *
 * Multi-location: chain customers exist as a separate Customer row at
 * every chain location (replicated at signup time). We resolve by
 * (this restaurant id, email) which always finds the local row — no
 * special chain handling needed.
 *
 * Anti-enumeration: always return { ok: true } regardless of whether
 * the email is on file. Stops attackers from probing the customer
 * database via the forgot-password endpoint.
 *
 * Rate-limited 5 / hour / IP per restaurant — same posture as the
 * marketplace flow.
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { sendPasswordResetEmail } from "@/lib/email";

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const ip = getClientIp(req);
  if (!rateLimit(`rest-cust-forgot:${slug}:${ip}`, 5, 60 * 60_000)) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: { id: true, isActive: true, name: true, defaultLanguage: true },
  });
  if (!restaurant || !restaurant.isActive) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }

  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const cleanEmail = (body.email || "").trim().toLowerCase().slice(0, 254);
  if (!cleanEmail) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  try {
    const customer = await prisma.customer.findFirst({
      where: { restaurantId: restaurant.id, email: cleanEmail, passwordHash: { not: null } },
      select: { id: true, email: true, name: true },
    });

    // Always-true posture for anti-enumeration. Log internally so we can
    // diagnose "I never got the email" cases — almost always a different
    // email than the one on file.
    if (!customer || !customer.email) {
      console.log("[restaurant forgot-password] no account for", slug, cleanEmail);
      return NextResponse.json({ ok: true });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60_000); // 1 hour

    await prisma.customer.update({
      where: { id: customer.id },
      data: {
        passwordResetToken: token,
        passwordResetExpiresAt: expiresAt,
      },
    });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
    const resetUrl = `${baseUrl}/order/${slug}/account/reset-password?token=${token}`;
    await sendPasswordResetEmail({
      to: customer.email,
      name: customer.name,
      resetUrl,
      locale: restaurant.defaultLanguage || "en",
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("[POST /api/restaurants/[slug]/account/forgot-password]", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
