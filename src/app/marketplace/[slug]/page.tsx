import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { isOnMarketplace } from "@/lib/marketplace";
import { restaurantCanTakeCardOnline } from "@/lib/stripe";

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
      // Legacy Stripe-Connect charges flag — still honored so restaurants that
      // haven't migrated to key-only Stripe aren't dropped (no regression).
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

  // CARD-CAPABLE gate. Marketplace orders are card-only by platform contract —
  // if the restaurant can't take card payments online, the customer would hit
  // a cash-only checkout. Accept EITHER path so nobody currently listed drops:
  //   - legacy Stripe Connect (stripeChargesEnabled), OR
  //   - the key-only model (own active Stripe keys + card_payments entitlement).
  // The key-only branch is the successor to the Connect flag (always false for
  // restaurants that migrated), and is what made Luigi's link bounce. 2026-06-04.
  const cardCapable =
    restaurant.stripeChargesEnabled || (await restaurantCanTakeCardOnline(restaurant.id));
  if (!cardCapable) {
    redirect("/marketplace");
  }

  // Use isOnMarketplace() — the marketplace is FREE + INCLUDED for every
  // restaurant (Luigi 2026-07-14), so this is true unless the owner explicitly
  // opted OUT (MarketplaceListing.isListed=false). NOT gated on any paid
  // entitlement — that would wrongly bounce free restaurants' tiles back to
  // /marketplace when clicked.
  const onMarketplace = await isOnMarketplace(restaurant.id);
  if (!onMarketplace) {
    redirect("/marketplace");
  }

  // M1: transparent forward to the existing order experience.
  // M2: replace this redirect with a wrapped <OrderingPageClient>
  //     that adds a marketplace header.
  redirect(`/order/${slug}?from=marketplace`);
}
