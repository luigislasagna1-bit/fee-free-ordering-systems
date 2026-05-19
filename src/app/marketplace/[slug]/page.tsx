import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { hasFeature } from "@/lib/entitlements";

/**
 * Marketplace restaurant detail page. For M1, we simply redirect to
 * the existing /order/[slug] page after verifying the restaurant IS
 * actually on the marketplace. This keeps the customer ordering
 * experience identical (existing cart, checkout, payment) while
 * making the marketplace URL structure meaningful.
 *
 * M2 will wrap /order/[slug] in a marketplace chrome that shows a
 * "back to marketplace" link, a "you're saving X vs UberEats" banner,
 * and marketplace-specific cross-sells. For now, the cleanest UX is
 * a transparent redirect.
 */
export default async function MarketplaceRestaurantPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: {
      id: true,
      isActive: true,
      marketplaceListing: { select: { isListed: true } },
    },
  });

  if (!restaurant || !restaurant.isActive) {
    // Restaurant doesn't exist or is paused — bounce to the browse page
    // rather than a hard 404 so the customer lands somewhere useful.
    redirect("/marketplace");
  }

  // Verify both the toggle AND the entitlement are still active. Either
  // off (subscription expired, owner paused listing) → bounce.
  const [stillEntitled] = await Promise.all([
    hasFeature(restaurant.id, "marketplace_listing"),
  ]);
  if (!restaurant.marketplaceListing?.isListed || !stillEntitled) {
    redirect("/marketplace");
  }

  // M1: transparent forward to the existing order experience.
  // M2: replace this redirect with a wrapped <OrderingPageClient>
  //     that adds a marketplace header.
  redirect(`/order/${slug}?from=marketplace`);
}
