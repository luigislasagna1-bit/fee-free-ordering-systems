/**
 * Server-side data loader for the setup checklist. Wraps the Prisma queries
 * needed by `computeSetupProgress()` so the admin layout has a single
 * one-liner to call.
 *
 * Separate from setup-checklist.ts so that file can stay pure (no Prisma)
 * and easier to unit-test.
 */

import prisma from "@/lib/db";
import { computeSetupProgress, type SetupProgress } from "@/lib/setup-checklist";
import { hasLiveKitchenDevice } from "@/lib/kitchen-devices";

export async function loadSetupProgress(restaurantId: string): Promise<SetupProgress | null> {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      id: true,
      name: true,
      address: true,
      city: true,
      country: true,
      phone: true,
      lat: true,
      lng: true,
      cuisineType: true,
      taxRate: true,
      acceptsPickup: true,
      acceptsDelivery: true,
      acceptsDineIn: true,
      acceptsReservations: true,
      ownerEmailVerifiedAt: true,
      widgetInstalledAt: true,
      // Stripe Connect status — when this is "connected" with charges
      // enabled, the restaurant CAN take online card payments. We use
      // this (not just the PaymentProvider table) because Connect
      // onboarding writes directly to Restaurant, not PaymentProvider.
      stripeAccountStatus: true,
      stripeChargesEnabled: true,
      // Accepted payment methods JSON array — drives a required setup
      // step and conditionally makes Stripe Connect required.
      paymentMethods: true,
    },
  });
  if (!restaurant) return null;

  const [hours, categories, menuItems, paymentProvider, notificationCount, kitchenDeviceLive, deliveryZoneCount] = await Promise.all([
    prisma.openingHours.findMany({
      where: { restaurantId },
      select: { isOpen: true },
    }),
    prisma.menuCategory.findMany({
      where: { restaurantId },
      select: { id: true },
    }),
    prisma.menuItem.findMany({
      where: { restaurantId },
      select: { id: true, isAvailable: true },
    }),
    prisma.paymentProvider.findFirst({
      where: { restaurantId, isActive: true },
      select: { id: true },
    }),
    prisma.notificationRecipient.count({
      where: { restaurantId, isActive: true },
    }),
    hasLiveKitchenDevice(restaurantId),
    // Delivery zones — only counted if active. A restaurant with all-paused
    // zones is effectively zone-less and the checklist should reflect that.
    prisma.deliveryZone.count({
      where: { restaurantId, isActive: true },
    }),
  ]);

  const hasKitchenDevice = kitchenDeviceLive;

  // "Has online card payments wired up" — true when EITHER
  //   - the legacy PaymentProvider row is active (older direct-charge setups), OR
  //   - the modern Stripe Connect onboarding completed (charges enabled on the
  //     destination account). This is what the dashboard "Connected · Live"
  //     badge reflects, so the checkmark must follow the same signal — otherwise
  //     owners see "Connected" on /admin/payments/providers but the setup step
  //     stays unchecked forever (the bug Luigi hit).
  const stripeConnectLive =
    restaurant.stripeAccountStatus === "connected" && restaurant.stripeChargesEnabled === true;
  const hasOnlineCardPayments = !!paymentProvider || stripeConnectLive;

  // Parse accepted payment methods. Empty array / null = owner hasn't picked
  // yet, which makes the methodsSelected step incomplete. Defensive parse:
  // legacy rows may have malformed JSON; treat any parse error as empty.
  let paymentMethods: string[] = [];
  if (restaurant.paymentMethods) {
    try {
      const parsed = JSON.parse(restaurant.paymentMethods);
      if (Array.isArray(parsed)) paymentMethods = parsed.filter((s) => typeof s === "string");
    } catch {
      // Leave as empty — checklist will surface this as incomplete and the
      // owner can re-pick in /admin/payments.
    }
  }

  return computeSetupProgress({
    restaurant,
    hours,
    categories,
    menuItems,
    hasPaymentProvider: hasOnlineCardPayments,
    hasKitchenDevice,
    notificationRecipientCount: notificationCount,
    deliveryZoneCount,
    paymentMethods,
  });
}
