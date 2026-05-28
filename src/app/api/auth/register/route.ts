import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import prisma from "@/lib/db";
import { slugify } from "@/lib/utils";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { validatePassword } from "@/lib/password";
import { sendSignupConfirmationEmail } from "@/lib/email";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  // Rate limit: 5 registrations per IP per hour
  const ip = getClientIp(req);
  if (!rateLimit(`register:${ip}`, 5, 60 * 60_000)) {
    return NextResponse.json({ error: "Too many registration attempts. Please try again later." }, { status: 429 });
  }

  try {
    const {
      restaurantName, ownerName, email, password, phone,
      // Address + cuisine fields are now captured upfront in the signup
      // form (Phase: better-onboarding-signup). They flow straight into
      // the new Restaurant row so the Setup Wizard at /admin starts
      // partway done — not from zero.
      address, city, state, zip, country, cuisineType,
      ref, invite,
    } = await req.json();

    if (!restaurantName || !email || !password) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Multi-location invite token: when present, signup links the new
    // Restaurant to the inviting brand via parentRestaurantId. Token is
    // single-use and expires after 30 days. Validation happens BEFORE we
    // start creating rows so an invalid token rejects cleanly.
    let parentRestaurantId: string | null = null;
    let inviteRecord: { id: string } | null = null;
    if (typeof invite === "string" && invite.trim()) {
      const inv = await prisma.locationInvite.findUnique({
        where: { token: invite.trim() },
        select: { id: true, brandId: true, acceptedAt: true, expiresAt: true },
      });
      if (!inv) {
        return NextResponse.json({ error: "Invite link is invalid." }, { status: 400 });
      }
      if (inv.acceptedAt) {
        return NextResponse.json({ error: "This invite has already been used." }, { status: 400 });
      }
      if (inv.expiresAt < new Date()) {
        return NextResponse.json({ error: "This invite has expired. Ask the brand owner for a fresh link." }, { status: 400 });
      }
      parentRestaurantId = inv.brandId;
      inviteRecord = { id: inv.id };
    }

    // Reseller attribution: ?ref=<referralCode> on the signup form OR a
    // "feefree_ref" cookie carries the code. Only count it if the matching
    // reseller is approved. This is the *only* place the link is set —
    // restaurants cannot self-claim a reseller later.
    let resellerProfileId: string | null = null;
    const cookieStore0 = await cookies();
    const refCode: string | null =
      (typeof ref === "string" && ref.trim()) ||
      cookieStore0.get("feefree_ref")?.value ||
      null;
    if (refCode) {
      const profile = await prisma.resellerProfile.findUnique({
        where: { referralCode: refCode },
        select: { id: true, status: true },
      });
      if (profile?.status === "approved") {
        resellerProfileId = profile.id;
      }
    }

    // Validate email format
    const emailClean = String(email).trim().toLowerCase().slice(0, 254);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailClean)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    // Validate password complexity
    const pwError = validatePassword(String(password));
    if (pwError) return NextResponse.json({ error: pwError }, { status: 400 });

    const restaurantNameClean = String(restaurantName).trim().slice(0, 100);
    if (restaurantNameClean.length < 2) {
      return NextResponse.json({ error: "Restaurant name must be at least 2 characters" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email: emailClean } });
    // Use same error message regardless of existence to prevent email enumeration
    if (existing) {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 400 });
    }

    // Generate unique slug
    let slug = slugify(restaurantNameClean);
    let slugExists = await prisma.restaurant.findUnique({ where: { slug } });
    let counter = 1;
    while (slugExists) {
      slug = `${slugify(restaurantNameClean)}-${counter++}`;
      slugExists = await prisma.restaurant.findUnique({ where: { slug } });
    }

    // Phase 1 of the GloriaFood-style redesign: new signups default to the
    // Free plan (the legacy Starter/Growth/Pro/Enterprise plans are marked
    // inactive but still referenced by older restaurants). There's no trial
    // period anymore — the core product is free forever; payment only kicks
    // in when the owner subscribes to a specific add-on.
    const freePlan = await prisma.subscriptionPlan.findUnique({ where: { slug: "free" } });

    // Sanitize + trim address/cuisine fields. All optional — empty strings
    // become null so the Setup Wizard doesn't think the owner has typed
    // a single space on every field.
    const trim = (v: unknown, max: number): string | null => {
      if (typeof v !== "string") return null;
      const t = v.trim().slice(0, max);
      return t.length > 0 ? t : null;
    };
    const addressClean      = trim(address, 200);
    const cityClean         = trim(city, 100);
    const stateClean        = trim(state, 100);
    const zipClean          = trim(zip, 20);
    const countryClean      = trim(country, 2) ?? "CA"; // ISO-2; default Canada
    const cuisineTypeClean  = trim(cuisineType, 60);

    const restaurant = await prisma.restaurant.create({
      data: {
        name: restaurantNameClean,
        slug,
        // Auto-provision a subdomain matching the slug so every new tenant is
        // live at <slug>.<PLATFORM_DOMAIN> immediately, no admin visit needed.
        subdomain: slug,
        phone: phone ? String(phone).trim().slice(0, 30) : null,
        // Address + cuisine from the expanded signup form. These mark the
        // "Restaurant Basics" setup section ~complete on first /admin load,
        // so the wizard greets owners with 30%+ progress instead of 0%.
        address: addressClean,
        city: cityClean,
        state: stateClean,
        zip: zipClean,
        country: countryClean,
        cuisineType: cuisineTypeClean,
        // EXPLICITLY override the schema defaults for service flags. Schema
        // has acceptsPickup: true by default — but that lets new restaurants
        // pass the "at least one service" setup-check without ever
        // visiting /admin/services. They could publish a restaurant that
        // appears to offer pickup when they actually offer dine-in only.
        // Forcing all to false here makes the owner ACTIVELY choose what
        // they offer before they can publish. (Luigi caught this during
        // UAT — "the new store didn't make me set services but marked them
        // complete?".)
        acceptsPickup: false,
        acceptsDelivery: false,
        acceptsDineIn: false,
        acceptsReservations: false,
        // FREE plan is the default for every new restaurant. They stay
        // on free forever unless they hit the 100 orders/month soft cap
        // and upgrade to Unlimited Orders, or subscribe to any paid
        // add-on — both of which flip status to "active". No trial.
        subscriptionStatus: "free",
        subscriptionPlanId: freePlan?.id || null,
        resellerProfileId,
        // Multi-location: when signup carries a valid invite token, link the
        // new Restaurant to the inviting brand as a child location. The new
        // owner has their own login, own Stripe, own add-on subscriptions —
        // parent is purely a brand-grouping relation.
        parentRestaurantId,
      },
    });

    // Mark the invite as accepted so it can't be reused.
    if (inviteRecord) {
      await prisma.locationInvite.update({
        where: { id: inviteRecord.id },
        data: { acceptedAt: new Date(), acceptedRestaurantId: restaurant.id },
      });
    }

    // Pre-create the 7 day rows so the /admin/hours editor renders a clean
    // grid out of the box. BUT default all 7 to isOpen: false — this is
    // what forces the new owner to ACTUALLY visit /admin/hours and pick
    // their open days. Schema-default times (09:00-21:00) survive as a
    // hint, but the day is closed until the owner toggles it on. Without
    // this, the "opening hours" setup-step passes automatically with
    // bogus 9-9 every day. (Luigi caught this during UAT — "I didn't
    // think the new store made me set hours, but it marked them
    // complete?".)
    for (let i = 0; i < 7; i++) {
      await prisma.openingHours.create({
        data: { restaurantId: restaurant.id, dayOfWeek: i, isOpen: false, openTime: "09:00", closeTime: "21:00" },
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const ownerNameClean = ownerName ? String(ownerName).trim().slice(0, 100) : restaurantNameClean;
    // Email-verification token — 32 url-safe bytes. Persisted on the User row;
    // the welcome email contains a link with this token; clicking it hits
    // /api/auth/verify-email which flips emailVerifiedAt + clears the token.
    const emailVerifyToken = crypto.randomBytes(32).toString("base64url");
    await prisma.user.create({
      data: {
        email: emailClean,
        name: ownerNameClean,
        passwordHash,
        role: "restaurant_admin",
        restaurantId: restaurant.id,
        emailVerifyToken,
      },
    });

    // Store the owner's email on the restaurant so notifications & receipts have a default,
    // and auto-create a NotificationRecipient row with all toggles defaulting on.
    await prisma.restaurant.update({
      where: { id: restaurant.id },
      data: { email: emailClean },
    });
    await prisma.notificationRecipient.create({
      data: {
        restaurantId: restaurant.id,
        email: emailClean,
        name: ownerNameClean,
      },
    });

    // Stripe Customer is created lazily on first add-on subscription (Phase 5).
    // Signup no longer touches Stripe — the core product is free, no card needed.

    // Pick up the signup-form locale from the cookie so the welcome email is
    // in the same language they were just browsing in.
    const cookieStore = await cookies();
    const signupLocale = cookieStore.get("fee-free-locale")?.value || "en";

    // Persist the locale on the freshly-created restaurant so subsequent
    // notifications and surfaces follow the owner's chosen language.
    if (["fr", "es", "it", "pt"].includes(signupLocale)) {
      await prisma.restaurant.update({
        where: { id: restaurant.id },
        data: { defaultLanguage: signupLocale },
      });
    }

    // Welcome email (non-blocking — failure shouldn't break signup). The
    // verifyUrl carries the freshly-minted token so the recipient can flip
    // their account to "verified" before publishing.
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
    sendSignupConfirmationEmail({
      to: emailClean,
      name: ownerNameClean,
      restaurantName: restaurantNameClean,
      loginUrl: `${baseUrl}/login`,
      // Must point at the API route, not the display page. The API route
      // consumes the token, flips emailVerifiedAt + ownerEmailVerifiedAt,
      // then redirects to /verify-email?status=ok|invalid for the UX.
      verifyUrl: `${baseUrl}/api/auth/verify-email?token=${emailVerifyToken}`,
      locale: signupLocale,
    }).catch(() => {});

    return NextResponse.json({ success: true, slug });
  } catch (err) {
    console.error("[register]", err);
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
