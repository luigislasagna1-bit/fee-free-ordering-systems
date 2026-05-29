/**
 * POST /api/restaurants/promotions/[id]/duplicate
 *
 * Clones an existing promotion under the same restaurant, with:
 *   - name suffixed " (Copy)"
 *   - isActive forced false (the owner should review + activate)
 *   - couponCode wiped (unique-per-restaurant constraint)
 *   - usedCount reset to 0
 *   - campaignRef / campaignSequence cleared (duplicates are always
 *     self-made — a pre-made promo cloned this way becomes a regular
 *     self-managed promo)
 *   - all other fields copied verbatim (including ruleConfig, restrictions,
 *     display fields, etc.)
 *
 * Re-checks the Advanced Promo Marketing entitlement when the source
 * promo is a locked type, so a restaurant who lapsed their add-on
 * can't duplicate locked promos.
 */
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { hasFeature } from "@/lib/entitlements";
import {
  ADVANCED_PROMO_ADDON_SLUG,
  ADVANCED_PROMO_FEATURE,
  isLockedType,
} from "@/lib/promo-types";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const source = await prisma.promotion.findFirst({
    where: { id, restaurantId },
  });
  if (!source) return NextResponse.json({ error: "Promotion not found" }, { status: 404 });

  if (isLockedType(source.promotionType)) {
    const ok = await hasFeature(restaurantId, ADVANCED_PROMO_FEATURE);
    if (!ok) {
      return NextResponse.json(
        {
          error: "Advanced Promo Marketing add-on required to duplicate this promo type.",
          requiredAddOnSlug: ADVANCED_PROMO_ADDON_SLUG,
          requiredFeature: ADVANCED_PROMO_FEATURE,
        },
        { status: 403 },
      );
    }
  }

  const baseName = source.name.length > 70 ? source.name.slice(0, 70) : source.name;
  const duplicate = await prisma.promotion.create({
    data: {
      restaurantId,
      name: `${baseName} (Copy)`,
      description: source.description,
      promotionType: source.promotionType,
      isActive: false, // forces the owner to review before going live
      stackingRule: source.stackingRule,
      orderType: source.orderType,
      customerType: source.customerType,
      minimumOrder: source.minimumOrder,
      rules: source.rules,
      ruleConfig: source.ruleConfig as object,
      daysOfWeek: source.daysOfWeek,
      startsAt: source.startsAt,
      endsAt: source.endsAt,
      usageLimit: source.usageLimit,
      // usedCount intentionally NOT copied — fresh clones start at 0.
      autoApply: source.autoApply,
      // couponCode wiped — the unique constraint per restaurant would
      // otherwise reject the insert.
      couponCode: null,
      scope: source.scope,
      usableHourStart: source.usableHourStart,
      usableHourEnd: source.usableHourEnd,
      showOnBanner: source.showOnBanner,
      bannerHeadline: source.bannerHeadline,
      paymentMethodSlugs: source.paymentMethodSlugs,
      deliveryZoneIds: source.deliveryZoneIds,
      onceLifetimePerClient: source.onceLifetimePerClient,
      limitedShowtimeSchedules: source.limitedShowtimeSchedules as object,
      imageUrl: source.imageUrl,
      displayMode: source.displayMode,
      highlightThreshold: source.highlightThreshold,
      requiredAddOnSlug: source.requiredAddOnSlug,
      // Campaign linkage cleared — duplicates are always self-made.
      campaignRef: null,
      campaignSequence: null,
    },
  });

  return NextResponse.json(duplicate, { status: 201 });
}
