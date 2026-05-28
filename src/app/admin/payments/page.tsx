import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { hasFeature } from "@/lib/entitlements";
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
    },
  });
  if (!restaurant) redirect("/admin");

  // Defensive parse — bad JSON falls back to empty.
  let methods: string[] = [];
  try {
    const parsed = JSON.parse(restaurant.paymentMethods);
    if (Array.isArray(parsed)) methods = parsed.filter((s) => typeof s === "string");
  } catch { /* ignore */ }

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
      initialMethods={methods}
      stripeReady={stripeReady}
      stripeStatus={restaurant.stripeAccountStatus ?? "not_connected"}
      onlinePaymentsUnlocked={onlinePaymentsUnlocked}
    />
  );
}
