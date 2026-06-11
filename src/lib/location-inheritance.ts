/**
 * Child-location inheritance (Luigi 2026-06-11).
 *
 * When a brand adds a new child location it should be born configured like the
 * brand — banners, theme, currency, time format, services, hours, delivery
 * zones, etc. — and the owner only tweaks the genuinely location-specific bits.
 * Previously a child was created almost blank (generic 09:00–21:00 hours,
 * platform-default currency), forcing a full from-scratch setup every time.
 *
 * What is DELIBERATELY NOT inherited (must stay unique / per-account):
 *   - identity: name, slug, subdomain, customDomain, email, phone, address,
 *     city, state, zip, lat/lng, reviewLink
 *   - money rails: ALL Stripe* + PayPal* credentials and statuses, billing /
 *     subscription columns, stripeCustomerId, order-cap counters. Each location
 *     is billed and paid out separately (Luigi's explicit design), so it wires
 *     its OWN processor before it can publish online-card.
 *   - entitlement / marketing tier, transient *PausedUntil flags, kitchen
 *     session token, widget/publish state.
 *   - physical/hardware + per-location rows: printerSettings, reservationTables.
 *
 * Everything returned here is a safe, EDITABLE starting default. Two to
 * double-check per location: `taxRate` (jurisdiction-specific) and
 * `paymentMethods` (the location still has to connect its own Stripe/PayPal
 * before "online card" actually works — the publish gate enforces that).
 */
import type { Prisma } from "@/generated/prisma/client";

export type ParentWithConfig = Prisma.RestaurantGetPayload<{
  include: {
    openingHours: true;
    deliveryZones: true;
    serviceFees: true;
    receiptTemplates: true;
    reservationSettings: true;
    holidays: true;
  };
}>;

/**
 * The scalar Restaurant fields a new child inherits from its brand parent.
 * Returned as a Prisma create-input fragment (spread into restaurant.create).
 * `country` is handled by the caller so a per-location override can win.
 */
export function pickInheritedScalars(parent: ParentWithConfig) {
  return {
    // branding / display
    slogan: parent.slogan,
    description: parent.description,
    cuisineType: parent.cuisineType,
    logoUrl: parent.logoUrl,
    bannerUrl: parent.bannerUrl,
    faviconUrl: parent.faviconUrl,
    themeSettings: parent.themeSettings,
    socialLinks: parent.socialLinks,
    infoContent: parent.infoContent,
    hostedSiteSettings: parent.hostedSiteSettings,
    kitchenAlertSoundUrl: parent.kitchenAlertSoundUrl,
    kitchenWorkflowMode: parent.kitchenWorkflowMode,
    printNodeEnabled: parent.printNodeEnabled,

    // regional / formatting
    timezone: parent.timezone,
    hoursFormat: parent.hoursFormat,
    currency: parent.currency,
    defaultLanguage: parent.defaultLanguage,
    taxRate: parent.taxRate,
    mapProvider: parent.mapProvider,
    googleMapsApiKey: parent.googleMapsApiKey,

    // services + ordering rules
    acceptsPickup: parent.acceptsPickup,
    acceptsDelivery: parent.acceptsDelivery,
    acceptsDineIn: parent.acceptsDineIn,
    acceptsCatering: parent.acceptsCatering,
    acceptsTakeOut: parent.acceptsTakeOut,
    acceptsReservations: parent.acceptsReservations,
    serviceSettings: parent.serviceSettings,
    cateringNoticeHours: parent.cateringNoticeHours,
    estimatedPickup: parent.estimatedPickup,
    estimatedDelivery: parent.estimatedDelivery,
    minimumOrder: parent.minimumOrder,
    deliveryFee: parent.deliveryFee,
    acceptOutsideZoneOrders: parent.acceptOutsideZoneOrders,
    deliveryAddressConfig:
      (parent.deliveryAddressConfig ?? undefined) as Prisma.InputJsonValue | undefined,
    tipsEnabled: parent.tipsEnabled,
    showCustomerMenuSearch: parent.showCustomerMenuSearch,
    scheduledOrderInterval: parent.scheduledOrderInterval,
    pickupMinLeadMinutes: parent.pickupMinLeadMinutes,
    pickupMaxAdvanceDays: parent.pickupMaxAdvanceDays,
    deliveryMinLeadMinutes: parent.deliveryMinLeadMinutes,
    deliveryMaxAdvanceDays: parent.deliveryMaxAdvanceDays,
    dineInMinLeadMinutes: parent.dineInMinLeadMinutes,
    dineInMaxAdvanceDays: parent.dineInMaxAdvanceDays,
    allowScheduledOrders: parent.allowScheduledOrders,
    requireScheduledOrders: parent.requireScheduledOrders,
    requireCustomerEmail: parent.requireCustomerEmail,
    requireCustomerPhone: parent.requireCustomerPhone,
    autoCallOnNewOrder: parent.autoCallOnNewOrder,
    autoAcceptOrders: parent.autoAcceptOrders,
    paymentMethods: parent.paymentMethods,

    // customer-side email toggles
    customerEmailPickupReady: parent.customerEmailPickupReady,
    customerEmailDeliveryReady: parent.customerEmailDeliveryReady,
    customerEmailDineInReady: parent.customerEmailDineInReady,
    customerEmailOrderRejected: parent.customerEmailOrderRejected,
    customerEmailOrderConfirm: parent.customerEmailOrderConfirm,
  };
}

