/**
 * /admin/growthnet — GrowthNet, Fee Free's Restaurant Growth System.
 *
 * The one-stop marketing tab: every paid marketing / retention / acquisition
 * add-on in one place. Restaurants activate tools one at a time (each card
 * deep-links to the normal billing subscribe flow) or ALL at once via the
 * `growthnet` bundle add-on at a discounted price. Bundle membership is
 * data-driven (AddOn.inGrowthNet) so new growth tools land here — and reach
 * existing subscribers — automatically. Luigi 2026-06-11.
 *
 * Always visible (it IS the upsell hub); no feature gate on this page.
 */
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { GROWTHNET_SLUG } from "@/lib/entitlements";
import { GrowthNetClient } from "./GrowthNetClient";

export const dynamic = "force-dynamic";

export default async function GrowthNetPage() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return null; // admin layout already gates auth

  const [bundle, members, marketplace, activeRows] = await Promise.all([
    prisma.addOn.findUnique({
      where: { slug: GROWTHNET_SLUG },
      select: { slug: true, name: true, description: true, monthlyPriceCents: true, comingSoon: true, isActive: true },
    }),
    prisma.addOn.findMany({
      where: { inGrowthNet: true, isActive: true },
      orderBy: { displayOrder: "asc" },
      select: { slug: true, name: true, description: true, monthlyPriceCents: true, comingSoon: true },
    }),
    // Marketplace is a growth channel too, but sold separately (its own
    // monthly/PAYG billing doesn't fit a flat bundle) — listed at the bottom.
    prisma.addOn.findUnique({
      where: { slug: "marketplace" },
      select: { slug: true, name: true, description: true, monthlyPriceCents: true },
    }),
    prisma.restaurantAddOn.findMany({
      where: { restaurantId, status: { in: ["active", "trialing"] } },
      select: { addOn: { select: { slug: true } } },
    }),
  ]);

  const activeSlugs = activeRows.map((r) => r.addOn.slug);
  const bundleActive = activeSlugs.includes(GROWTHNET_SLUG);
  const individualValueCents = members.reduce((s, m) => s + m.monthlyPriceCents, 0);

  return (
    <GrowthNetClient
      bundle={bundle}
      members={members}
      marketplace={marketplace}
      activeSlugs={activeSlugs}
      bundleActive={bundleActive}
      individualValueCents={individualValueCents}
    />
  );
}
