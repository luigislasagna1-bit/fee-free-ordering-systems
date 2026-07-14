import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import {
  ensureMarketplaceListing,
  computeMonthlyChargeCents,
} from "@/lib/marketplace";
import { getAddOnBillingState } from "@/lib/dunning";
import { AddOnBillingNotice } from "@/components/admin/AddOnBillingNotice";
import { MarketplaceSettingsClient } from "./MarketplaceSettingsClient";

/**
 * /admin/marketplace — restaurant owner configures how they appear on
 * the public marketplace.
 *
 * Renders three different states:
 *   1. Not subscribed → upsell card with the value prop and a link to
 *      /admin/billing/add-ons
 *   2. Subscribed but listing doesn't exist yet (race) → create + show editor
 *   3. Subscribed and listing exists → full editor with isListed toggle,
 *      tagline, categories, tags, banner override
 */
export default async function MarketplaceAdminPage() {
  const t = await getTranslations("admin.marketplacePage");
  const user = await getSessionUser();
  if (!user?.restaurantId) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-600">{t("loginRequired")}</p>
      </div>
    );
  }

  // Marketplace is FREE + INCLUDED for every restaurant (Luigi 2026-07-14).
  // Everyone gets the editor — the isListed toggle inside it handles opt-in/out;
  // there is no paid upsell wall anymore.
  // Marketplace add-on dunning state → only surfaces if a legacy paid sub is
  // still mid-dunning (cleared once the prod retirement migration, A14, runs).
  const billingState = await getAddOnBillingState(user.restaurantId, "marketplace");

  // Ensure listing exists (defensive against webhook race conditions)
  await ensureMarketplaceListing(user.restaurantId);
  const listing = await prisma.marketplaceListing.findUnique({
    where: { restaurantId: user.restaurantId },
  });
  if (!listing) {
    return <div className="p-6 text-sm text-red-600">{t("listingCreateFailed")}</div>;
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: user.restaurantId },
    select: { name: true, slug: true, city: true, cuisineType: true, bannerUrl: true, logoUrl: true },
  });

  // Smart-billing snapshot. We compute what the restaurant would pay
  // THIS cycle under both pricing models so the UI can show "you're
  // currently on the per-order rate" or "you've crossed into the flat
  // cap — every additional order this month is free".
  const billing = computeMonthlyChargeCents(listing.currentMonthOrders);

  return (
    <>
      <div className="max-w-5xl mx-auto px-4 pt-4">
        <AddOnBillingNotice state={billingState} addOnSlug="marketplace" />
      </div>
      <MarketplaceSettingsClient
      initialListing={{
        id: listing.id,
        isListed: listing.isListed,
        marketplaceTagline: listing.marketplaceTagline ?? "",
        marketplaceShortDesc: listing.marketplaceShortDesc ?? "",
        marketplaceBanner: listing.marketplaceBanner ?? "",
        marketplaceCategories: safeJson(listing.marketplaceCategories),
        marketplaceTags: safeJson(listing.marketplaceTags),
        marketplaceFeatured: listing.marketplaceFeatured,
      }}
      restaurant={{
        name: restaurant?.name ?? t("yourRestaurant"),
        slug: restaurant?.slug ?? "",
        city: restaurant?.city ?? null,
        cuisineType: restaurant?.cuisineType ?? null,
        bannerUrl: restaurant?.bannerUrl ?? null,
        logoUrl: restaurant?.logoUrl ?? null,
      }}
      stats={{
        currentMonthOrders: listing.currentMonthOrders,
        currentMonthRevenue: listing.currentMonthRevenue,
        lifetimeSavingsVsUberEatsCents: listing.lifetimeSavingsVsUberEatsCents,
        currentMonthStartedAt: listing.currentMonthStartedAt.toISOString(),
        billing: {
          capCents: billing.capCents,
          accruedCents: billing.accruedCents,
          effectiveCents: billing.effectiveCents,
          capHit: billing.capHit,
        },
      }}
      isSuperadmin={user.role === "superadmin"}
    />
    </>
  );
}

function safeJson(s: string | null | undefined): string[] {
  if (!s) return [];
  try {
    const arr = JSON.parse(s);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
