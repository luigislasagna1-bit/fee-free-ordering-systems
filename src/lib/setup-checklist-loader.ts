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
    },
  });
  if (!restaurant) return null;

  const [hours, categories, menuItems, paymentProvider, notificationCount, kitchenDeviceLive] = await Promise.all([
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
  ]);

  const hasKitchenDevice = kitchenDeviceLive;

  return computeSetupProgress({
    restaurant,
    hours,
    categories,
    menuItems,
    hasPaymentProvider: !!paymentProvider,
    hasKitchenDevice,
    notificationRecipientCount: notificationCount,
  });
}
