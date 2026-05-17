import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/db";
import { getSessionUser, isResellerView, PARTNER_IMPERSONATE_COOKIE } from "@/lib/session";

/**
 * POST — body { restaurantId } sets the partner_impersonate cookie if the
 *        reseller actually owns access to that restaurant. 8-hour TTL.
 * DELETE — clears the cookie.
 *
 * We re-validate access in getSessionUser() on every request so a cookie set
 * before a restaurant was reassigned/suspended is automatically ignored.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isResellerView(user) || !user.resellerProfileId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const restaurantId: string | undefined = body?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Missing restaurantId" }, { status: 400 });

  // Must be linked to this reseller's profile and the reseller must be approved.
  const [restaurant, profile] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { resellerProfileId: true },
    }),
    prisma.resellerProfile.findUnique({
      where: { id: user.resellerProfileId },
      select: { status: true },
    }),
  ]);
  if (
    restaurant?.resellerProfileId !== user.resellerProfileId ||
    profile?.status !== "approved"
  ) {
    return NextResponse.json({ error: "Restaurant not in your account" }, { status: 403 });
  }

  const cookieStore = await cookies();
  cookieStore.set(PARTNER_IMPERSONATE_COOKIE, restaurantId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 60 * 60, // 8 hours
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isResellerView(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const cookieStore = await cookies();
  cookieStore.delete(PARTNER_IMPERSONATE_COOKIE);
  return NextResponse.json({ ok: true });
}
