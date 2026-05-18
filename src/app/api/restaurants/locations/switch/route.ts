import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/db";
import { getSessionUser, ACTIVE_LOCATION_COOKIE } from "@/lib/session";
import { isRestaurantAdmin } from "@/lib/roles";

/**
 * POST /api/restaurants/locations/switch
 * body: { restaurantId: string }
 *
 * Sets the active_location cookie. Validates that the target is either the
 * caller's parent restaurant OR one of its children. 8h TTL — same lifetime
 * as the impersonation cookies for consistency.
 *
 * DELETE clears the cookie (back to the parent).
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !isRestaurantAdmin(user.role) || !user.restaurantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const targetId: string | undefined = body?.restaurantId;
  if (!targetId) {
    return NextResponse.json({ error: "Missing restaurantId" }, { status: 400 });
  }

  // CANONICAL parent lookup — DO NOT use user.restaurantId here. After a
  // prior switch, getSessionUser() applies the active_location cookie and
  // returns the *child* as restaurantId. Validating against that would
  // reject any attempt to switch back to the parent (the bug we're fixing).
  // The User.restaurantId column always points at the canonical owning
  // (parent) restaurant — fetch it fresh.
  const userRow = await prisma.user.findUnique({
    where: { id: user.id },
    select: { restaurantId: true },
  });
  const parentId = userRow?.restaurantId;
  if (!parentId) {
    return NextResponse.json({ error: "User has no owning restaurant" }, { status: 403 });
  }

  // Allowed targets:
  //   - the parent itself (back to root)
  //   - any child whose parentRestaurantId === parentId
  let allowed = false;
  if (targetId === parentId) {
    allowed = true;
  } else {
    const target = await prisma.restaurant.findUnique({
      where: { id: targetId },
      select: { parentRestaurantId: true },
    });
    allowed = target?.parentRestaurantId === parentId;
  }

  if (!allowed) {
    return NextResponse.json({ error: "Location not in your brand" }, { status: 403 });
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_LOCATION_COOKIE, targetId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 60 * 60,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_LOCATION_COOKIE);
  return NextResponse.json({ ok: true });
}
