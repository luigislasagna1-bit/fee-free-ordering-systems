import { describe, it, expect } from "vitest";
import { computeSetupProgress, type ChecklistInput } from "@/lib/setup-checklist";

// Pins down the publish-gate logic. The email + payment cases are REGRESSION
// GUARDS for the setup-checklist dead-end fixed on 2026-06-15.

// A fully set-up, pickup-only restaurant that should be publish-ready. Each
// test overrides just the field it cares about.
function makeInput(
  overrides: Partial<Omit<ChecklistInput, "restaurant">> & {
    restaurant?: Partial<ChecklistInput["restaurant"]>;
  } = {},
): ChecklistInput {
  const { restaurant: rOverride, ...rest } = overrides;
  const base: ChecklistInput = {
    restaurant: {
      id: "r1",
      name: "Test Pizzeria",
      address: "1 Main St",
      city: "Townsville",
      country: "US",
      phone: "5551234567",
      lat: 1,
      lng: 2,
      cuisineType: "Pizza",
      taxRate: 0,
      acceptsPickup: true,
      acceptsDelivery: false,
      acceptsDineIn: false,
      acceptsReservations: false,
      ownerEmailVerifiedAt: new Date(),
      widgetInstalledAt: new Date(),
    },
    hours: [{ isOpen: true }],
    categories: [{ id: "c1" }],
    menuItems: [{ id: "m1", isAvailable: true }],
    hasPaymentProvider: true,
    hasKitchenDevice: true,
    notificationRecipientCount: 1,
    deliveryZoneCount: 0,
    paymentMethods: ["cash"],
    hasOnlinePaymentsEntitlement: false,
    deliverySource: null,
    hasDriverPoolEntitlement: false,
    hasSalesOptimizedWebsite: false,
  };
  return { ...base, ...rest, restaurant: { ...base.restaurant, ...(rOverride ?? {}) } };
}

const allSteps = (input: ChecklistInput) =>
  computeSetupProgress(input).sections.flatMap((s) => s.steps);
const requiredOpen = (input: ChecklistInput) =>
  computeSetupProgress(input).requiredStepsRemaining.map((s) => s.id);

describe("computeSetupProgress — publish readiness", () => {
  it("a fully set-up pickup-only restaurant is publish-ready", () => {
    expect(computeSetupProgress(makeInput()).publishReady).toBe(true);
  });

  it("blocks publish until the owner email is verified", () => {
    const r = computeSetupProgress(makeInput({ restaurant: { ownerEmailVerifiedAt: null } }));
    expect(r.publishReady).toBe(false);
    expect(r.requiredStepsRemaining.map((s) => s.id)).toContain("basics.accountConfirmation");
  });

  it("requires at least one payment method, and any non-empty list clears it", () => {
    expect(requiredOpen(makeInput({ paymentMethods: [] }))).toContain("payments.methodsSelected");
    // A per-type config flattened to a non-empty list clears the step.
    expect(requiredOpen(makeInput({ paymentMethods: ["online_card"] }))).not.toContain(
      "payments.methodsSelected",
    );
  });
});

describe("computeSetupProgress — conditional steps", () => {
  it("hides the online-card config step unless online card is picked AND the add-on is active", () => {
    const has = (input: ChecklistInput) =>
      allSteps(input).some((s) => s.id === "payments.methodConfigured");

    expect(has(makeInput({ paymentMethods: ["cash"] }))).toBe(false);
    expect(
      has(makeInput({ paymentMethods: ["online_card"], hasOnlinePaymentsEntitlement: false })),
    ).toBe(false);

    const withAddon = makeInput({
      paymentMethods: ["online_card"],
      hasOnlinePaymentsEntitlement: true,
      hasPaymentProvider: false,
    });
    const step = allSteps(withAddon).find((s) => s.id === "payments.methodConfigured");
    expect(step?.complete).toBe(false);
  });

  it("requires delivery zones only when delivery is enabled", () => {
    expect(requiredOpen(makeInput({ restaurant: { acceptsDelivery: false } }))).not.toContain(
      "services.deliveryZones",
    );
    expect(
      requiredOpen(makeInput({ restaurant: { acceptsDelivery: true }, deliveryZoneCount: 0 })),
    ).toContain("services.deliveryZones");
  });
});
