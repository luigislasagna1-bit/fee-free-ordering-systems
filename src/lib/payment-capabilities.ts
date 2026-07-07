/**
 * Whether a restaurant can ACTUALLY accept online-card / PayPal payments right
 * now. This is the single source of truth shared by the customer checkout
 * (src/app/order/[slug]/page.tsx) and the admin promo wizard, so a "pay online"
 * reward can never be offered for a method customers can't actually use.
 *
 * KEY-ONLY Stripe model: online card needs BOTH the restaurant's own active
 * Stripe keys (PaymentProvider.isActive + publishableKey) AND the card_payments
 * entitlement (the Online Payments add-on). PayPal shares that same entitlement
 * plus a connected PayPal account. The old Stripe Connect path is gone.
 */
export async function resolvePaymentCapabilities(
  restaurantId: string,
  paypalAccountStatus?: string | null,
): Promise<{ cardPaymentEnabled: boolean; paypalEnabled: boolean; publishableKey: string | null }> {
  // Imported lazily so this module stays free of the server-only prisma/DB
  // side effect at import time — keeps the pure usablePaymentMethods() helper
  // unit-testable without spinning up a DB client.
  const [{ default: prisma }, { hasFeature }] = await Promise.all([
    import("@/lib/db"),
    import("@/lib/entitlements"),
  ]);
  const [provider, hasCardPayments] = await Promise.all([
    prisma.paymentProvider.findUnique({
      where: { restaurantId },
      select: { isActive: true, publishableKey: true },
    }),
    hasFeature(restaurantId, "card_payments"),
  ]);
  const providerReady = !!(provider?.isActive && provider.publishableKey);
  const cardPaymentEnabled = providerReady && hasCardPayments;
  const paypalEnabled = paypalAccountStatus === "connected" && hasCardPayments;
  const publishableKey = cardPaymentEnabled ? provider?.publishableKey ?? null : null;
  return { cardPaymentEnabled, paypalEnabled, publishableKey };
}
