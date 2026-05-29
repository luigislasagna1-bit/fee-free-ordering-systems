import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { isBrandParent } from "@/lib/brand";

async function getRestaurantId() {
  const user = await getSessionUser();
  return user?.restaurantId ?? null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const restaurantId = await getRestaurantId();
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const body = await req.json();
  const {
    name, description, promotionType, isActive, stackingRule, orderType, customerType,
    minimumOrder, rules, daysOfWeek, startsAt, endsAt, usageLimit, autoApply, couponCode,
    scope,
    usableHourStart, usableHourEnd, showOnBanner, bannerHeadline,
  } = body;

  const clampMin = (v: unknown): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.min(1440, Math.floor(n)));
  };

  // If trying to flip scope to/from "brand", verify this restaurant is
  // actually a brand parent. We don't want a child-location admin
  // promoting one of their own promos to "brand" — there's nothing to
  // inherit it.
  let scopeUpdate: { scope: string } | {} = {};
  if (scope === "brand" || scope === "location") {
    if (scope === "brand" && !(await isBrandParent(restaurantId))) {
      return NextResponse.json(
        { error: "Only brand parent restaurants can mark promos as chain-wide." },
        { status: 403 },
      );
    }
    scopeUpdate = { scope };
  }

  // Check coupon uniqueness if changing code
  if (couponCode !== undefined) {
    const existing = await prisma.promotion.findFirst({
      where: { restaurantId, couponCode: { equals: couponCode }, id: { not: id } },
    });
    if (existing) {
      return NextResponse.json({ error: "Coupon code already in use" }, { status: 409 });
    }
  }

  const promo = await prisma.promotion.update({
    where: { id, restaurantId },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(promotionType !== undefined && { promotionType }),
      ...(isActive !== undefined && { isActive }),
      ...(stackingRule !== undefined && { stackingRule }),
      ...(orderType !== undefined && { orderType }),
      ...(customerType !== undefined && { customerType }),
      ...(minimumOrder !== undefined && { minimumOrder }),
      ...(rules !== undefined && { rules: typeof rules === "string" ? rules : JSON.stringify(rules) }),
      ...(daysOfWeek !== undefined && { daysOfWeek: daysOfWeek ? JSON.stringify(daysOfWeek) : null }),
      ...(startsAt !== undefined && { startsAt: startsAt ? new Date(startsAt) : null }),
      ...(endsAt !== undefined && { endsAt: endsAt ? new Date(endsAt) : null }),
      ...(usageLimit !== undefined && { usageLimit }),
      ...(autoApply !== undefined && { autoApply }),
      ...(couponCode !== undefined && { couponCode: couponCode || null }),
      ...(usableHourStart !== undefined && { usableHourStart: clampMin(usableHourStart) }),
      ...(usableHourEnd !== undefined && { usableHourEnd: clampMin(usableHourEnd) }),
      ...(showOnBanner !== undefined && { showOnBanner: !!showOnBanner }),
      ...(bannerHeadline !== undefined && {
        bannerHeadline: typeof bannerHeadline === "string" && bannerHeadline.trim()
          ? bannerHeadline.trim().slice(0, 80)
          : null,
      }),
      ...scopeUpdate,
    },
  });

  return NextResponse.json(promo);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const restaurantId = await getRestaurantId();
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await prisma.promotion.delete({ where: { id, restaurantId } });
  return NextResponse.json({ ok: true });
}
