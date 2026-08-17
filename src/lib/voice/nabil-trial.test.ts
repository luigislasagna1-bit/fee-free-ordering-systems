/**
 * One-time 7-day member demo — eligibility needs LIVE Stripe money (not a comp
 * row, not a grace row, not the free plan), and trialUsedAt is stamped once.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    restaurant: { findUnique: vi.fn() },
    restaurantAddOn: { count: vi.fn() },
    voiceAgentConfig: { findUnique: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() },
  },
}));
vi.mock("@/lib/db", () => ({ default: prismaMock }));

import {
  hasActivePaidSubscription,
  isNabilDemoEligible,
  markNabilDemoUsed,
  subscriptionIsNabilDemo,
  NABIL_DEMO_METADATA_KEY,
  PHONE_ORDERING_ADDON_SLUG,
} from "./nabil-trial";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.restaurant.findUnique.mockResolvedValue({ subscriptionStatus: "free", stripeSubscriptionId: null });
  prismaMock.restaurantAddOn.count.mockResolvedValue(0);
  prismaMock.voiceAgentConfig.findUnique.mockResolvedValue(null);
  prismaMock.voiceAgentConfig.upsert.mockResolvedValue({});
  prismaMock.voiceAgentConfig.updateMany.mockResolvedValue({ count: 1 });
});

describe("hasActivePaidSubscription", () => {
  it("free plan + no paid add-on → false", async () => {
    expect(await hasActivePaidSubscription("r1")).toBe(false);
  });
  it("active Stripe-billed platform plan → true", async () => {
    prismaMock.restaurant.findUnique.mockResolvedValue({ subscriptionStatus: "active", stripeSubscriptionId: "sub_plan" });
    expect(await hasActivePaidSubscription("r1")).toBe(true);
  });
  it("'active' plan status WITHOUT a Stripe subscription (legacy flip) does not count", async () => {
    prismaMock.restaurant.findUnique.mockResolvedValue({ subscriptionStatus: "active", stripeSubscriptionId: null });
    expect(await hasActivePaidSubscription("r1")).toBe(false);
  });
  it("past_due plan does not count", async () => {
    prismaMock.restaurant.findUnique.mockResolvedValue({ subscriptionStatus: "past_due", stripeSubscriptionId: "sub_plan" });
    expect(await hasActivePaidSubscription("r1")).toBe(false);
  });
  it("one active Stripe-billed add-on → true, and the query excludes complimentary rows + Nabil itself", async () => {
    prismaMock.restaurantAddOn.count.mockResolvedValue(1);
    expect(await hasActivePaidSubscription("r1")).toBe(true);
    const where = prismaMock.restaurantAddOn.count.mock.calls[0][0].where;
    expect(where).toMatchObject({
      restaurantId: "r1",
      status: "active",
      stripeSubscriptionId: { not: null },
      addOn: { slug: { not: PHONE_ORDERING_ADDON_SLUG } },
    });
  });
});

describe("isNabilDemoEligible", () => {
  it("paying + never used → eligible for 7 days", async () => {
    prismaMock.restaurantAddOn.count.mockResolvedValue(2);
    expect(await isNabilDemoEligible("r1")).toEqual({ eligible: true, days: 7 });
  });
  it("not paying → not_paying", async () => {
    expect(await isNabilDemoEligible("r1")).toEqual({ eligible: false, reason: "not_paying" });
  });
  it("already used wins over paying → already_used (never twice)", async () => {
    prismaMock.restaurantAddOn.count.mockResolvedValue(2);
    prismaMock.voiceAgentConfig.findUnique.mockResolvedValue({ trialUsedAt: new Date("2026-08-01T00:00:00Z") });
    expect(await isNabilDemoEligible("r1")).toEqual({ eligible: false, reason: "already_used" });
  });
});

describe("markNabilDemoUsed — idempotent stamp", () => {
  it("creates the config row if missing, then stamps only where still null", async () => {
    const at = new Date("2026-08-17T10:00:00Z");
    expect(await markNabilDemoUsed("r1", at)).toBe(true);
    expect(prismaMock.voiceAgentConfig.upsert).toHaveBeenCalledWith({
      where: { restaurantId: "r1" },
      create: { restaurantId: "r1", trialUsedAt: at },
      update: {},
    });
    expect(prismaMock.voiceAgentConfig.updateMany).toHaveBeenCalledWith({
      where: { restaurantId: "r1", trialUsedAt: null },
      data: { trialUsedAt: at },
    });
  });
  it("a retry (already stamped) writes nothing and reports false", async () => {
    prismaMock.voiceAgentConfig.updateMany.mockResolvedValue({ count: 0 });
    expect(await markNabilDemoUsed("r1")).toBe(false);
  });
});

describe("subscriptionIsNabilDemo", () => {
  it("only our metadata marker counts", () => {
    expect(subscriptionIsNabilDemo({ [NABIL_DEMO_METADATA_KEY]: "7" })).toBe(true);
    expect(subscriptionIsNabilDemo({ [NABIL_DEMO_METADATA_KEY]: "0" })).toBe(false);
    expect(subscriptionIsNabilDemo({ addOnSlug: "phone_ordering" })).toBe(false);
    expect(subscriptionIsNabilDemo(null)).toBe(false);
    expect(subscriptionIsNabilDemo(undefined)).toBe(false);
  });
});
