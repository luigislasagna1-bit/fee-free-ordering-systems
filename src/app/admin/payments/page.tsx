import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { hasFeature } from "@/lib/entitlements";
import { parsePaymentMethods } from "@/lib/payment-methods";
import { PaymentMethodsClient } from "./PaymentMethodsClient";

/**
 * /admin/payments — the owner picks which payment methods they accept.
 *
 * This is the publishing-gate step `payments.methodsSelected`. Owner picks
 * one or more of:
 *   - "cash" (covers cash at restaurant + cash on delivery)
 *   - "card_in_person" (POS terminal / card reader at pickup or door)
 *   - "online_card" (Stripe Connect — gates the separate methodConfigured step)
 *
 * Choosing "online_card" makes the Stripe Connect setup step required on
 * the wizard; if they later untick online_card, Stripe Connect drops back
 * to optional. The Stripe Connect onboarding itself still lives at
 * /admin/payments/providers.
 */
export const dynamic = "force-dynamic";

export default async function PaymentMethodsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.restaurantId) redirect("/superadmin");

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: user.restaurantId },
    select: {
      paymentMethods: true,
      stripeAccountStatus: true,
      stripeChargesEnabled: true,
      acceptsPickup: true,
      acceptsDelivery: true,
      acceptsDineIn: true,
      acceptsTakeOut: true,
    },
  });
  if (!restaurant) redirect("/admin");

  // Per-order-type accepted methods (Luigi 2026-06-08). Show a section per
  // order type the restaurant offers. A legacy flat config pre-fills every
  // type with that list (so existing selections carry over); a per-type config
  // uses each type's own list.
  const cfg = parsePaymentMethods(restaurant.paymentMethods);
  const orderTypes: string[] = [];
  if (restaurant.acceptsPickup) orderTypes.push("pickup");
  if (restaurant.acceptsDelivery) orderTypes.push("delivery");
  if (restaurant.acceptsDineIn) orderTypes.push("dine_in");
  if (restaurant.acceptsTakeOut) orderTypes.push("take_out");
  if (orderTypes.length === 0) orderTypes.push("pickup");
  const initialByType: Record<string, string[]> = {};
  for (const ot of orderTypes) {
    initialByType[ot] =
      cfg.mode === "all" ? cfg.methods : ((cfg.perType as Record<string, string[]>)[ot] ?? []);
  }

  // "Stripe is ready to accept charges" is determined by Stripe's actual
  // chargesEnabled capability flag (synced from `account.charges_enabled`
  // via the account.updated webhook), NOT by our local string status
  // field. The status field is a UX label that can lag or drift if a
  // refresh-polling endpoint disagrees about what "connected" means;
  // chargesEnabled is the boolean Stripe gave us. Mismatch between the
  // two used to leave restaurants seeing the yellow "Finish Stripe setup"
  // banner forever even with charges live (Luigi flagged this).
  const stripeReady = restaurant.stripeChargesEnabled === true;

  // Online card payment is gated by the `online_payments` add-on. Without
  // an active subscription, the tile is locked and the API rejects writes.
  const onlinePaymentsUnlocked = await hasFeature(user.restaurantId, "card_payments");

  return (
    <PaymentMethodsClient
      initialByType={initialByType}
      orderTypes={orderTypes}
      stripeReady={stripeReady}
      stripeStatus={restaurant.stripeAccountStatus ?? "not_connected"}
      onlinePaymentsUnlocked={onlinePaymentsUnlocked}
    />
  );
}
