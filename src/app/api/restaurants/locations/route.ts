import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { isRestaurantAdmin } from "@/lib/roles";
import { slugify } from "@/lib/utils";

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

  // Resolve the brand's parent. If the caller's restaurant has a parent, walk
  // up. Otherwise treat the caller's restaurant as the parent.
  const current = await prisma.restaurant.findUnique({
    where: { id: user.restaurantId },
    select: { id: true, parentRestaurantId: true },
  });
  if (!current) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });

  const parentId = current.parentRestaurantId ?? current.id;

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
 *   - Starts in `trialing` for 14 days like any new restaurant.
 *   - Each location has its own Stripe subscription (per locked decision).
 *   - Owner gains owner-level RestaurantAccess on the new location so the
 *     access helper admits them there.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !isRestaurantAdmin(user.role) || !user.restaurantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Caller's restaurantId points at the parent (their primary owned restaurant).
  // If they're already viewing a child location via active_location, walk up.
  const current = await prisma.restaurant.findUnique({
    where: { id: user.restaurantId },
    select: { id: true, parentRestaurantId: true, name: true },
  });
  if (!current) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  const parentId = current.parentRestaurantId ?? current.id;

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim().slice(0, 100);
  if (name.length < 2) {
    return NextResponse.json({ error: "Location name is required" }, { status: 400 });
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
      phone,
      address,
      city,
      state,
      zip,
      ...(country ? { country } : {}),
      parentRestaurantId: parentId,
      resellerProfileId: parent?.resellerProfileId ?? null,
      subscriptionStatus: "trialing",
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
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

  // Grant the owner explicit access on the child so the RBAC helper admits
  // them when they switch to that location.
  await prisma.restaurantAccess.create({
    data: {
      userId: user.id,
      restaurantId: newLocation.id,
      accessRole: "owner",
      grantedBy: user.id,
    },
  });

  return NextResponse.json({
    ok: true,
    location: { id: newLocation.id, name: newLocation.name, slug: newLocation.slug },
  });
}
