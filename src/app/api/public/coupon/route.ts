import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { formatCurrency } from "@/lib/utils";

export async function GET(req: NextRequest) {
  // Rate limit: 10 coupon attempts per IP per minute to prevent brute-force
  const ip = getClientIp(req);
  if (!rateLimit(`coupon:${ip}`, 10, 60_000)) {
    return NextResponse.json({ error: "Too many attempts. Please wait before trying again." }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code")?.toUpperCase().trim().slice(0, 50);
  const restaurantSlug = searchParams.get("restaurantSlug")?.trim().slice(0, 100);
  const subtotal = Math.max(0, parseFloat(searchParams.get("subtotal") || "0"));

  if (!code || !restaurantSlug) return NextResponse.json({ error: "Missing parameters" }, { status: 400 });

  const restaurant = await prisma.restaurant.findUnique({ where: { slug: restaurantSlug } });
  if (!restaurant) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });

  // Standalone coupons were retired (Luigi 2026-06-26) — codes now live on
  // PROMOTIONS (a hidden promo carries the couponCode; personal/assigned codes
  // are migrated promotions + a CustomerCoupon grant). So we resolve the typed
  // code straight against Promotion.couponCode. When the customer types a code
  // matching a Promotion's couponCode, accept it.
  // The actual discount math is dynamic (depends on cart contents +
  // promo type) so we don't return a fixed `discount` here — the next
  // call to /api/public/apply-promos picks up the entered code in the
  // body and the engine evaluates the promo against the live cart.
  //
  // We still validate: promo must exist, be active, in date window,
  // and (if minimumOrder is set) the cart must meet it. This matches
  // GloriaFood's UX: "Code accepted" with the savings revealed at the
  // checkout step, not at code-entry time.
  const now = new Date();
  const promo = await prisma.promotion.findFirst({
    where: {
      restaurantId: restaurant.id,
      couponCode: code,
      isActive: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    select: { id: true, name: true, minimumOrder: true, autoApply: true, promotionType: true, usageLimit: true, usedCount: true },
  });

  if (promo) {
    if (promo.usageLimit != null && promo.usedCount >= promo.usageLimit) {
      return NextResponse.json({ error: "This promo has reached its usage limit" }, { status: 400 });
    }
    // Only enforce the minimum when there's actually a cart to judge. On an
    // EMPTY cart (subtotal 0) — e.g. the account "Use this offer" button / email
    // link lands here BEFORE any items are added — accept the code optimistically
    // and let the engine (apply-promos) + the order route enforce the minimum
    // once items exist. Rejecting at subtotal 0 fired a spurious "minimum order"
    // error the instant the customer arrived AND, because the client threw, never
    // registered the coupon — so the "not applied, a bigger deal won" cart message
    // could never show. Luigi 2026-07-01.
    if (promo.minimumOrder > 0 && subtotal > 0 && subtotal < promo.minimumOrder) {
      return NextResponse.json(
        { error: `Minimum order of ${formatCurrency(promo.minimumOrder, restaurant.currency)} required for this promo` },
        { status: 400 },
      );
    }
    return NextResponse.json({
      // No legacy Coupon row to attach to the Order — promo apply happens
      // via the engine + couponCode passthrough. Returning null tells
      // the client "accepted, but no fixed discount; engine will compute."
      id: null,
      discount: 0,
      source: "promotion",
      promoId: promo.id,
      promoName: promo.name,
      autoApply: promo.autoApply,
    });
  }

  return NextResponse.json({ error: "Invalid or expired coupon" }, { status: 400 });
}
