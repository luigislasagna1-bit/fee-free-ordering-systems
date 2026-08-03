import { describe, it, expect, vi, beforeEach } from "vitest";

const { prismaMock, stripeReadyMock, subscriptionsUpdateMock, customersRetrieveMock } = vi.hoisted(() => ({
  prismaMock: {
    restaurant: { findUnique: vi.fn() },
    restaurantAddOn: { findMany: vi.fn() },
  },
  stripeReadyMock: vi.fn(),
  subscriptionsUpdateMock: vi.fn(),
  customersRetrieveMock: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ default: prismaMock }));
vi.mock("@/lib/stripe", () => ({
  stripeReady: stripeReadyMock,
  getStripe: async () => ({
    customers: { retrieve: customersRetrieveMock },
    subscriptions: { update: subscriptionsUpdateMock },
  }),
}));

import { applyDefaultCardToAllSubscriptions } from "./apply-default-card";

beforeEach(() => {
  vi.clearAllMocks();
  stripeReadyMock.mockResolvedValue(true);
  customersRetrieveMock.mockResolvedValue({
    id: "cus_1",
    invoice_settings: { default_payment_method: { id: "pm_new" } },
  });
});

describe("applyDefaultCardToAllSubscriptions", () => {
  it("points every add-on subscription AND the platform subscription at the customer's current default card, scoped to the one restaurant", async () => {
    prismaMock.restaurant.findUnique.mockResolvedValue({
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_platform",
    });
    prismaMock.restaurantAddOn.findMany.mockResolvedValue([
      { stripeSubscriptionId: "sub_addon_1" },
      { stripeSubscriptionId: "sub_addon_2" },
    ]);
    subscriptionsUpdateMock.mockResolvedValue({});

    const result = await applyDefaultCardToAllSubscriptions("r1");

    expect(result).toEqual({ ok: true, updatedCount: 3, totalCount: 3 });
    // Restaurant-scoped: the add-on lookup must be filtered to THIS
    // restaurant — never a bare findMany that could leak another
    // restaurant's subscriptions.
    expect(prismaMock.restaurantAddOn.findMany).toHaveBeenCalledWith({
      where: { restaurantId: "r1", stripeSubscriptionId: { not: null } },
      select: { stripeSubscriptionId: true },
    });
    expect(subscriptionsUpdateMock).toHaveBeenCalledTimes(3);
    for (const subId of ["sub_platform", "sub_addon_1", "sub_addon_2"]) {
      expect(subscriptionsUpdateMock).toHaveBeenCalledWith(subId, { default_payment_method: "pm_new" });
    }
  });

  it("is idempotent — calling it twice re-applies the same value and never touches an amount", async () => {
    prismaMock.restaurant.findUnique.mockResolvedValue({
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: null,
    });
    prismaMock.restaurantAddOn.findMany.mockResolvedValue([{ stripeSubscriptionId: "sub_addon_1" }]);
    subscriptionsUpdateMock.mockResolvedValue({});

    const first = await applyDefaultCardToAllSubscriptions("r1");
    const second = await applyDefaultCardToAllSubscriptions("r1");

    expect(first).toEqual({ ok: true, updatedCount: 1, totalCount: 1 });
    expect(second).toEqual({ ok: true, updatedCount: 1, totalCount: 1 });
    expect(subscriptionsUpdateMock).toHaveBeenCalledTimes(2);
    // Every call carries only a payment-method change — no `items`/`proration`
    // amount field is ever passed.
    for (const call of subscriptionsUpdateMock.mock.calls) {
      expect(Object.keys(call[1])).toEqual(["default_payment_method"]);
    }
  });

  it("keeps updating the rest when one subscription update fails", async () => {
    prismaMock.restaurant.findUnique.mockResolvedValue({
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_platform",
    });
    prismaMock.restaurantAddOn.findMany.mockResolvedValue([{ stripeSubscriptionId: "sub_addon_1" }]);
    subscriptionsUpdateMock.mockImplementation(async (id: string) => {
      if (id === "sub_addon_1") throw new Error("stripe: no such subscription");
      return {};
    });

    const result = await applyDefaultCardToAllSubscriptions("r1");
    expect(result).toEqual({ ok: true, updatedCount: 1, totalCount: 2 });
  });

  it("returns no_card when the customer has no default payment method on file", async () => {
    prismaMock.restaurant.findUnique.mockResolvedValue({ stripeCustomerId: "cus_1", stripeSubscriptionId: null });
    customersRetrieveMock.mockResolvedValue({ id: "cus_1", invoice_settings: {} });

    const result = await applyDefaultCardToAllSubscriptions("r1");
    expect(result).toEqual({ ok: false, error: "no_card" });
    expect(prismaMock.restaurantAddOn.findMany).not.toHaveBeenCalled();
    expect(subscriptionsUpdateMock).not.toHaveBeenCalled();
  });

  it("returns no_customer when the restaurant has no Stripe customer yet", async () => {
    prismaMock.restaurant.findUnique.mockResolvedValue({ stripeCustomerId: null, stripeSubscriptionId: null });

    const result = await applyDefaultCardToAllSubscriptions("r1");
    expect(result).toEqual({ ok: false, error: "no_customer" });
    expect(customersRetrieveMock).not.toHaveBeenCalled();
  });

  it("returns not_configured when Stripe isn't set up on the platform", async () => {
    stripeReadyMock.mockResolvedValue(false);
    const result = await applyDefaultCardToAllSubscriptions("r1");
    expect(result).toEqual({ ok: false, error: "not_configured" });
    expect(prismaMock.restaurant.findUnique).not.toHaveBeenCalled();
  });

  it("has zero subscriptions to update when the restaurant has neither a platform nor add-on subscription", async () => {
    prismaMock.restaurant.findUnique.mockResolvedValue({ stripeCustomerId: "cus_1", stripeSubscriptionId: null });
    prismaMock.restaurantAddOn.findMany.mockResolvedValue([]);

    const result = await applyDefaultCardToAllSubscriptions("r1");
    expect(result).toEqual({ ok: true, updatedCount: 0, totalCount: 0 });
    expect(subscriptionsUpdateMock).not.toHaveBeenCalled();
  });
});
