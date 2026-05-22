/**
 * Setup checklist — computes which onboarding steps a restaurant has finished.
 *
 * The result drives two UI surfaces:
 *   1. The sidebar's "Setup" group renders a checkmark next to each step.
 *   2. The admin header shows a "Setup X% complete" banner until done.
 *
 * Phase 3 will additionally use `requiredStepsRemaining()` to gate publishing.
 *
 * Keep this module pure: it accepts the data it needs as args, doesn't call
 * Prisma itself. The admin layout fetches the data and calls
 * `computeSetupProgress()` once per render.
 */

import type { Restaurant, MenuCategory, MenuItem, OpeningHours } from "@/generated/prisma/client";

export type StepId =
  // Restaurant Basics
  | "basics.nameAddress"
  | "basics.mapPin"
  | "basics.cuisine"
  | "basics.accountConfirmation"
  // Services & Opening Hours
  | "services.atLeastOne"
  | "services.openingHours"
  | "services.deliveryZones"
  | "services.deliveryManagement"
  // Payment Methods & Taxes
  | "payments.methodsSelected"
  | "payments.taxation"
  | "payments.currency"
  | "payments.methodConfigured"
  // Taking Orders
  | "orders.appConnected"
  | "orders.notificationRecipient"
  // Menu Setup
  | "menu.categoryExists"
  | "menu.itemExists"
  // Publishing
  | "publish.officialDetails"
  | "publish.widgetReady";

export type SectionId =
  | "basics"
  | "services"
  | "payments"
  | "orders"
  | "menu"
  | "publishing";

export interface SetupStep {
  id: StepId;
  section: SectionId;
  label: string;
  /** When true, publishing is blocked until this step is complete. */
  required: boolean;
  /** Where to send the owner to finish this step. */
  href: string;
  complete: boolean;
  /** Optional dynamic detail rendered under the step label. Used to
   *  surface live state, e.g. "iPhone 13 · 12s ago" for the kitchen
   *  device step. Optional — most steps don't need this. */
  detail?: string;
}

export interface SetupSection {
  id: SectionId;
  label: string;
  steps: SetupStep[];
  complete: boolean;
  completedCount: number;
  totalCount: number;
}

export interface SetupProgress {
  sections: SetupSection[];
  totalSteps: number;
  completedSteps: number;
  /** 0–100 integer percentage. */
  percent: number;
  /** True when every REQUIRED step is complete. Optional steps may still be open. */
  publishReady: boolean;
  /** List of required steps still open — used by the publishing-gate error message. */
  requiredStepsRemaining: SetupStep[];
}

export interface ChecklistInput {
  restaurant: Pick<
    Restaurant,
    | "id" | "name" | "address" | "city" | "country" | "phone"
    | "lat" | "lng" | "cuisineType" | "taxRate"
    | "acceptsPickup" | "acceptsDelivery" | "acceptsDineIn" | "acceptsReservations"
    | "ownerEmailVerifiedAt" | "widgetInstalledAt"
  >;
  hours: Pick<OpeningHours, "isOpen">[];
  categories: Pick<MenuCategory, "id">[];
  menuItems: Pick<MenuItem, "id" | "isAvailable">[];
  hasPaymentProvider: boolean;
  hasKitchenDevice: boolean;
  notificationRecipientCount: number;
  /** Count of active delivery zones for the restaurant. Required to publish
   *  ONLY when acceptsDelivery is enabled — pickup-only restaurants don't
   *  need zones. */
  deliveryZoneCount: number;
  /** Detail about the most recently-seen kitchen device, for surfacing
   *  in the "Order-taking app connected" step label. Null when no device
   *  has ever heartbeated. The live flag is just hasKitchenDevice — this
   *  payload is purely display. */
  kitchenDeviceDetail?: {
    label: string;
    lastSeenAt: Date;
  } | null;
  /** Accepted payment methods the owner chose. Slugs like "cash",
   *  "card_in_person", "online_card". Empty array means the owner hasn't
   *  picked yet — that's a required step. When the array includes
   *  "online_card", `hasPaymentProvider` becomes required too. */
  paymentMethods: string[];
  /** True iff the restaurant currently has the `card_payments` entitlement
   *  (i.e. an active/trialing `online_payments` add-on subscription).
   *  online_card in the methods array is only meaningful when this is true
   *  — without the add-on, the user can't even *toggle* online_card on,
   *  so we must not surface the "configure Stripe" step either. */
  hasOnlinePaymentsEntitlement: boolean;
  /** ShipDay deliverySource setting: "own" | "shipday" | "both" | null
   *  (null = no ShipdayConfig row, owner hasn't visited /admin/delivery/pool
   *  yet). Drives the new services.deliveryManagement required step. */
  deliverySource: "own" | "shipday" | "both" | null;
  /** True iff active/trialing driver_pool entitlement. Required for
   *  shipday/both deliverySource to count as "set up". */
  hasDriverPoolEntitlement: boolean;
}

