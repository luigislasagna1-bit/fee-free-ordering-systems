import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { isOnMarketplace } from "@/lib/marketplace";

/**
 * Marketplace restaurant detail page. For M1, we simply redirect to
 * the existing /order/[slug] page after verifying the restaurant IS
 * actually on the marketplace AND published. This keeps the customer
 * ordering experience identical (existing cart, checkout, payment)
 * while making the marketplace URL structure meaningful.
 *
 * Bounces back to /marketplace (no hard 404) if any of:
 *   - The restaurant slug doesn't exist
 *   - Restaurant is paused (isActive=false)
 *   - Restaurant isn't published yet (publishedAt=null)
 *   - The MarketplaceListing is hidden (isListed=false)
 *   - Membership isn't active (no monthly add-on AND not PAYG opted in)
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
      publishedAt: true,
      stripeAccountStatus: true,
      stripeChargesEnabled: true,
      marketplaceListing: { select: { isListed: true } },
    },
  });

  // Restaurant doesn't exist, is paused, or isn't published → bounce
  // back to the browse page so the customer lands somewhere useful
  // rather than a hard 404.
  if (!restaurant || !restaurant.isActive || !restaurant.publishedAt) {
    redirect("/marketplace");
  }

  if (!restaurant.marketplaceListing?.isListed) {
    redirect("/marketplace");
  }

  // STRIPE-CONNECT-LIVE gate. Marketplace orders are card-only by
  // platform contract — if Connect isn't finished, the customer
  // would hit "Pay online coming soon" mid-checkout. Bounce them
  // back to /marketplace where the listing is filtered out anyway.
  // Defense-in-depth: listPublicMarketplaceListings also excludes
  // these restaurants, so a customer would only reach this URL by
  // direct link / bookmark / stale tab.
  const stripeConnectLive =
    restaurant.stripeAccountStatus === "connected" && !!restaurant.stripeChargesEnabled;
  if (!stripeConnectLive) {
    redirect("/marketplace");
  }

  // Use isOnMarketplace() — accepts BOTH monthly subscribers (add-on
  // entitlement) and PAYG opt-ins (MarketplaceListing.billingMode="payg"
  // + isListed=true). The old code used hasFeature("marketplace_listing")
  // which only returned true for monthly subscribers, so PAYG restaurants'
  // tiles would bounce back to /marketplace when clicked.
  const onMarketplace = await isOnMarketplace(restaurant.id);
  if (!onMarketplace) {
    redirect("/marketplace");
  }

  // M1: transparent forward to the existing order experience.
  // M2: replace this redirect with a wrapped <OrderingPageClient>
  //     that adds a marketplace header.
  redirect(`/order/${slug}?from=marketplace`);
}
