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

  // First try the legacy Coupon table (admin-assigned standalone codes
  // managed via /admin/promotions's coupon list). Discount is a fixed
  // amount or % computed here so the customer sees an immediate value.
  const coupon = await prisma.coupon.findUnique({
    where: { restaurantId_code: { restaurantId: restaurant.id, code } },
  });

  if (coupon) {
    if (!coupon.isActive) return NextResponse.json({ error: "Invalid or expired coupon" }, { status: 400 });
    if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) return NextResponse.json({ error: "Coupon has expired" }, { status: 400 });
    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) return NextResponse.json({ error: "Coupon has reached its usage limit" }, { status: 400 });
    if (coupon.minimumOrder > 0 && subtotal < coupon.minimumOrder) {
      return NextResponse.json({ error: `Minimum order of ${formatCurrency(coupon.minimumOrder, restaurant.currency)} required` }, { status: 400 });
    }

    const discount = coupon.discountType === "percentage"
      ? Math.min(subtotal * (coupon.discountValue / 100), subtotal)
      : Math.min(coupon.discountValue, subtotal);

    return NextResponse.json({
      id: coupon.id,
      discount: Math.round(discount * 100) / 100,
      source: "coupon",
    });
  }

  // Promotion.couponCode fallback (Phase 2 marketing suite). When the
  // customer types a code matching a Promotion's couponCode, accept it.
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
    if (promo.minimumOrder > 0 && subtotal < promo.minimumOrder) {
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
