import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { isBrandParent } from "@/lib/brand";
import { hasFeature } from "@/lib/entitlements";
import {
  ADVANCED_PROMO_ADDON_SLUG,
  ADVANCED_PROMO_FEATURE,
  isLockedType,
} from "@/lib/promo-types";
import {
  clampMin,
  normalizeBannerHeadline,
  normalizeCustomerType,
  normalizeImageUrl,
  normalizeJsonStringList,
  normalizeNonNegativeFloat,
  normalizeOrderType,
  normalizeRuleConfig,
  normalizeStackingRule,
  normalizeChannel,
  resolveDisplayFields,
} from "@/lib/promo-fields";

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
    minimumOrder, rules, ruleConfig,
    daysOfWeek, startsAt, endsAt, usageLimit, autoApply, couponCode,
    scope, channel,
    usableHourStart, usableHourEnd, showOnBanner, bannerHeadline,
    paymentMethodSlugs, deliveryZoneIds, onceLifetimePerClient,
    imageUrl, displayMode, highlightThreshold,
  } = body;

  if (!name || !promotionType) {
    return NextResponse.json({ error: "name and promotionType required" }, { status: 400 });
  }

  // ── Feature gate: Grant Reward Dollars needs the program ON ─────────
  // Type 14 grants store credit — meaningless (and confusing) when Reward
  // Dollars is disabled. The wizard hides the card; this is the server-side
  // backstop (standing rule: feature-gated surfaces, Luigi 2026-07-03).
  if (promotionType === "reward_credit") {
    const r = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { rewardsEnabled: true },
    });
    if (!r?.rewardsEnabled) {
      return NextResponse.json(
        { error: "Enable Reward Dollars first — this promotion type grants store credit." },
        { status: 400 },
      );
    }
  }

  // ── Entitlement gate (Types 6-13) ──────────────────────────────────
  // The 8 locked types require the Advanced Promo Marketing add-on.
  // Fail-fast 403 so the wizard can render an upgrade CTA.
  let requiredAddOnSlug: string | null = null;
  if (isLockedType(promotionType)) {
    const ok = await hasFeature(restaurantId, ADVANCED_PROMO_FEATURE);
    if (!ok) {
      return NextResponse.json(
        {
          error: "Advanced Promo Marketing add-on required for this promo type.",
          requiredAddOnSlug: ADVANCED_PROMO_ADDON_SLUG,
          requiredFeature: ADVANCED_PROMO_FEATURE,
        },
        { status: 403 },
      );
    }
    requiredAddOnSlug = ADVANCED_PROMO_ADDON_SLUG;
  }

  // Only brand parents can create "brand"-scoped promotions.
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

  // Unique coupon code per restaurant
  if (couponCode) {
    const existing = await prisma.promotion.findFirst({
      where: { restaurantId, couponCode: { equals: couponCode } },
    });
    if (existing) {
      return NextResponse.json({ error: "Coupon code already in use" }, { status: 409 });
    }
  }

  // VISIBLE/HIDDEN invariant (Luigi 2026-06-26): hidden ⇒ no auto-apply / no
  // banner; any code-required promo (hidden, or visible-but-not-auto) needs a code.
  const display = resolveDisplayFields({ displayMode, autoApply, showOnBanner, couponCode });
  if (display.error === "code_required") {
    return NextResponse.json({ error: "A code-required promotion needs a coupon code.", code: "code_required" }, { status: 400 });
  }

  const promo = await prisma.promotion.create({
    data: {
      restaurantId,
      name,
      description: description || null,
      promotionType,
      isActive: isActive ?? true,
      stackingRule: normalizeStackingRule(stackingRule),
      orderType: normalizeOrderType(orderType),
      customerType: normalizeCustomerType(customerType),
      minimumOrder: minimumOrder ?? 0,
      // Legacy `rules` String — empty {} default. New wizards write
      // `ruleConfig` (Json) instead.
      rules: typeof rules === "string" ? rules : JSON.stringify(rules ?? {}),
      ruleConfig: normalizeRuleConfig(ruleConfig) as object,
      // Store a day-of-week restriction ONLY when it's a real subset
      // (1–6 days). Empty array = no days selected, and a full 7 = every
      // day; both mean "no restriction" → null. Storing "[]" here used to
      // kill the promo on every day (Luigi 2026-06-02).
      daysOfWeek: Array.isArray(daysOfWeek) && daysOfWeek.length > 0 && daysOfWeek.length < 7
        ? JSON.stringify(daysOfWeek)
        : null,
      startsAt: startsAt ? new Date(startsAt) : null,
      endsAt: endsAt ? new Date(endsAt) : null,
      usageLimit: usageLimit ?? null,
      autoApply: display.autoApply,
      couponCode: couponCode || null,
      scope: resolvedScope,
      channel: normalizeChannel(channel),
      usableHourStart: clampMin(usableHourStart),
      usableHourEnd: clampMin(usableHourEnd),
      showOnBanner: display.showOnBanner,
      bannerHeadline: normalizeBannerHeadline(bannerHeadline),
      // Phase 2a restrictions + display fields
      paymentMethodSlugs: normalizeJsonStringList(paymentMethodSlugs, 8),
      deliveryZoneIds: normalizeJsonStringList(deliveryZoneIds, 64),
      onceLifetimePerClient: !!onceLifetimePerClient,
      // Limited Showtime retired (render-only/dead) — always empty going forward.
      limitedShowtimeSchedules: [],
      imageUrl: normalizeImageUrl(imageUrl),
      displayMode: display.displayMode,
      highlightThreshold: normalizeNonNegativeFloat(highlightThreshold),
      requiredAddOnSlug,
    },
  });

  return NextResponse.json(promo, { status: 201 });
}
