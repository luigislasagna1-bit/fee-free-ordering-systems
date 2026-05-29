import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { isBrandParent } from "@/lib/brand";

export async function GET() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Show locally-owned promos AND any brand-scoped promos owned by the
  // parent (read-only at the child — the child can see them but the
  // edit/delete endpoints reject non-owning restaurants).
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { parentRestaurantId: true },
  });
  const ownerIds: string[] = [restaurantId];
  if (restaurant?.parentRestaurantId) ownerIds.push(restaurant.parentRestaurantId);

  const promotions = await prisma.promotion.findMany({
    where: {
      OR: [
        { restaurantId },                                            // own
        { restaurantId: { in: ownerIds }, scope: "brand" },           // brand-wide from parent
      ],
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(promotions);
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    name, description, promotionType, isActive, stackingRule, orderType, customerType,
    minimumOrder, rules, daysOfWeek, startsAt, endsAt, usageLimit, autoApply, couponCode,
    scope,
    // Fabrizio 2026-05-28: hour-of-day usability window + customer-banner
    // display. Server-side clamp + null pass-through so the form can
    // leave them blank without provoking a constraint error.
    usableHourStart, usableHourEnd, showOnBanner, bannerHeadline,
  } = body;

  const clampMin = (v: unknown): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.min(1440, Math.floor(n)));
  };

  // Only brand parents can create "brand"-scoped promotions. A standalone
  // restaurant or a child location asking for brand scope is rejected —
  // brand scope is meaningless when there are no children to inherit it.
  let resolvedScope: "location" | "brand" = "location";
  if (scope === "brand") {
    if (!(await isBrandParent(restaurantId))) {
      return NextResponse.json(
        { error: "Only brand parent restaurants can create chain-wide promotions." },
        { status: 403 },
      );
    }
    resolvedScope = "brand";
  }

  if (!name || !promotionType) {
    return NextResponse.json({ error: "name and promotionType required" }, { status: 400 });
  }

  // Unique coupon code per restaurant
  if (couponCode) {
    const existing = await prisma.promotion.findFirst({
      where: { restaurantId, couponCode: { equals: couponCode } },
    });
    if (existing) {
      return NextResponse.json({ error: "Coupon code already in use" }, { status: 409 });
    }
  }

  const promo = await prisma.promotion.create({
    data: {
      restaurantId,
      name,
      description: description || null,
      promotionType,
      isActive: isActive ?? true,
      stackingRule: stackingRule ?? "standard",
      orderType: orderType ?? "both",
      customerType: customerType ?? "any",
      minimumOrder: minimumOrder ?? 0,
      rules: typeof rules === "string" ? rules : JSON.stringify(rules ?? {}),
      daysOfWeek: daysOfWeek ? JSON.stringify(daysOfWeek) : null,
      startsAt: startsAt ? new Date(startsAt) : null,
      endsAt: endsAt ? new Date(endsAt) : null,
      usageLimit: usageLimit ?? null,
      autoApply: autoApply ?? true,
      couponCode: couponCode || null,
      scope: resolvedScope,
      usableHourStart: clampMin(usableHourStart),
      usableHourEnd: clampMin(usableHourEnd),
      showOnBanner: showOnBanner === undefined ? true : !!showOnBanner,
      bannerHeadline: typeof bannerHeadline === "string" && bannerHeadline.trim()
        ? bannerHeadline.trim().slice(0, 80)
        : null,
    },
  });

  return NextResponse.json(promo, { status: 201 });
}
