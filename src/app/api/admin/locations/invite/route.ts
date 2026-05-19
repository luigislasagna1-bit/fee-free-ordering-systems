import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { isRestaurantAdmin } from "@/lib/roles";
import { sendLocationInviteEmail } from "@/lib/email";
import { hasFeature } from "@/lib/entitlements";

/**
 * POST /api/admin/locations/invite
 * body: { email?: string | null, suggestedName?: string | null }
 *
 * Brand owner generates a single-use invite token for a new child location.
 * Recipient visits /signup?invite=<token> to complete their own signup;
 * a fresh Restaurant is created with parentRestaurantId pointing at the
 * brand parent.
 *
 * Optionally emails the recipient if they provided an address.
 *
 * Returns: { url, token, expiresAt }
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !isRestaurantAdmin(user.role) || !user.restaurantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // The user must currently be focused on the BRAND PARENT to send invites.
  // We use the canonical User.restaurantId (not the cookie-swapped active
  // location) so an owner can't accidentally try to invite from a child
  // location's context — the parent is the authoritative brand owner.
  const userRow = await prisma.user.findUnique({
    where: { id: user.id },
    select: { restaurantId: true },
  });
  const brandId = userRow?.restaurantId;
  if (!brandId) {
    return NextResponse.json({ error: "Owner has no restaurant" }, { status: 403 });
  }

  // The brand must already BE a multi-location brand parent (or at least be
  // eligible to become one). Technically a single-location restaurant can
  // also use this — sending an invite is what *creates* the multi-location
  // relationship — so we don't require isBrandParent() here. Just ensure
  // the user's restaurant has no parent of its own (you can't have a child
  // of a child, brand hierarchy is two levels max).
  const brand = await prisma.restaurant.findUnique({
    where: { id: brandId },
    select: { id: true, name: true, parentRestaurantId: true },
  });
  if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  if (brand.parentRestaurantId) {
    return NextResponse.json(
      { error: "Locations under a parent can't add their own sub-locations. Manage from the brand HQ." },
      { status: 400 }
    );
  }

  // Multi-location is a paid add-on. The brand must have the
  // `multi_location_management` entitlement (granted by the "Multi-Location"
  // add-on) before they can invite a new location. The very first location
  // is the brand parent itself — that's free and uncapped. This gate only
  // fires when they try to ADD a 2nd+ location.
  //
  // Note: existing brands that ALREADY have multiple locations are
  // grandfathered — we only block NEW invites, not retroactively kill
  // their setup. So we don't check existing childCount here, just gate
  // the create.
  if (!(await hasFeature(brandId, "multi_location_management"))) {
    // Soft gate: friendly message + machine-readable code so the UI can
    // route to the add-ons page.
    return NextResponse.json(
      {
        error: "Adding more locations requires the Multi-Location add-on. Subscribe at /admin/billing/add-ons to enable it.",
        code: "feature_locked",
        feature: "multi_location_management",
      },
      { status: 402 },
    );
  }

  const body = await req.json().catch(() => ({} as any));
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase().slice(0, 254) : null;
  const suggestedName = typeof body?.suggestedName === "string" ? body.suggestedName.trim().slice(0, 100) : null;

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
  }

  // Generate a single-use URL-safe token. 32 bytes = 43 chars in base64url.
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  await prisma.locationInvite.create({
    data: {
      brandId,
      token,
      email,
      suggestedName,
      createdByUserId: user.id,
      expiresAt,
    },
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
  const url = `${baseUrl}/signup?invite=${token}`;

  // Email the recipient. We AWAIT this rather than fire-and-forget because
  // Vercel terminates the serverless function as soon as the response is
  // returned — an unawaited fetch to Resend gets killed mid-flight and the
  // email is silently dropped (no Resend log, no error surface). Awaiting
  // adds ~300-800ms to the response but guarantees delivery. The catch
  // ensures a Resend outage doesn't break invite creation — the URL is
  // still returned and the user can copy/share it manually.
  let emailDelivered = false;
  if (email) {
    try {
      await sendLocationInviteEmail({
        to: email,
        brandName: brand.name,
        suggestedName,
        inviteUrl: url,
      });
      emailDelivered = true;
    } catch (err) {
      console.error("[locations/invite] email send failed", err);
    }
  }

  return NextResponse.json({
    url,
    token,
    expiresAt: expiresAt.toISOString(),
    // emailed === true means Resend accepted the request, NOT necessarily that
    // Gmail/Outlook actually delivered it (those can still spam-filter). If the
    // recipient says they didn't get it, fall back to copy-pasting the URL.
    emailed: emailDelivered,
  });
}
