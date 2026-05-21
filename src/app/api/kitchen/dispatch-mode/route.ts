import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { hasFeature } from "@/lib/entitlements";

/**
 * Kitchen-display delivery dispatch toggle.
 *
 * GET  → returns the current dispatch state: deliverySource (own/shipday/
 *        both), activeDispatchMode (own/shipday), whether the restaurant
 *        has the driver_pool entitlement, and whether the picker should
 *        be shown at all (only when deliverySource === "both").
 *
 * PUT { activeDispatchMode: "own" | "shipday" }
 *      → flips the active dispatch mode for the restaurant. ONLY valid
 *        when deliverySource = "both". For "own" or "shipday" sources
 *        the dispatch is hardcoded by the admin setting and this endpoint
 *        returns 400.
 *
 * Auth: kitchen_staff OR restaurant_admin (with their restaurant context).
 * Superadmin impersonation also works since the session carries the
 * restaurantId from impersonation cookies.
 */

export async function GET() {
  const user = await getSessionUser({ preferKitchen: true });
  if (!user?.restaurantId) {
    return NextResponse.json({ error: "no_restaurant" }, { status: 401 });
  }

  const [config, hasDriverPool] = await Promise.all([
    prisma.shipdayConfig.findUnique({
      where: { restaurantId: user.restaurantId },
      select: { deliverySource: true, activeDispatchMode: true, enabled: true },
    }),
    hasFeature(user.restaurantId, "driver_pool"),
  ]);

  // No ShipdayConfig row at all → restaurant hasn't visited the driver
  // pool config page yet. Default to "own" for both fields so the
  // kitchen surface shows the right state.
  const deliverySource = config?.deliverySource ?? "own";
  const activeDispatchMode = config?.activeDispatchMode ?? "own";

  return NextResponse.json({
    deliverySource,
    activeDispatchMode,
    hasDriverPool,
    // True when the kitchen should render a toggle. Only "both" mode
    // surfaces the toggle — single-source modes are admin-controlled.
    showToggle: deliverySource === "both" && hasDriverPool,
  });
}

export async function PUT(req: NextRequest) {
  const user = await getSessionUser({ preferKitchen: true });
  if (!user?.restaurantId) {
    return NextResponse.json({ error: "no_restaurant" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const next = body?.activeDispatchMode;
  if (next !== "own" && next !== "shipday") {
    return NextResponse.json(
      { error: "activeDispatchMode must be 'own' or 'shipday'" },
      { status: 400 },
    );
  }

  const config = await prisma.shipdayConfig.findUnique({
    where: { restaurantId: user.restaurantId },
    select: { id: true, deliverySource: true },
  });
  if (!config || config.deliverySource !== "both") {
    return NextResponse.json(
      {
        error: "Dispatch mode can only be toggled when delivery source is set to 'Both'. Update your admin settings first.",
        code: "not_in_both_mode",
      },
      { status: 400 },
    );
  }

  // Selecting "shipday" requires the driver_pool entitlement. If their
  // subscription lapsed since they configured "both", the toggle should
  // refuse to send orders to a pool that's no longer paid for.
  if (next === "shipday") {
    const entitled = await hasFeature(user.restaurantId, "driver_pool");
    if (!entitled) {
      return NextResponse.json(
        {
          error: "Driver Pool subscription has lapsed. Re-subscribe before routing orders to ShipDay.",
          code: "addon_required",
        },
        { status: 412 },
      );
    }
  }

  await prisma.shipdayConfig.update({
    where: { id: config.id },
    data: { activeDispatchMode: next },
  });
  return NextResponse.json({ ok: true, activeDispatchMode: next });
}
