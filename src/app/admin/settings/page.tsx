import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { SettingsClient, type ActiveAddOn, type RecommendedAddOn } from "./SettingsClient";

export default async function SettingsPage() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;

  // FREE-by-default model: we no longer fetch SubscriptionPlan here. The
  // legacy 4-tier upgrade grid was retired and add-ons live at /admin/billing.
  // But we DO need the restaurant's currently-subscribed add-ons so the
  // Account card reflects reality — owners with Online Payments active
  // shouldn't see "Current Plan: FREE" with no add-ons listed. Fetch the
  // active + trialing rows here and pass them down to the client.
  const [restaurant, addOnRows, catalog] = restaurantId
    ? await Promise.all([
        prisma.restaurant.findUnique({ where: { id: restaurantId } }),
        prisma.restaurantAddOn.findMany({
          where: {
            restaurantId,
            status: { in: ["active", "trialing"] },
          },
          select: {
            id: true,
            status: true,
            cancelAtPeriodEnd: true,
            currentPeriodEnd: true,
            addOn: {
              select: {
                slug: true,
                name: true,
                description: true,
                monthlyPriceCents: true,
              },
            },
          },
          orderBy: { activatedAt: "asc" },
        }),
        // Live add-on catalog for the "Recommended add-ons" upsell (replaces
        // the old mislabeled "Danger Zone"). Real, purchasable products only —
        // active, not coming-soon, priced. Luigi 2026-06-11.
        prisma.addOn.findMany({
          where: { isActive: true, comingSoon: false, monthlyPriceCents: { gt: 0 } },
          orderBy: { displayOrder: "asc" },
          select: { slug: true, name: true, description: true, monthlyPriceCents: true },
        }),
      ])
    : [null, [], []];

  // Serialize Dates so the client component receives plain JSON. Without
  // this Next 16's RSC boundary throws on the Date instance.
  const activeAddOns: ActiveAddOn[] = addOnRows.map((row) => ({
    id: row.id,
    status: row.status as ActiveAddOn["status"],
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null,
    slug: row.addOn.slug,
    name: row.addOn.name,
    description: row.addOn.description,
    monthlyPriceCents: row.addOn.monthlyPriceCents,
  }));

  // Recommend the top few add-ons the restaurant doesn't already have.
  const ownedSlugs = new Set(activeAddOns.map((a) => a.slug));
  const recommendedAddOns: RecommendedAddOn[] = (catalog as Array<{ slug: string; name: string; description: string | null; monthlyPriceCents: number }>)
    .filter((a) => !ownedSlugs.has(a.slug))
    .slice(0, 4)
    .map((a) => ({ slug: a.slug, name: a.name, description: a.description, monthlyPriceCents: a.monthlyPriceCents }));

  return <SettingsClient restaurant={restaurant} activeAddOns={activeAddOns} recommendedAddOns={recommendedAddOns} />;
}
