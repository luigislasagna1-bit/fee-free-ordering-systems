import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { stripeReady } from "@/lib/stripe";
import { ProvidersClient } from "./ProvidersClient";

export default async function ProvidersPage() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;

  const restaurant = restaurantId
    ? await prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: {
          stripeAccountId: true,
          stripeAccountStatus: true,
          stripeChargesEnabled: true,
          stripePayoutsEnabled: true,
        },
      })
    : null;

  const stripeConfigured = await stripeReady();

  return (
    <ProvidersClient
      restaurant={restaurant}
      stripeConfigured={stripeConfigured}
    />
  );
}
