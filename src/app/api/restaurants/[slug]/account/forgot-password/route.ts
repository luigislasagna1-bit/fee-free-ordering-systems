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
import { restaurantOrderUrl } from "@/lib/restaurant-url";

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const ip = getClientIp(req);
  if (!rateLimit(`rest-cust-forgot:${slug}:${ip}`, 5, 60 * 60_000)) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: {
      id: true,
      isActive: true,
      name: true,
      defaultLanguage: true,
      slug: true,
      subdomain: true,
      customDomain: true,
      customDomainStatus: true,
    },
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
    // Match by restaurant + email only. We DO NOT require an existing
    // passwordHash — Luigi 2026-06-01: customers who placed an order
    // (and so have a Customer row) but never set a password were being
    // silently dropped here, so the form showed "Check your inbox" but
    // no email fired. Reset-password endpoint already handles the
    // null-hash case (it just sets the new hash), so the reset email
    // doubles as a "set your password for the first time" flow — same
    // UX as Toast/Skip/Uber where guest customers get promoted to
    // password-holders via the reset link.
    //
    // Duplicate-row safety: same problem as the login endpoint —
    // multiple Customer rows can exist for the same (restaurantId,
    // email). Prefer the row that already has a passwordHash so
    // subsequent reset emails consistently land on the SAME row the
    // login picks. Otherwise the reset and the login can disagree
    // about "which Luigi" — symptom: reset works, immediate sign-in
    // works (auto-cookie sets), but next manual sign-in fails because
    // the login picks a different row that hasn't been updated.
    const candidates = await prisma.customer.findMany({
      where: { restaurantId: restaurant.id, email: cleanEmail },
      select: { id: true, email: true, name: true, passwordHash: true },
    });
    const customer =
      candidates.find((c) => !!c.passwordHash) ?? candidates[0] ?? null;

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

    const resetUrl = restaurantOrderUrl(restaurant, `/account/reset-password?token=${token}`);
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