/**
 * Clone the brand parent's per-location config ROWS onto a freshly-created
 * child. Best-effort + idempotent-safe (only ever called once, right after
 * create). Uses createMany batches — this runs on the rare "add a location"
 * path, never a hot path. Returns nothing; the caller wraps it so a clone
 * failure can't fail the whole location creation (the location + its account
 * already exist by then).
 *
 * `prisma` is passed in to avoid a circular import with the db singleton.
 */
export async function cloneLocationRelations(
  prisma: import("@/generated/prisma/client").PrismaClient,
  parent: ParentWithConfig,
  childId: string,
  /**
   * The new location's own geocoded coordinates. Copied delivery zones are
   * re-centered on THIS point so the brand's ring structure (radius + fee
   * tiers) anchors to the new store's address instead of HQ's. Null → keep
   * the original centers (best-effort fallback when geocoding failed).
   */
  center?: { lat: number; lng: number } | null,
) {
  // Opening hours — clone the brand's real hours; fall back to the same
  // "closed by default" 7-day skeleton the signup flow creates if the parent
  // somehow has none.
  if (parent.openingHours.length > 0) {
    await prisma.openingHours.createMany({
      data: parent.openingHours.map((h) => ({
        restaurantId: childId,
        dayOfWeek: h.dayOfWeek,
        isOpen: h.isOpen,
        openTime: h.openTime,
        closeTime: h.closeTime,
        closesNextDay: h.closesNextDay,
        service: h.service,
      })),
    });
  } else {
    await prisma.openingHours.createMany({
      data: Array.from({ length: 7 }, (_, i) => ({
        restaurantId: childId,
        dayOfWeek: i,
        isOpen: false,
        openTime: "09:00",
        closeTime: "21:00",
      })),
    });
  }

  if (parent.deliveryZones.length > 0) {
    await prisma.deliveryZone.createMany({
      data: parent.deliveryZones.map((z) => ({
        restaurantId: childId,
        name: z.name,
        color: z.color,
        // Anchor the copied ring on the NEW store's coordinates (delivery
        // gating + the admin map both treat the restaurant's own lat/lng as
        // the center; radius/fee tiers carry over from the brand). Keep the
        // original center only if we couldn't geocode the new address.
        centerLat: center?.lat ?? z.centerLat,
        centerLng: center?.lng ?? z.centerLng,
        radiusKm: z.radiusKm,
        deliveryFee: z.deliveryFee,
        minimumOrder: z.minimumOrder,
        estimatedMinutes: z.estimatedMinutes,
        isActive: z.isActive,
        sortOrder: z.sortOrder,
      })),
    });
  }

  if (parent.serviceFees.length > 0) {
    await prisma.serviceFee.createMany({
      data: parent.serviceFees.map((f) => ({
        restaurantId: childId,
        name: f.name,
        feeType: f.feeType,
        amount: f.amount,
        appliesTo: f.appliesTo,
        daysOfWeek: f.daysOfWeek,
        publicHolidaysOnly: f.publicHolidaysOnly,
        countryCode: f.countryCode,
        isActive: f.isActive,
        sortOrder: f.sortOrder,
      })),
    });
  }

  if (parent.receiptTemplates.length > 0) {
    await prisma.receiptTemplate.createMany({
      data: parent.receiptTemplates.map((t) => ({
        restaurantId: childId,
        name: t.name,
        type: t.type,
        template: t.template,
        isDefault: t.isDefault,
      })),
    });
  }

  if (parent.holidays.length > 0) {
    await prisma.restaurantHoliday.createMany({
      data: parent.holidays.map((h) => ({
        restaurantId: childId,
        date: h.date,
        name: h.name,
      })),
    });
  }

  // Reservation settings is a 1:1 row — clone it so booking rules carry over.
  if (parent.reservationSettings) {
    const r = parent.reservationSettings;
    await prisma.reservationSettings.create({
      data: {
        restaurantId: childId,
        minNoticeHours: r.minNoticeHours,
        minNoticeMinutes: r.minNoticeMinutes,
        maxAdvanceDays: r.maxAdvanceDays,
        slotLengthMinutes: r.slotLengthMinutes,
        maxPerSlot: r.maxPerSlot,
        minGuests: r.minGuests,
        maxGuests: r.maxGuests,
        autoConfirm: r.autoConfirm,
        allowPreOrder: r.allowPreOrder,
        holdMinutes: r.holdMinutes,
        requireDeposit: r.requireDeposit,
        depositAmount: r.depositAmount,
        cancellationPolicy: r.cancellationPolicy,
        reservationHours: r.reservationHours,
        blackoutDates: r.blackoutDates,
      },
    });
  }
}
