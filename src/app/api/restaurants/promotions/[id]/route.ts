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
import { fixedDiscountMinError } from "@/lib/promo-validation";
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
    minimumOrder, rules, ruleConfig,
    daysOfWeek, startsAt, endsAt, usageLimit, autoApply, couponCode,
    scope, channel,
    usableHourStart, usableHourEnd, showOnBanner, bannerHeadline,
    paymentMethodSlugs, deliveryZoneIds, onceLifetimePerClient,
    imageUrl, displayMode, highlightThreshold,
  } = body;

  // ── Entitlement gate (Types 6-13) ──────────────────────────────────
  // If the patch changes the promotionType to a locked one (or already
  // locked promo is being edited), verify the add-on is active. We
  // ALSO check on edit-without-type-change so a restaurant who lapses
  // their advanced_promos subscription can't continue editing locked
  // promos. (They can still toggle isActive — that's handled below.)
  let requiredAddOnSlugUpdate: string | null | undefined = undefined;
  if (promotionType !== undefined) {
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
      requiredAddOnSlugUpdate = ADVANCED_PROMO_ADDON_SLUG;
    } else {
      // Switching from a locked type to a free one — clear the gate.
      requiredAddOnSlugUpdate = null;
    }
  }

  // ── Fixed-dollar discount sanity: min cart ≥ discount (see POST) ─────
  // The wizard sends the full config on save; for a partial patch we fall back
  // to the stored promo for any of {type, ruleConfig, minimumOrder} it omits so
  // lowering the minimum ALONE can't slip a "$30 off, $5 min" config past the
  // guard. Luigi 2026-07-07.
  if (promotionType !== undefined || minimumOrder !== undefined || ruleConfig !== undefined) {
    const current = await prisma.promotion.findFirst({
      where: { id, restaurantId },
      select: { promotionType: true, minimumOrder: true, ruleConfig: true },
    });
    const effType = (promotionType ?? current?.promotionType) ?? "";
    const effRc = ruleConfig ?? current?.ruleConfig;
    const effMin = minimumOrder ?? current?.minimumOrder;
    const minDiscErr = fixedDiscountMinError(effType, effRc, effMin);
    if (minDiscErr) return NextResponse.json(minDiscErr, { status: 400 });
  }

  // If trying to flip scope to/from "brand", verify this restaurant is
  // actually a brand parent.
  let scopeUpdate: { scope: string } | Record<string, never> = {};
  if (scope === "brand" || scope === "location") {
    if (scope === "brand" && !(await isBrandParent(restaurantId))) {
      return NextResponse.json(
        { error: "Only brand parent restaurants can mark promos as chain-wide." },
        { status: 403 },
      );
    }
    scopeUpdate = { scope };
  }

  // Check coupon uniqueness if the new code is a real non-empty string.
  // Skip the check when the wizard sends "" (which we normalise to null
  // below) — otherwise the query matches every other promo whose
  // couponCode is also "" and returns a false-positive 409.
  if (typeof couponCode === "string" && couponCode.trim() !== "") {
    const existing = await prisma.promotion.findFirst({
      where: { restaurantId, couponCode: { equals: couponCode }, id: { not: id } },
    });
    if (existing) {
      return NextResponse.json({ error: "Coupon code already in use" }, { status: 409 });
    }
  }

  // VISIBLE/HIDDEN invariant (Luigi 2026-06-26). The wizard sends the full form
  // on save (so displayMode is present) — resolve all three display fields
  // together. Partial toggles (e.g. just isActive from the list page) omit
  // displayMode and keep the per-field behaviour below.
  let displayUpdate: Record<string, unknown> = {};
  if (displayMode !== undefined) {
    const display = resolveDisplayFields({ displayMode, autoApply, showOnBanner, couponCode });
    if (display.error === "code_required") {
      return NextResponse.json({ error: "A code-required promotion needs a coupon code.", code: "code_required" }, { status: 400 });
    }
    displayUpdate = { displayMode: display.displayMode, autoApply: display.autoApply, showOnBanner: display.showOnBanner };
  } else {
    if (autoApply !== undefined) displayUpdate.autoApply = autoApply;
    if (showOnBanner !== undefined) displayUpdate.showOnBanner = !!showOnBanner;
  }

  const promo = await prisma.promotion.update({
    where: { id, restaurantId },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(promotionType !== undefined && { promotionType }),
      ...(isActive !== undefined && { isActive }),
      ...(stackingRule !== undefined && { stackingRule: normalizeStackingRule(stackingRule) }),
      ...(orderType !== undefined && { orderType: normalizeOrderType(orderType) }),
      ...(customerType !== undefined && { customerType: normalizeCustomerType(customerType) }),
      ...(minimumOrder !== undefined && { minimumOrder }),
      ...(rules !== undefined && { rules: typeof rules === "string" ? rules : JSON.stringify(rules) }),
      ...(ruleConfig !== undefined && { ruleConfig: normalizeRuleConfig(ruleConfig) as object }),
      // Empty array (no days selected) or full 7 = "no restriction" → null.
      // Storing "[]" used to silently kill the promo every day (Luigi 2026-06-02).
      ...(daysOfWeek !== undefined && {
        daysOfWeek: Array.isArray(daysOfWeek) && daysOfWeek.length > 0 && daysOfWeek.length < 7
          ? JSON.stringify(daysOfWeek)
          : null,
      }),
      ...(startsAt !== undefined && { startsAt: startsAt ? new Date(startsAt) : null }),
      ...(endsAt !== undefined && { endsAt: endsAt ? new Date(endsAt) : null }),
      ...(usageLimit !== undefined && { usageLimit }),
      ...(couponCode !== undefined && { couponCode: couponCode || null }),
      ...(usableHourStart !== undefined && { usableHourStart: clampMin(usableHourStart) }),
      ...(usableHourEnd !== undefined && { usableHourEnd: clampMin(usableHourEnd) }),
      ...(bannerHeadline !== undefined && { bannerHeadline: normalizeBannerHeadline(bannerHeadline) }),
      // Phase 2a restrictions + display fields
      ...(paymentMethodSlugs !== undefined && { paymentMethodSlugs: normalizeJsonStringList(paymentMethodSlugs, 8) }),
      ...(deliveryZoneIds !== undefined && { deliveryZoneIds: normalizeJsonStringList(deliveryZoneIds, 64) }),
      ...(onceLifetimePerClient !== undefined && { onceLifetimePerClient: !!onceLifetimePerClient }),
      ...(imageUrl !== undefined && { imageUrl: normalizeImageUrl(imageUrl) }),
      // displayMode + autoApply + showOnBanner resolved together (Visible/Hidden invariant).
      ...displayUpdate,
      ...(channel !== undefined && { channel: normalizeChannel(channel) }),
      ...(highlightThreshold !== undefined && { highlightThreshold: normalizeNonNegativeFloat(highlightThreshold) }),
      ...(requiredAddOnSlugUpdate !== undefined && { requiredAddOnSlug: requiredAddOnSlugUpdate }),
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
