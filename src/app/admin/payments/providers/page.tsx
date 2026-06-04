import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { hasFeature } from "@/lib/entitlements";
import { ProvidersClient } from "./ProvidersClient";

export default async function ProvidersPage() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;

  const [restaurant, provider, hasOnlinePayments] = await Promise.all([
    restaurantId
      ? prisma.restaurant.findUnique({
          where: { id: restaurantId },
          select: {
            paypalAccountStatus: true,
            paypalEnvironment: true,
            paypalMerchantEmail: true,
            paymentMethods: true,
          },
        })
      : Promise.resolve(null),
    // KEY-ONLY Stripe model: the restaurant's own API keys live in
    // PaymentProvider. We pass only non-secret state to the client — never
    // the decrypted secret (we expose a `hasSecret` boolean instead).
    restaurantId
      ? prisma.paymentProvider.findUnique({
          where: { restaurantId },
          select: {
            mode: true,
            publishableKey: true,
            secretKeyEnc: true,
            isActive: true,
            lastTestedAt: true,
            lastTestStatus: true,
          },
        })
      : Promise.resolve(null),
    // Phase 5 entitlement: only restaurants with the Online Payments add-on
    // can actually accept card payments. We pass the flag to the client so
    // the UI can lead with "Subscribe to Online Payments" when missing,
    // instead of letting them enter Stripe keys pointlessly.
    restaurantId ? hasFeature(restaurantId, "card_payments") : Promise.resolve(false),
  ]);

  // Has the owner actually opted into online card payments in Accepted
  // Methods? Having the add-on AND not opting in is a valid state — we
  // shouldn't push Stripe setup on them. The page treats this as
  // "online card payment is dormant; enable in Accepted Methods to use".
  let onlineCardEnabled = false;
  let paypalEnabled = false;
  if (restaurant?.paymentMethods) {
    try {
      const arr = JSON.parse(restaurant.paymentMethods);
      if (Array.isArray(arr)) {
        onlineCardEnabled = arr.includes("online_card");
        paypalEnabled = arr.includes("paypal");
      }
    } catch { /* malformed JSON — treat as nothing enabled */ }
  }

  return (
    <ProvidersClient
      restaurant={restaurant}
      stripe={
        provider
          ? {
              mode: provider.mode,
              publishableKey: provider.publishableKey,
              hasSecret: !!provider.secretKeyEnc,
              isActive: provider.isActive,
              lastTestedAt: provider.lastTestedAt ? provider.lastTestedAt.toISOString() : null,
              lastTestStatus: provider.lastTestStatus,
            }
          : null
      }
      hasOnlinePaymentsAddOn={hasOnlinePayments}
      onlineCardEnabled={onlineCardEnabled}
      paypalEnabled={paypalEnabled}
    />
  );
}
