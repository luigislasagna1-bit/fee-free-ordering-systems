import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { isRestaurantAdmin } from "@/lib/roles";
import { slugify } from "@/lib/utils";
import { sendPasswordResetEmail } from "@/lib/email";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * GET /api/restaurants/locations
 * Returns the caller's "brand" — the parent restaurant + all child locations.
 * The caller must be a restaurant_admin whose User.restaurantId is the parent
 * (i.e. a top-level Restaurant). Child-restaurant admins still see the full
 * tree they belong to.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user || !isRestaurantAdmin(user.role) || !user.restaurantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Brand role from the CANONICAL owning restaurant (User.restaurantId), not the
  // cookie-swapped active location. A CHILD admin (their own restaurant has a
  // parent) sees ONLY their own location — never the brand HQ or siblings. Only
  // the brand-parent owner sees the whole tree. Luigi 2026-06-10.
  const userRow = await prisma.user.findUnique({ where: { id: user.id }, select: { restaurantId: true } });
  const canonical = userRow?.restaurantId
    ? await prisma.restaurant.findUnique({ where: { id: userRow.restaurantId }, select: { id: true, parentRestaurantId: true } })
    : null;
  if (!canonical) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });

  if (canonical.parentRestaurantId) {
    const self = await prisma.restaurant.findUnique({
      where: { id: canonical.id },
      select: { id: true, name: true, slug: true, subscriptionStatus: true, city: true, state: true },
    });
    return NextResponse.json({ parent: self, children: [] });
  }

  const parentId = canonical.id;

  const [parent, children] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: parentId },
      select: {
        id: true,
        name: true,
        slug: true,
        subscriptionStatus: true,
        city: true,
        state: true,
      },
    }),
    prisma.restaurant.findMany({
      where: { parentRestaurantId: parentId },
      select: {
        id: true,
        name: true,
        slug: true,
        subscriptionStatus: true,
        city: true,
        state: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return NextResponse.json({ parent, children });
}

/**
 * POST /api/restaurants/locations
 * body: { name, phone?, address?, city?, state?, zip?, country? }
 *
 * Creates a new child Restaurant under the caller's brand parent. The new
 * location:
 *   - Inherits no menu/hours/etc. (each location is independent — owners can
 *     duplicate from the parent later if they want).
 *   - Lands on the FREE plan ($0/mo, 100 orders/month cap). No trial.
 *   - Each location subscribes to paid add-ons independently (Unlimited
 *     Orders, Marketplace, etc.).
 *   - Owner gains owner-level RestaurantAccess on the new location so the
 *     access helper admits them there.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !isRestaurantAdmin(user.role) || !user.restaurantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Only the BRAND-PARENT owner may add locations. Resolve the role from the
  // canonical User.restaurantId (not the cookie-swapped active location): a
  // child admin's own restaurant has a parent → they manage only their own
  // location and cannot create siblings. Luigi 2026-06-10.
  const userRow = await prisma.user.findUnique({ where: { id: user.id }, select: { restaurantId: true } });
  const canonical = userRow?.restaurantId
    ? await prisma.restaurant.findUnique({ where: { id: userRow.restaurantId }, select: { id: true, parentRestaurantId: true } })
    : null;
  if (!canonical) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  if (canonical.parentRestaurantId) {
    return NextResponse.json(
      { error: "Only the brand owner can add locations. Manage from your brand HQ account." },
      { status: 403 },
    );
  }
  const parentId = canonical.id;

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim().slice(0, 100);
  if (name.length < 2) {
    return NextResponse.json({ error: "Location name is required" }, { status: 400 });
  }

  // Each location is its OWN separately-billed restaurant, so it gets its OWN
  // admin login (Luigi 2026-06-10): a mandatory email becomes that location's
  // account identity AND its sign-in. We provision a User now and email them a
  // set-password link; the parent still manages the location from HQ.
  const email = String(body.email ?? "").trim().toLowerCase().slice(0, 254);
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "A valid login email is required for the new location" }, { status: 400 });
  }
  // Email is a login identity — must be unique across all accounts. Reject a
  // taken address with a clear message instead of a raw constraint error.
  const emailTaken = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (emailTaken) {
    return NextResponse.json(
      { error: "That email already has an account. Use a different email for this location." },
      { status: 409 },
    );
  }

  const phone = body.phone ? String(body.phone).trim().slice(0, 30) : null;
  const address = body.address ? String(body.address).trim().slice(0, 200) : null;
  const city = body.city ? String(body.city).trim().slice(0, 100) : null;
  const state = body.state ? String(body.state).trim().slice(0, 100) : null;
  const zip = body.zip ? String(body.zip).trim().slice(0, 20) : null;
  const country = body.country ? String(body.country).trim().slice(0, 2) : undefined;

  // Slug must be globally unique. Append a counter when needed.
  let slug = slugify(name);
  let slugExists = await prisma.restaurant.findUnique({ where: { slug } });
  let counter = 1;
  while (slugExists) {
    slug = `${slugify(name)}-${counter++}`;
    slugExists = await prisma.restaurant.findUnique({ where: { slug } });
  }

  const starterPlan = await prisma.subscriptionPlan.findUnique({ where: { slug: "starter" } });

  // Inherit reseller attribution from the parent — if the parent is under a
  // reseller, the new location is too.
  const parent = await prisma.restaurant.findUnique({
    where: { id: parentId },
    select: { resellerProfileId: true },
  });

  const newLocation = await prisma.restaurant.create({
    data: {
      name,
      slug,
      subdomain: slug,
      email,
      phone,
      address,
      city,
      state,
      zip,
      ...(country ? { country } : {}),
      parentRestaurantId: parentId,
      resellerProfileId: parent?.resellerProfileId ?? null,
      // Every new restaurant lands on the FREE plan. No trial — they
      // stay on free forever unless they (a) hit the 100 orders/month
      // soft cap and upgrade to Unlimited Orders, or (b) subscribe to
      // any paid add-on, both of which flip subscriptionStatus to
      // "active". trialEndsAt is intentionally not set.
      subscriptionStatus: "free",
      subscriptionPlanId: starterPlan?.id || null,
    },
  });

  // Default opening hours for every day of the week — same default as the
  // /api/auth/register flow.
  for (let i = 0; i < 7; i++) {
    await prisma.openingHours.create({
      data: {
        restaurantId: newLocation.id,
        dayOfWeek: i,
        isOpen: true,
        openTime: "09:00",
        closeTime: "21:00",
      },
    });
  }

  // Grant the PARENT owner explicit access on the child so they can keep
  // managing it from HQ (switch into it).
  await prisma.restaurantAccess.create({
    data: {
      userId: user.id,
      restaurantId: newLocation.id,
      accessRole: "owner",
      grantedBy: user.id,
    },
  });

  // Provision the location's OWN admin account. Random unguessable password —
  // the owner sets their real one via the emailed link (so we never transmit a
  // password). emailVerifiedAt is stamped now: the parent vouches for it, and
  // clicking the set-password link re-proves inbox control.
  let inviteEmailed = false;
  try {
    const randomHash = await bcrypt.hash(crypto.randomBytes(24).toString("hex"), 12);
    const childUser = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash: randomHash,
        role: "restaurant_admin",
        restaurantId: newLocation.id,
        emailVerifiedAt: new Date(),
      },
    });
    // The child owner gets owner access on their OWN location (and only it).
    await prisma.restaurantAccess.create({
      data: { userId: childUser.id, restaurantId: newLocation.id, accessRole: "owner", grantedBy: user.id },
    });

    // Set-password link (reuses the password-reset flow). 30-day window — this
    // is an onboarding invite, not a self-service reset, so it lives longer.
    const token = crypto.randomBytes(32).toString("hex");
    await prisma.passwordResetToken.create({
      data: { token, userId: childUser.id, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    });
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
    try {
      await sendPasswordResetEmail({
        to: email,
        name,
        resetUrl: `${baseUrl}/reset-password?token=${token}`,
        locale: undefined,
      });
      inviteEmailed = true;
    } catch (err) {
      // A mail outage must NOT fail location creation — the account exists; the
      // owner can use "Forgot password" to get a fresh link. Luigi 2026-06-10.
      console.error("[locations] set-password email failed", err);
    }
  } catch (err) {
    // The location is already created + parent-managed; a failure here just means
    // no separate login yet (e.g. a rare email race). Surface a soft warning.
    console.error("[locations] child login provisioning failed", err);
  }

  return NextResponse.json({
    ok: true,
    inviteEmailed,
    location: { id: newLocation.id, name: newLocation.name, slug: newLocation.slug },
  });
}
