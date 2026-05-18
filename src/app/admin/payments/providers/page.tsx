import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { stripeReady } from "@/lib/stripe";
import { hasFeature } from "@/lib/entitlements";
import { ProvidersClient } from "./ProvidersClient";

export default async function ProvidersPage() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;

  const [restaurant, stripeConfigured, hasOnlinePayments] = await Promise.all([
    restaurantId
      ? prisma.restaurant.findUnique({
          where: { id: restaurantId },
          select: {
            stripeAccountId: true,
            stripeAccountStatus: true,
            stripeChargesEnabled: true,
            stripePayoutsEnabled: true,
          },
        })
      : Promise.resolve(null),
    stripeReady(),
    // Phase 5 entitlement: only restaurants with the Online Payments add-on
    // can actually accept card payments. We pass the flag to the client so
    // the UI can lead with "Subscribe to Online Payments" when missing,
    // instead of letting them connect Stripe pointlessly.
    restaurantId ? hasFeature(restaurantId, "card_payments") : Promise.resolve(false),
  ]);

  return (
    <ProvidersClient
      restaurant={restaurant}
      stripeConfigured={stripeConfigured}
      hasOnlinePaymentsAddOn={hasOnlinePayments}
    />
  );
}
