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

  // The user's User.restaurantId is the parent. Allow switching to:
  //   - the parent itself (back to root)
  //   - any child whose parentRestaurantId === parentId
  // (Don't trust the cookie alone in getSessionUser — same DB check here.)
  let allowed = false;
  if (targetId === user.restaurantId) {
    allowed = true;
  } else {
    const target = await prisma.restaurant.findUnique({
      where: { id: targetId },
      select: { parentRestaurantId: true },
    });
    allowed = target?.parentRestaurantId === user.restaurantId;
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
