import { NextRequest, NextResponse, after } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { isSuperadmin } from "@/lib/roles";
import { notifyResellerRestaurantAssigned } from "@/lib/platform-notifications";

/**
 * POST /api/superadmin/restaurants/[id]/assign-reseller
 * body: { resellerProfileId: string | null }
 *
 * Sets (or clears) the reseller a restaurant is attributed to. Unlike the
 * older resellers/[id]/reassign-restaurant route — which can only MOVE a
 * restaurant that's already under a reseller — this handles the INITIAL
 * null → reseller case. That's exactly what's needed to retro-fix signups
 * whose ?ref= attribution was lost (the pre-fix bug where the signup form
 * never forwarded the referral code). Superadmin only.
 *
 * - Validates the target reseller exists + is approved.
 * - Strips stale RestaurantAccess rows from the PREVIOUS reseller's user.
 * - Notifies the newly-attributed reseller (best-effort, post-response).
 * Does NOT rewrite historical CommissionTransaction rows — past commissions
 * stay with whoever earned them.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!isSuperadmin(user?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: restaurantId } = await params;
  const body = await req.json().catch(() => ({}));
  const newResellerProfileId: string | null =
    typeof body?.resellerProfileId === "string" && body.resellerProfileId.trim()
      ? body.resellerProfileId.trim()
      : null;

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { id: true, name: true, resellerProfileId: true },
  });
  if (!restaurant) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });

  // No-op if nothing changes — keep it idempotent (double-click safe).
  if (newResellerProfileId === restaurant.resellerProfileId) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  if (newResellerProfileId) {
    const newProfile = await prisma.resellerProfile.findUnique({
      where: { id: newResellerProfileId },
      select: { status: true },
    });
    if (!newProfile) return NextResponse.json({ error: "Target reseller not found" }, { status: 404 });
    if (newProfile.status !== "approved") {
      return NextResponse.json({ error: "Target reseller is not approved" }, { status: 409 });
    }
  }

  // Strip stale access for the OLD reseller's user (if any) — mirrors the
  // reassign-restaurant route so a moved restaurant doesn't leave the prior
  // reseller with lingering access.
  let oldResellerUserId: string | null = null;
  if (restaurant.resellerProfileId) {
    const oldReseller = await prisma.resellerProfile.findUnique({
      where: { id: restaurant.resellerProfileId },
      select: { userId: true },
    });
    oldResellerUserId = oldReseller?.userId ?? null;
  }

  await prisma.$transaction([
    prisma.restaurant.update({
      where: { id: restaurantId },
      data: { resellerProfileId: newResellerProfileId },
    }),
    ...(oldResellerUserId
      ? [prisma.restaurantAccess.deleteMany({ where: { userId: oldResellerUserId, restaurantId } })]
      : []),
  ]);

  // Tell the newly-attributed reseller — best-effort, after the response so a
  // slow/failed email never blocks the superadmin action.
  if (newResellerProfileId) {
    const target = newResellerProfileId;
    after(() => notifyResellerRestaurantAssigned(restaurantId, target));
  }

  return NextResponse.json({ ok: true });
}
