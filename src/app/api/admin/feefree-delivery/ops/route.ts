import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { getFeeFreeDeliveryOpsData } from "@/lib/feefree-delivery-ops";
import { PLATFORM_CURRENCY } from "@/lib/utils";
import prisma from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/feefree-delivery/ops
 *
 * 10-second-poll payload for the restaurant-role shell in the Fee Free
 * Delivery app (v1.1 Phase 6, plan §4.1 / §5.4). Returns everything the
 * Dispatch and Account tabs need in a single round trip so the tabs never
 * spin their own intervals.
 *
 * Auth: getSessionUser() first; restaurantId ALWAYS from the session —
 * never from the client (AGENTS.md). 401 → the shell hard-navigates
 * /driver/login.
 *
 * Money split (plan §8): held/active order totals are restaurant money
 * (omitted here — Dispatch tab doesn't show prices); owed/settlement figures
 * are PLATFORM money (PLATFORM_CURRENCY). Never copy the hardcoded usd()
 * from FeeFreeDeliveryOps.tsx — that is the pattern we are eliminating.
 *
 * SEAM (plan §5.4): a per-restaurant ~5 s micro-cache on this payload would
 * cut DB load at 10k restaurants × 10s polling (= ~1k rps to the ops
 * queries). An LRU-TTL cache keyed on restaurantId is the right insertion
 * point — not built now to avoid premature complexity.
 */
export async function GET() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  // Role gate: getSessionUser() FALLS BACK to the kitchen session (path=/
  // cookie), and a kitchen login is designed not to grant the dispatch/
  // billing surface (the same reason /driver/page.tsx reads the admin
  // session directly for hasOtherRole, and admin/layout.tsx bounces
  // kitchen_staff). Gate on `role` — NOT effectiveRole — so impersonating
  // superadmins/resellers still pass (session.ts keeps their real role).
  if (!restaurantId || user?.role === "kitchen_staff") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch config (enabled/autoSend) alongside the five ops queries so all six
  // run in parallel — one round trip to the DB.
  const [cfg, opsData] = await Promise.all([
    prisma.feeFreeDeliveryConfig.findUnique({
      where: { restaurantId },
      select: { enabled: true, autoSend: true },
    }),
    getFeeFreeDeliveryOpsData(restaurantId),
  ]);

  const { owed, deliveredThisWeek, charge, held, active, rest, currency } = opsData;

  return NextResponse.json({
    enabled: cfg?.enabled ?? false,
    autoSend: cfg?.autoSend ?? false,
    /** Outstanding delivery bill this cycle (fees + driver tips) — render with
     *  `currency` below (the restaurant's own currency, B4). */
    owedCents: owed,
    deliveredThisWeek,
    nextChargeAt: charge.toISOString(),
    /** The restaurant's OWN billing currency — delivery bills in it, not the
     *  global USD PLATFORM_CURRENCY (B4, Luigi 2026-07-24). */
    currency: currency ?? PLATFORM_CURRENCY,
    // Held orders: only id/orderNumber/customerName needed by the Dispatch tab
    // (no prices — the tab dispatches, it does not show payment summaries).
    held: held.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      customerName: o.customerName,
    })),
    // Active deliveries: full subset needed by the Dispatch tab status view.
    active: active.map((a) => ({
      id: a.id,
      status: a.status,
      driver: a.driver
        ? { name: a.driver.name, ratingPct: a.driver.ratingPct }
        : null,
      order: {
        orderNumber: a.order.orderNumber,
        customerName: a.order.customerName,
        deliveryLat: a.order.deliveryLat,
        deliveryLng: a.order.deliveryLng,
      },
    })),
    /** Store coordinates for the restaurant→customer haversine distance
     *  (common.kmFromStore convention — never "trip distance", plan §3.3). */
    restLat: rest?.lat ?? null,
    restLng: rest?.lng ?? null,
  });
}