/** Single source of truth for what "ready to publish" means. */
export function computeSetupProgress(input: ChecklistInput): SetupProgress {
  const { restaurant, hours, categories, menuItems, hasPaymentProvider, hasKitchenDevice, notificationRecipientCount, deliveryZoneCount, paymentMethods, hasOnlinePaymentsEntitlement, deliverySource, hasDriverPoolEntitlement, kitchenDeviceDetail } = input;
  // online_card is only meaningful when BOTH the owner ticked it AND they
  // have the online_payments add-on. Without the add-on, the option is
  // locked in the UI and the Stripe step shouldn't surface at all. This
  // gate is what makes the wizard stop showing "Online card payments
  // configured" to cash-only restaurants who happen to have legacy data.
  const acceptsOnlineCard = paymentMethods.includes("online_card") && hasOnlinePaymentsEntitlement;

  // Delivery management is "set up" when the owner has explicitly chosen
  // a deliverySource AND, if they chose shipday/both, has the driver_pool
  // entitlement to actually dispatch. "own" alone is enough (no add-on).
  const deliveryManagementChosen =
    deliverySource === "own" ||
    ((deliverySource === "shipday" || deliverySource === "both") && hasDriverPoolEntitlement);

  const hasAddress = !!restaurant.address && !!restaurant.city && !!restaurant.country;
  const hasMapPin = restaurant.lat != null && restaurant.lng != null;
  const hasAtLeastOneService =
    !!restaurant.acceptsPickup ||
    !!restaurant.acceptsDelivery ||
    !!restaurant.acceptsDineIn ||
    !!restaurant.acceptsReservations;
  const hasOpenDay = hours.some((h) => h.isOpen);
  const activeMenuItems = menuItems.filter((m) => m.isAvailable);

  const rawSteps: SetupStep[] = [
    // ─── Restaurant Basics ──────────────────────────────────────────────
    {
      id: "basics.nameAddress",
      section: "basics",
      label: "Name & address",
      required: true,
      href: "/admin/profile",
      complete: !!restaurant.name && hasAddress && !!restaurant.phone,
    },
    {
      id: "basics.mapPin",
      section: "basics",
      label: "Location pin on map",
      required: true,
      href: "/admin/profile",
      complete: hasMapPin,
    },
    {
      id: "basics.cuisine",
      section: "basics",
      label: "Cuisine type",
      required: false,
      href: "/admin/profile",
      complete: !!restaurant.cuisineType,
    },
    {
      id: "basics.accountConfirmation",
      section: "basics",
      label: "Email verified",
      required: true,
      href: "/admin/profile",
      complete: !!restaurant.ownerEmailVerifiedAt,
    },

    // ─── Services & Opening Hours ───────────────────────────────────────
    {
      id: "services.atLeastOne",
      section: "services",
      label: "At least one service enabled",
      required: true,
      href: "/admin/services",
      complete: hasAtLeastOneService,
    },
    {
      id: "services.openingHours",
      section: "services",
      label: "Opening hours",
      required: true,
      href: "/admin/hours",
      complete: hasOpenDay,
    },
    {
      id: "services.deliveryZones",
      section: "services",
      label: "Delivery zones",
      // Delivery zones are REQUIRED if the restaurant accepts delivery —
      // otherwise the customer-facing order page has no idea where to
      // deliver to and the order POST will reject every delivery attempt
      // with "Minimum order for this delivery area is $0.00" (zone math
      // falls through to the restaurant-level default with no minimum).
      // Pickup-only restaurants don't need zones, so this step quietly
      // auto-completes for them.
      required: !!restaurant.acceptsDelivery,
      href: "/admin/delivery",
      complete: !restaurant.acceptsDelivery || deliveryZoneCount > 0,
    },
    {
      id: "services.deliveryManagement",
      section: "services",
      label: "Delivery management chosen",
      // Required when the restaurant accepts delivery — they must
      // explicitly pick "own drivers", "ShipDay only", or "both" at
      // /admin/delivery/pool. "Own drivers" is always free and selectable;
      // ShipDay/Both require the Driver Pool entitlement (or Marketplace
      // Monthly which bundles it). This also gates marketplace signup —
      // without an explicit delivery source, marketplace orders couldn't
      // actually be dispatched.
      required: !!restaurant.acceptsDelivery,
      href: "/admin/delivery/pool",
      complete: !restaurant.acceptsDelivery || deliveryManagementChosen,
    },

    // ─── Payment Methods & Taxes ────────────────────────────────────────
    {
      id: "payments.methodsSelected",
      section: "payments",
      label: "Accepted payment methods",
      // Required: an owner must explicitly pick which methods they take
      // (cash / card-in-person / online card). Drives the publish gate
      // and the conditional "Stripe required" logic below.
      required: true,
      href: "/admin/payments",
      complete: paymentMethods.length > 0,
    },
    {
      id: "payments.taxation",
      section: "payments",
      label: "Taxation configured",
      // Tax-rate 0 is valid (no sales tax); we count anything explicit as set.
      // Default seed value is 0 so this auto-completes — owners can revisit if needed.
      required: false,
      href: "/admin/service-fees",
      complete: restaurant.taxRate != null,
    },
    {
      id: "payments.currency",
      section: "payments",
      label: "Currency",
      // Currency lives implicitly as USD until we expose a selector. Auto-complete.
      required: false,
      href: "/admin/profile",
      complete: true,
    },
    {
      id: "payments.methodConfigured",
      section: "payments",
      label: "Online card payments configured",
      // Conditionally required: only when the owner ticked "online_card"
      // in the methods step above. A cash-only / card-in-person-only
      // restaurant has no obligation to wire up Stripe Connect and
      // can publish without it.
      // Complete = Stripe Connect account is connected AND charges enabled,
      // OR the legacy PaymentProvider row is active. Loader.ts collapses
      // both signals into hasPaymentProvider.
      required: acceptsOnlineCard,
      href: "/admin/payments/providers",
      complete: hasPaymentProvider,
    },

    // ─── Taking Orders ──────────────────────────────────────────────────
    {
      id: "orders.appConnected",
      section: "orders",
      label: "Order-taking app connected",
      // KitchenDevice heartbeats — required for publishing. Detail shows
      // device name + how long since the last heartbeat so the owner can
      // tell at a glance whether the app is currently online or stale.
      required: true,
      href: "/admin/publishing",
      complete: hasKitchenDevice,
      detail: kitchenDeviceDetail
        ? `${kitchenDeviceDetail.label} · ${formatRelativeAgo(kitchenDeviceDetail.lastSeenAt)}`
        : "No device has connected yet",
    },
    {
      id: "orders.notificationRecipient",
      section: "orders",
      label: "At least one notification recipient",
      required: true,
      href: "/admin/notifications",
      complete: notificationRecipientCount > 0,
    },

    // ─── Menu Setup ─────────────────────────────────────────────────────
    {
      id: "menu.categoryExists",
      section: "menu",
      label: "At least one menu category",
      required: true,
      href: "/admin/menu",
      complete: categories.length > 0,
    },
    {
      id: "menu.itemExists",
      section: "menu",
      label: "At least one active menu item",
      required: true,
      href: "/admin/menu",
      complete: activeMenuItems.length > 0,
    },

    // ─── Publishing ─────────────────────────────────────────────────────
    {
      id: "publish.officialDetails",
      section: "publishing",
      label: "Official details & policy",
      // Covered by basics. Auto-complete when name + address present.
      required: false,
      href: "/admin/profile",
      complete: !!restaurant.name && hasAddress,
    },
    {
      id: "publish.widgetReady",
      section: "publishing",
      label: "Install the widget on your website",
      // Optional — restaurants who don't have their own external website
      // (or who just use the marketplace / hosted-site add-on) don't need
      // to install this. Tracked via Restaurant.widgetInstalledAt, which
      // gets stamped when the embed widget.js script fires its install
      // heartbeat from any third-party host page (see /api/widget/heartbeat).
      required: false,
      href: "/admin/publishing/legacy-website",
      complete: !!restaurant.widgetInstalledAt,
    },
  ];

  // Hide the "Online card payments configured" step entirely when
  // acceptsOnlineCard is false. Showing an open circle for a step that's
  // not required AND not actionable confuses owners (Luigi: "even though
  // I haven't chosen online payments, the system is not letting me
  // finish"). Cash-only / card-in-person-only restaurants shouldn't see
  // anything Stripe-related in the wizard.
  const steps = rawSteps.filter(
    (s) => s.id !== "payments.methodConfigured" || acceptsOnlineCard,
  );

  // Group steps into sections, count completion, and roll up.
  const sectionLabels: Record<SectionId, string> = {
    basics: "Restaurant Basics",
    services: "Services & Hours",
    payments: "Payments / Taxes",
    orders: "Taking Orders",
    menu: "Menu Setup",
    publishing: "Publishing",
  };
  const order: SectionId[] = ["basics", "services", "payments", "orders", "menu", "publishing"];

  const sections: SetupSection[] = order.map((sid) => {
    const stepsInSection = steps.filter((s) => s.section === sid);
    const completedCount = stepsInSection.filter((s) => s.complete).length;
    return {
      id: sid,
      label: sectionLabels[sid],
      steps: stepsInSection,
      completedCount,
      totalCount: stepsInSection.length,
      complete: completedCount === stepsInSection.length,
    };
  });

  const totalSteps = steps.length;
  const completedSteps = steps.filter((s) => s.complete).length;
  const percent = totalSteps === 0 ? 100 : Math.round((completedSteps / totalSteps) * 100);
  const requiredStepsRemaining = steps.filter((s) => s.required && !s.complete);
  const publishReady = requiredStepsRemaining.length === 0;

  return {
    sections,
    totalSteps,
    completedSteps,
    percent,
    publishReady,
    requiredStepsRemaining,
  };
}

/** Compact relative-time formatter: "12s ago", "3m ago", "2h ago", "5d ago". */
function formatRelativeAgo(when: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - when.getTime();
  const seconds = Math.max(0, Math.round(diffMs / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
