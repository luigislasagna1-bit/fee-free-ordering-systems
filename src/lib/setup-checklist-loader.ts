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
import { hasFeature } from "@/lib/entitlements";

/** Pull the most-recent kitchen device (any freshness) so the setup
 *  checklist can render "<device label> · <X ago>" as a live status
 *  detail. Returns null when the restaurant has never seen a device. */
async function getLatestKitchenDevice(restaurantId: string) {
  const row = await prisma.kitchenDevice.findFirst({
    where: { restaurantId },
    orderBy: { lastSeenAt: "desc" },
    select: { label: true, userAgent: true, lastSeenAt: true },
  });
  if (!row) return null;
  // Prefer the owner-supplied label, fall back to a short user-agent excerpt,
  // and finally to a generic "kitchen device" so we always render something.
  const label =
    row.label?.trim() ||
    (row.userAgent ? row.userAgent.slice(0, 40) : null) ||
    "Kitchen device";
  return { label, lastSeenAt: row.lastSeenAt };
}

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

  const [hours, categories, menuItems, paymentProvider, notificationCount, kitchenDeviceLive, deliveryZoneCount, hasOnlinePaymentsEntitlement, shipdayConfig, hasDriverPoolEntitlement, kitchenDeviceDetail] = await Promise.all([
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
    // Online-payments entitlement (active/trialing online_payments add-on).
    // Used to gate the online_card method + the Stripe Connect wizard step
    // — both are no-ops without the add-on.
    hasFeature(restaurantId, "card_payments"),
    // ShipdayConfig row — drives the services.deliveryManagement step.
    // Null when the owner has never visited /admin/delivery/pool.
    prisma.shipdayConfig.findUnique({
      where: { restaurantId },
      select: { deliverySource: true },
    }),
    // Driver Pool entitlement (active Driver Pool standalone OR bundled
    // via Marketplace Monthly). Required for "shipday"/"both" sources
    // to count as a complete delivery management setup.
    hasFeature(restaurantId, "driver_pool"),
    // Most-recent kitchen device (any freshness) for setup-step display.
    // Freshness is judged separately by kitchenDeviceLive — this is for
    // showing "iPhone 13 · 3m ago" detail under the step label.
    getLatestKitchenDevice(restaurantId),
  ]);

  const hasKitchenDevice = kitchenDeviceLive;

  // "Has online card payments wired up" — true when EITHER
  //   - the legacy PaymentProvider row is active (older direct-charge setups), OR
  //   - Stripe Connect has charges enabled on the destination account.
  //
  // We key off Stripe's chargesEnabled capability flag (synced via the
  // account.updated webhook from `account.charges_enabled`) — that's the
  // actual boolean Stripe gave us. We deliberately do NOT compound with
  // `stripeAccountStatus === "connected"` because the status field is a
  // UX label that could lag or be overwritten by a refresh-polling
  // endpoint with stricter semantics, leaving the setup step unchecked
  // forever even with charges live (Luigi hit this).
  const stripeConnectLive = restaurant.stripeChargesEnabled === true;
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

  const sourceRaw = shipdayConfig?.deliverySource;
  const deliverySource =
    sourceRaw === "own" || sourceRaw === "shipday" || sourceRaw === "both"
      ? sourceRaw
      : null;

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
    hasOnlinePaymentsEntitlement,
    deliverySource,
    hasDriverPoolEntitlement,
    kitchenDeviceDetail,
  });
}
