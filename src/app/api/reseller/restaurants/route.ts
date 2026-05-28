import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser, isResellerView } from "@/lib/session";
import { isSuperadmin, ROLES } from "@/lib/roles";
import { slugify } from "@/lib/utils";
import { sendBillingNotificationEmail } from "@/lib/email";
import crypto from "crypto";

/**
 * GET /api/reseller/restaurants
 * Returns the list of restaurants linked to the calling reseller's profile.
 * Superadmin can pass ?resellerProfileId=<id> to view another reseller's list.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const queriedId = url.searchParams.get("resellerProfileId");

  let resellerProfileId: string | null = null;
  if (isSuperadmin(user.role) && queriedId) {
    resellerProfileId = queriedId;
  } else if (isResellerView(user) && user.resellerProfileId) {
    resellerProfileId = user.resellerProfileId;
  } else {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const restaurants = await prisma.restaurant.findMany({
    where: { resellerProfileId },
    select: {
      id: true,
      name: true,
      slug: true,
      subscriptionStatus: true,
      subscriptionPlanId: true,
      trialEndsAt: true,
      currentPeriodEnd: true,
      createdAt: true,
      email: true,
      // Active add-ons drive the per-restaurant service icons in the
      // reseller's Restaurants list (and full detail view). Only include
      // "active" or "trialing" — cancelled rows are noise the partner
      // doesn't need to see. The relation is named `addOns` on
      // Restaurant (see schema.prisma:200) — the join model itself is
      // `RestaurantAddOn`, easy to confuse.
      addOns: {
        where: { status: { in: ["active", "trialing"] } },
        select: {
          status: true,
          addOn: { select: { slug: true, name: true, monthlyPriceCents: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ restaurants });
}

/**
 * POST /api/reseller/restaurants
 * Invite a new restaurant under the reseller. Creates the Restaurant + an
 * owner User in inactive state (cannot log in until they set a password via
 * the emailed link). Restaurant.resellerProfileId is set at creation — this
 * is the only path that creates a reseller-linked restaurant directly (the
 * referral-code path in /api/auth/register is for self-signups).
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isResellerView(user) || !user.resellerProfileId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Reseller must be approved.
  const profile = await prisma.resellerProfile.findUnique({
    where: { id: user.resellerProfileId },
    select: { status: true },
  });
  if (profile?.status !== "approved") {
    return NextResponse.json({ error: "Your reseller account is not approved yet." }, { status: 403 });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const restaurantName: string = String(body.restaurantName ?? "").trim().slice(0, 100);
  const ownerName: string = String(body.ownerName ?? "").trim().slice(0, 100);
  const ownerEmail: string = String(body.ownerEmail ?? "").trim().toLowerCase().slice(0, 254);
  const phone: string | null = body.phone ? String(body.phone).trim().slice(0, 30) : null;
  // Optional address fields — captured upfront when the reseller fills
  // them in (mirrors GloriaFood PartnerNet's Add Restaurant form) so the
  // restaurant has working address data from day one. Restaurant owner
  // can still edit anything in /admin/settings later.
  const address: string | null = body.address ? String(body.address).trim().slice(0, 200) : null;
  const city: string | null = body.city ? String(body.city).trim().slice(0, 100) : null;
  const state: string | null = body.state ? String(body.state).trim().slice(0, 100) : null;
  const zip: string | null = body.zip ? String(body.zip).trim().slice(0, 20) : null;
  // Country defaults to "US" matching the schema default. Restricted to
  // a 2-letter ISO code; longer values get trimmed.
  const country: string = body.country
    ? String(body.country).trim().slice(0, 2).toUpperCase() || "US"
    : "US";

  if (restaurantName.length < 2) return NextResponse.json({ error: "Restaurant name required" }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) return NextResponse.json({ error: "Invalid owner email" }, { status: 400 });

  const existing = await prisma.user.findUnique({ where: { email: ownerEmail } });
  if (existing) {
    return NextResponse.json({ error: "An account with that email already exists" }, { status: 400 });
  }

  // Slug generation — same logic as /api/auth/register
  let slug = slugify(restaurantName);
  let slugExists = await prisma.restaurant.findUnique({ where: { slug } });
  let counter = 1;
  while (slugExists) {
    slug = `${slugify(restaurantName)}-${counter++}`;
    slugExists = await prisma.restaurant.findUnique({ where: { slug } });
  }

  const starterPlan = await prisma.subscriptionPlan.findUnique({ where: { slug: "starter" } });

  // Create restaurant + a placeholder User. The user has an unguessable
  // random "stub" password (they can never log in with it) — a password
  // reset link is what gets them in.
  const stubPassword = crypto.randomBytes(32).toString("hex");
  const bcrypt = (await import("bcryptjs")).default;
  const passwordHash = await bcrypt.hash(stubPassword, 12);

  const restaurant = await prisma.restaurant.create({
    data: {
      name: restaurantName,
      slug,
      subdomain: slug,
      phone,
      address,
      city,
      state,
      zip,
      country,
      email: ownerEmail,
      // Every new restaurant lands on the FREE plan. No trial. See
      // src/app/api/restaurants/locations/route.ts for the same rule
      // — kept in sync.
      subscriptionStatus: "free",
      subscriptionPlanId: starterPlan?.id || null,
      resellerProfileId: user.resellerProfileId,
    },
  });

  for (let i = 0; i < 7; i++) {
    await prisma.openingHours.create({
      data: { restaurantId: restaurant.id, dayOfWeek: i, isOpen: true, openTime: "09:00", closeTime: "21:00" },
    });
  }

  await prisma.user.create({
    data: {
      email: ownerEmail,
      name: ownerName || restaurantName,
      passwordHash,
      role: ROLES.RESTAURANT_ADMIN,
      restaurantId: restaurant.id,
      isActive: true,
    },
  });

  // Send a password reset link so the owner can set their own password and log in.
  // We piggy-back on the existing PasswordResetToken system.
  const token = crypto.randomBytes(32).toString("hex");
  const newUser = await prisma.user.findUnique({ where: { email: ownerEmail }, select: { id: true } });
  if (newUser) {
    await prisma.passwordResetToken.create({
      data: {
        token,
        userId: newUser.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7-day window
      },
    });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
  const setupUrl = `${baseUrl}/reset-password?token=${token}`;

  sendBillingNotificationEmail({
    to: ownerEmail,
    restaurantName,
    subject: `Set up your ${restaurantName} account`,
    headline: `Welcome to Fee Free Ordering`,
    body: `${user.name || "Your reseller"} has set up an account for <strong>${restaurantName}</strong> on Fee Free Ordering. Click below to set your password and log in.`,
    ctaLabel: "Set my password",
    ctaUrl: setupUrl,
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    restaurant: { id: restaurant.id, slug: restaurant.slug, name: restaurant.name },
  });
}
