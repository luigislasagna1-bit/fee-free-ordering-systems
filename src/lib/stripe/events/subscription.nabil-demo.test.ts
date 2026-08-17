/**
 * Nabil AI member demo — the Stripe subscription webhook stamps
 * VoiceAgentConfig.trialUsedAt exactly when a phone_ordering subscription that
 * the Checkout route marked as the demo comes into existence, and never for
 * any other subscription (other add-ons, an un-marked Nabil sub, a deleted
 * event). The stamp itself is idempotent inside markNabilDemoUsed (own test).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

const h = vi.hoisted(() => ({
  prismaMock: {
    addOn: { findUnique: vi.fn() },
    restaurantAddOn: { findUnique: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() },
    restaurant: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  },
  markNabilDemoUsed: vi.fn(async () => true),
}));

vi.mock("@/lib/db", () => ({ default: h.prismaMock }));
vi.mock("@/lib/stripe", () => ({ getStripe: vi.fn(async () => ({})) }));
vi.mock("@/lib/platform-notifications", () => ({ notifyAddOnChange: vi.fn(async () => undefined) }));
vi.mock("@/lib/dunning", () => ({
  graceDeadline: () => new Date("2026-09-01T00:00:00Z"),
  startRestaurantGrace: vi.fn(async () => false),
  clearRestaurantGraceIfHealthy: vi.fn(async () => undefined),
}));
vi.mock("@/lib/reseller-subdomain", () => ({ ensureResellerGenericSubdomain: vi.fn(async () => undefined) }));
vi.mock("@/lib/voice/nabil-trial", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/voice/nabil-trial")>();
  return { ...actual, markNabilDemoUsed: h.markNabilDemoUsed };
});

import { handleSubscriptionEvent } from "./subscription";

function event(type: string, sub: Partial<Stripe.Subscription> & { metadata: Record<string, string> }): Stripe.Event {
  return {
    id: "evt_1",
    type,
    data: {
      object: {
        id: "sub_1",
        customer: "cus_1",
        status: "trialing",
        cancel_at_period_end: false,
        items: { data: [{ current_period_end: 1_800_000_000 }] },
        trial_end: 1_760_000_000,
        ...sub,
      },
    },
  } as unknown as Stripe.Event;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.prismaMock.addOn.findUnique.mockImplementation(async ({ where }: any) =>
    where.slug === "phone_ordering"
      ? { id: "addon_nabil", slug: "phone_ordering", name: "Nabil AI Phone Ordering" }
      : where.slug === "advanced_promos"
        ? { id: "addon_promos", slug: "advanced_promos", name: "Advanced Promotions" }
        : null,
  );
  h.prismaMock.restaurantAddOn.findUnique.mockResolvedValue(null);
  h.prismaMock.restaurantAddOn.upsert.mockResolvedValue({});
  h.prismaMock.restaurantAddOn.updateMany.mockResolvedValue({ count: 1 });
});

describe("Stripe subscription webhook × Nabil demo stamp", () => {
  it("phone_ordering sub marked as the demo → stamps trialUsedAt for that restaurant (after the row upsert)", async () => {
    await handleSubscriptionEvent(
      event("customer.subscription.created", {
        metadata: { addOnSlug: "phone_ordering", addOnId: "addon_nabil", restaurantId: "rest_1", nabilDemoDays: "7" },
      }),
    );
    expect(h.prismaMock.restaurantAddOn.upsert).toHaveBeenCalledTimes(1);
    expect(h.markNabilDemoUsed).toHaveBeenCalledWith("rest_1");
    // Row reads as ACTIVE (Stripe "trialing" maps to active) with the trial end kept.
    const upsert = h.prismaMock.restaurantAddOn.upsert.mock.calls[0][0];
    expect(upsert.create.status).toBe("active");
    expect(upsert.create.trialEndsAt).toEqual(new Date(1_760_000_000 * 1000));
  });

  it("phone_ordering sub WITHOUT the demo marker (e.g. a comp-row conversion carrying trial_end) never stamps", async () => {
    await handleSubscriptionEvent(
      event("customer.subscription.created", {
        metadata: { addOnSlug: "phone_ordering", addOnId: "addon_nabil", restaurantId: "rest_1" },
      }),
    );
    expect(h.prismaMock.restaurantAddOn.upsert).toHaveBeenCalledTimes(1);
    expect(h.markNabilDemoUsed).not.toHaveBeenCalled();
  });

  it("another add-on carrying the marker by mistake never stamps (slug-gated)", async () => {
    await handleSubscriptionEvent(
      event("customer.subscription.created", {
        metadata: { addOnSlug: "advanced_promos", addOnId: "addon_promos", restaurantId: "rest_1", nabilDemoDays: "7" },
      }),
    );
    expect(h.markNabilDemoUsed).not.toHaveBeenCalled();
  });

  it("a deleted event for the demo sub does not (re)stamp", async () => {
    h.prismaMock.restaurantAddOn.findUnique.mockResolvedValue({ status: "active", graceEndsAt: null, stripeSubscriptionId: "sub_1" });
    await handleSubscriptionEvent(
      event("customer.subscription.deleted", {
        status: "canceled",
        metadata: { addOnSlug: "phone_ordering", addOnId: "addon_nabil", restaurantId: "rest_1", nabilDemoDays: "7" },
      }),
    );
    expect(h.markNabilDemoUsed).not.toHaveBeenCalled();
    expect(h.prismaMock.restaurantAddOn.updateMany).toHaveBeenCalledTimes(1);
  });

  it("a later update event on the same demo sub calls the (idempotent) stamp again — the helper, not the handler, guarantees once", async () => {
    h.prismaMock.restaurantAddOn.findUnique.mockResolvedValue({ status: "active", graceEndsAt: null, stripeSubscriptionId: "sub_1" });
    h.markNabilDemoUsed.mockResolvedValueOnce(false);
    await handleSubscriptionEvent(
      event("customer.subscription.updated", {
        status: "active",
        metadata: { addOnSlug: "phone_ordering", addOnId: "addon_nabil", restaurantId: "rest_1", nabilDemoDays: "7" },
      }),
    );
    expect(h.markNabilDemoUsed).toHaveBeenCalledWith("rest_1");
  });
});
