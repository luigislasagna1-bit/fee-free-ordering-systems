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
  // Payment Methods & Taxes
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
    | "ownerEmailVerifiedAt"
  >;
  hours: Pick<OpeningHours, "isOpen">[];
  categories: Pick<MenuCategory, "id">[];
  menuItems: Pick<MenuItem, "id" | "isAvailable">[];
  hasPaymentProvider: boolean;
  hasKitchenDevice: boolean;
  notificationRecipientCount: number;
}

/** Single source of truth for what "ready to publish" means. */
export function computeSetupProgress(input: ChecklistInput): SetupProgress {
  const { restaurant, hours, categories, menuItems, hasPaymentProvider, hasKitchenDevice, notificationRecipientCount } = input;

  const hasAddress = !!restaurant.address && !!restaurant.city && !!restaurant.country;
  const hasMapPin = restaurant.lat != null && restaurant.lng != null;
  const hasAtLeastOneService =
    !!restaurant.acceptsPickup ||
    !!restaurant.acceptsDelivery ||
    !!restaurant.acceptsDineIn ||
    !!restaurant.acceptsReservations;
  const hasOpenDay = hours.some((h) => h.isOpen);
  const activeMenuItems = menuItems.filter((m) => m.isAvailable);

  const steps: SetupStep[] = [
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

    // ─── Payment Methods & Taxes ────────────────────────────────────────
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
      label: "Payment methods",
      // Optional in v1 — restaurants can accept cash/pay-at-store without
      // online payments. Becomes auto-complete because cash is always valid.
      required: false,
      href: "/admin/payments/providers",
      complete: hasPaymentProvider || true,
    },

    // ─── Taking Orders ──────────────────────────────────────────────────
    {
      id: "orders.appConnected",
      section: "orders",
      label: "Order-taking app connected",
      // Phase 4: KitchenDevice heartbeats — required for publishing.
      required: true,
      href: "/admin/publishing",
      complete: hasKitchenDevice,
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
      label: "Install the Legacy Website widget",
      required: false, // optional install step — Phase 3 hooks the actual UI
      href: "/admin/publishing/legacy-website",
      complete: false, // toggled after the owner opens the publishing page in Phase 3
    },
  ];

  // Group steps into sections, count completion, and roll up.
  const sectionLabels: Record<SectionId, string> = {
    basics: "Restaurant Basics",
    services: "Services & Hours",
    payments: "Payment Methods & Taxes",
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
