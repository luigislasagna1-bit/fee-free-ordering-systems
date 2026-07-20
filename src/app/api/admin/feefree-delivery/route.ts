import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { hasFeature } from "@/lib/entitlements";
import { restaurantHasOnlinePayments } from "@/lib/shipday";
import { isFeeFreeServiceArea } from "@/lib/feefree-delivery";

/**
 * FeeFreeDelivery config — our OWN in-house driver pool, a sibling to the
 * ShipDay config (NOT overloaded onto ShipdayConfig). When enabled it takes
 * precedence over ShipDay in resolveDeliveryProvider, so turning it on routes
 * every new delivery order to a FeeFree driver instead.
 *
 * GET  → current config (creates a default row on first read so the form binds).
 * PUT  → update enabled / autoSend / customerFeeMode / customerFee.
 *
 * Owner-scoped and gated on the `driver_pool` entitlement (same add-on that
 * unlocks ShipDay). Enabling requires a working online payment method — like
 * ShipDay, FeeFree drivers only pick up + drop off (never collect at the door),
 * so dispatched orders must be prepaid (assertDispatchable enforces this too).
 */

const FEE_MODE_OK = new Set(["pass_through", "flat", "absorb"]);

export async function GET() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cfg =
    (await prisma.feeFreeDeliveryConfig.findUnique({ where: { restaurantId } })) ??
    // Default to MANUAL dispatch (autoSend off): a new delivery order should
    // NOT auto-fly to a driver — the restaurant decides per order until they opt
    // into auto-dispatch (Luigi 2026-07-14).
    (await prisma.feeFreeDeliveryConfig.create({ data: { restaurantId, autoSend: false } }));

  return NextResponse.json({
    enabled: cfg.enabled,
    autoSend: cfg.autoSend,
    customerFeeMode: cfg.customerFeeMode,
    customerFee: cfg.customerFee,
  });
}

export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  // Role gate (LR-SEC-02): getSessionUser() FALLS BACK to the kitchen session,
  // and a kitchen login must be read-only on the dispatch surface — it must
  // never flip the provider/enable or change fee settings. Gate on `role` —
  // NOT effectiveRole — so impersonating superadmins/resellers still pass.
  if (!restaurantId || user?.role === "kitchen_staff") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};

  if (typeof body.enabled === "boolean") update.enabled = body.enabled;
  if (typeof body.autoSend === "boolean") update.autoSend = body.autoSend;

  if (typeof body.customerFeeMode === "string") {
    if (!FEE_MODE_OK.has(body.customerFeeMode)) {
      return NextResponse.json({ error: "Invalid customerFeeMode" }, { status: 400 });
    }
    update.customerFeeMode = body.customerFeeMode;
  }

  if (body.customerFee === null) {
    update.customerFee = null;
  } else if (typeof body.customerFee === "number" && body.customerFee >= 0) {
    update.customerFee = body.customerFee;
  }

  // Entitlement + online-payment gates apply only to the ENABLING transition,
  // mirroring the ShipDay driver-pool route. Turning FeeFree OFF, or tweaking
  // fee settings while it's already off, always passes through.
  if (update.enabled === true) {
    // Geo-gate: FeeFree drivers only serve their home region (≤100km of the base).
    const r = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { lat: true, lng: true } });
    if (!isFeeFreeServiceArea(r?.lat, r?.lng)) {
      return NextResponse.json(
        {
          error: "Fee Free Delivery isn't available in your area yet. It currently serves the Greater Toronto Area (within 100 km of Milton). ShipDay dispatch is available everywhere.",
          code: "not_in_service_area",
        },
        { status: 412 },
      );
    }
    if (!(await hasFeature(restaurantId, "driver_pool"))) {
      return NextResponse.json(
        {
          error: "Subscribe to Driver Pool to dispatch with Fee Free Delivery.",
          code: "addon_required",
        },
        { status: 412 },
      );
    }
    if (!(await restaurantHasOnlinePayments(restaurantId))) {
      return NextResponse.json(
        {
          error:
            "Fee Free Delivery needs an online payment method first. Your drivers only pick up and drop off — they can't collect at the door — so delivery orders must be paid online. Enable card payments (Settings → Payments) or connect PayPal, then turn Fee Free Delivery on.",
          code: "online_payment_required",
        },
        { status: 412 },
      );
    }
  }

  await prisma.feeFreeDeliveryConfig.upsert({
    where: { restaurantId },
    // Manual by default — auto-send is opt-in (spread lets an explicit autoSend
    // in the body win). See the GET default above.
    create: { restaurantId, autoSend: false, ...update },
    update,
  });

  return NextResponse.json({ ok: true });
}
