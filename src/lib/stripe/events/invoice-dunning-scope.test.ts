/**
 * Platform-vs-add-on billing scope (2026-07-11). One Stripe customer carries
 * SEVERAL subscriptions: the platform plan (Restaurant.stripeSubscriptionId)
 * plus one per add-on. The invoice.paid handler used to apply the
 * restaurant-level writes (subscriptionStatus="active", currentPeriodEnd,
 * clearRestaurantGrace) for EVERY paid invoice on the customer — so an add-on
 * renewal stomped the platform plan's period, masked a past_due plan, and
 * killed the dunning countdown while the PLATFORM subscription was the one
 * failing. These tests pin the scoped contract on the REAL handlers
 * (handleInvoiceEvent / handleSubscriptionEvent) over an in-memory prisma:
 *
 *   - plan status + currentPeriodEnd only react to PLATFORM invoices
 *   - the documented free→active flip on the first paid add-on still works
 *     (see /api/auth/register) but can never overwrite a problem status
 *   - the shared grace clock starts on ANY failure (coarse flag) but clears
 *     only when NOTHING is still failing (clearRestaurantGraceIfHealthy),
 *     from whichever recovery event lands last (invoice vs subscription).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  state: {
    restaurant: null as any,
    invoices: [] as any[],
    addOnRows: [] as any[],
    addOns: [] as any[],
    emails: [] as any[],
  },
}));

vi.mock("@/lib/db", () => ({
  default: {
    restaurant: {
      findUnique: async ({ where }: any) => {
        const r = h.state.restaurant;
        if (!r) return null;
        if (where.stripeCustomerId && r.stripeCustomerId !== where.stripeCustomerId) return null;
        if (where.id && r.id !== where.id) return null;
        return { ...r };
      },
      update: async ({ data }: any) => {
        Object.assign(h.state.restaurant, data);
        return { ...h.state.restaurant };
      },
      updateMany: async ({ where, data }: any) => {
        const r = h.state.restaurant;
        const statusMatches =
          where.subscriptionStatus === undefined || r?.subscriptionStatus === where.subscriptionStatus;
        if (r && r.id === where.id && statusMatches) {
          Object.assign(r, data);
          return { count: 1 };
        }
        return { count: 0 };
      },
    },
    subscriptionInvoice: {
      upsert: async ({ where, create, update }: any) => {
        let row = h.state.invoices.find((i) => i.stripeInvoiceId === where.stripeInvoiceId);
        if (row) Object.assign(row, update);
        else {
          row = { id: `si_${h.state.invoices.length + 1}`, ...create };
          h.state.invoices.push(row);
        }
        return { ...row };
      },
    },
    restaurantAddOn: {
      count: async ({ where }: any) =>
        h.state.addOnRows.filter(
          (r) =>
            r.restaurantId === where.restaurantId &&
            (where.status === undefined || r.status === where.status) &&
            (where.graceEndsAt?.gt === undefined ||
              (r.graceEndsAt && r.graceEndsAt > where.graceEndsAt.gt)),
        ).length,
      findUnique: async ({ where }: any) => {
        const k = where.restaurantId_addOnId;
        const row = h.state.addOnRows.find(
          (r) => r.restaurantId === k.restaurantId && r.addOnId === k.addOnId,
        );
        return row ? { ...row } : null;
      },
      upsert: async ({ where, create, update }: any) => {
        const k = where.restaurantId_addOnId;
        let row = h.state.addOnRows.find(
          (r) => r.restaurantId === k.restaurantId && r.addOnId === k.addOnId,
        );
        if (row) Object.assign(row, update);
        else {
          row = { ...create };
          h.state.addOnRows.push(row);
        }
        return { ...row };
      },
      updateMany: async ({ where, data }: any) => {
        const rows = h.state.addOnRows.filter(
          (r) => r.restaurantId === where.restaurantId && r.addOnId === where.addOnId,
        );
        rows.forEach((r) => Object.assign(r, data));
        return { count: rows.length };
      },
    },
    addOn: {
      findUnique: async ({ where }: any) =>
        h.state.addOns.find((a) => a.slug === where.slug) ?? null,
    },
  },
}));

vi.mock("@/lib/email", () => ({
  sendBillingNotificationEmail: vi.fn(async (args: any) => {
    h.state.emails.push(args);
  }),
}));
vi.mock("@/lib/commission", () => ({ recordCommissionForInvoice: vi.fn(async () => {}) }));
vi.mock("@/lib/marketplace", () => ({ ensureMarketplaceListing: vi.fn(async () => {}) }));
vi.mock("@/lib/platform-notifications", () => ({ notifyAddOnChange: vi.fn(async () => {}) }));
vi.mock("@/lib/reseller-subdomain", () => ({ ensureResellerGenericSubdomain: vi.fn(async () => {}) }));

import { handleInvoiceEvent } from "./invoice";
import { handleSubscriptionEvent } from "./subscription";

const DAY = 24 * 60 * 60 * 1000;
const PLATFORM_SUB = "sub_platform";
const ADDON_SUB = "sub_addon";
const PLATFORM_PERIOD_END = new Date("2026-08-01T00:00:00.000Z");
// Invoice periods travel as epoch SECONDS on the wire.
const ADDON_PERIOD_END_SEC = Math.floor(new Date("2026-07-20T00:00:00.000Z").getTime() / 1000);
const PLATFORM_PERIOD_END_SEC = Math.floor(new Date("2026-09-01T00:00:00.000Z").getTime() / 1000);

function invoiceEvent(
  type: "invoice.paid" | "invoice.payment_failed",
  { sub, periodEndSec, id = "in_1", amount = 2900 }: { sub: string | null; periodEndSec?: number; id?: string; amount?: number },
) {
  return {
    type,
    data: {
      object: {
        id,
        customer: "cus_1",
        subscription: sub,
        status: type === "invoice.paid" ? "paid" : "open",
        amount_paid: type === "invoice.paid" ? amount : 0,
        amount_due: amount,
        currency: "cad",
        period_start: periodEndSec ? periodEndSec - 30 * 24 * 3600 : null,
        period_end: periodEndSec ?? null,
        hosted_invoice_url: null,
        invoice_pdf: null,
        attempt_count: 1,
        status_transitions: { paid_at: 1750000000 },
        metadata: {},
      },
    },
  } as any;
}

function addOnSubEvent(
  type: "customer.subscription.updated" | "customer.subscription.deleted",
  status: string,
) {
  return {
    type,
    data: {
      object: {
        id: ADDON_SUB,
        customer: "cus_1",
        status,
        cancel_at_period_end: false,
        metadata: { addOnSlug: "unlimited_orders", restaurantId: "r1" },
        items: { data: [{ current_period_end: ADDON_PERIOD_END_SEC }] },
      },
    },
  } as any;
}

function platformSubEvent(status: string) {
  return {
    type: "customer.subscription.updated",
    data: {
      object: {
        id: PLATFORM_SUB,
        customer: "cus_1",
        status,
        cancel_at_period_end: false,
        metadata: {},
        items: { data: [{ current_period_end: PLATFORM_PERIOD_END_SEC }] },
      },
    },
  } as any;
}

beforeEach(() => {
  h.state.restaurant = {
    id: "r1",
    stripeCustomerId: "cus_1",
    stripeSubscriptionId: PLATFORM_SUB,
    subscriptionStatus: "active",
    currentPeriodEnd: PLATFORM_PERIOD_END,
    graceEndsAt: null,
    dunningStartedAt: null,
    lastDunnedOn: null,
    email: "owner@example.com",
    name: "Testaurant",
    defaultLanguage: "en",
  };
  h.state.invoices = [];
  h.state.addOnRows = [];
  h.state.addOns = [{ id: "ao1", slug: "unlimited_orders", name: "Unlimited Orders" }];
  h.state.emails = [];
});

describe("invoice.paid — platform scoping", () => {
  it("an ADD-ON renewal does NOT stomp a past_due platform plan (status, period, grace all survive)", async () => {
    const grace = new Date(Date.now() + 7 * DAY);
    Object.assign(h.state.restaurant, {
      subscriptionStatus: "past_due",
      graceEndsAt: grace,
      dunningStartedAt: new Date(Date.now() - 3 * DAY),
    });

    await handleInvoiceEvent(
      invoiceEvent("invoice.paid", { sub: ADDON_SUB, periodEndSec: ADDON_PERIOD_END_SEC }),
    );

    expect(h.state.restaurant.subscriptionStatus).toBe("past_due"); // plan problem NOT masked
    expect(h.state.restaurant.currentPeriodEnd).toEqual(PLATFORM_PERIOD_END); // period NOT stomped
    expect(h.state.restaurant.graceEndsAt).toEqual(grace); // countdown NOT killed
  });

  it("a PLATFORM renewal extends the window, flips active, and clears grace when nothing else fails", async () => {
    Object.assign(h.state.restaurant, {
      subscriptionStatus: "past_due",
      graceEndsAt: new Date(Date.now() + 7 * DAY),
      dunningStartedAt: new Date(),
      lastDunnedOn: "2026-07-10",
    });

    await handleInvoiceEvent(
      invoiceEvent("invoice.paid", { sub: PLATFORM_SUB, periodEndSec: PLATFORM_PERIOD_END_SEC }),
    );

    expect(h.state.restaurant.subscriptionStatus).toBe("active");
    expect(h.state.restaurant.currentPeriodEnd).toEqual(new Date(PLATFORM_PERIOD_END_SEC * 1000));
    expect(h.state.restaurant.graceEndsAt).toBeNull();
    expect(h.state.restaurant.dunningStartedAt).toBeNull();
    expect(h.state.restaurant.lastDunnedOn).toBeNull();
  });

  it("a PLATFORM renewal keeps the grace clock while an add-on is still inside its grace window", async () => {
    const grace = new Date(Date.now() + 7 * DAY);
    Object.assign(h.state.restaurant, { graceEndsAt: grace, dunningStartedAt: new Date() });
    h.state.addOnRows = [
      { restaurantId: "r1", addOnId: "ao1", status: "past_due", graceEndsAt: new Date(Date.now() + 5 * DAY) },
    ];

    await handleInvoiceEvent(
      invoiceEvent("invoice.paid", { sub: PLATFORM_SUB, periodEndSec: PLATFORM_PERIOD_END_SEC }),
    );

    expect(h.state.restaurant.subscriptionStatus).toBe("active");
    expect(h.state.restaurant.graceEndsAt).toEqual(grace); // add-on still dunning → clock stays
  });

  it("a zombie past_due add-on whose OWN grace already expired does not hold the clock hostage", async () => {
    Object.assign(h.state.restaurant, { graceEndsAt: new Date(Date.now() + 7 * DAY) });
    h.state.addOnRows = [
      { restaurantId: "r1", addOnId: "ao1", status: "past_due", graceEndsAt: new Date(Date.now() - 20 * DAY) },
    ];

    await handleInvoiceEvent(
      invoiceEvent("invoice.paid", { sub: PLATFORM_SUB, periodEndSec: PLATFORM_PERIOD_END_SEC }),
    );

    expect(h.state.restaurant.graceEndsAt).toBeNull(); // downgraded row = dunning already over
  });

  it("the first paid ADD-ON flips a free plan to active — without touching currentPeriodEnd", async () => {
    Object.assign(h.state.restaurant, {
      stripeSubscriptionId: null, // free plan: no platform subscription
      subscriptionStatus: "free",
      currentPeriodEnd: null,
    });

    await handleInvoiceEvent(
      invoiceEvent("invoice.paid", { sub: ADDON_SUB, periodEndSec: ADDON_PERIOD_END_SEC }),
    );

    expect(h.state.restaurant.subscriptionStatus).toBe("active"); // documented free→active rule
    expect(h.state.restaurant.currentPeriodEnd).toBeNull(); // add-on period never lands here
  });

  it("an ADD-ON payment never resurrects a cancelled plan", async () => {
    Object.assign(h.state.restaurant, { stripeSubscriptionId: null, subscriptionStatus: "cancelled" });

    await handleInvoiceEvent(
      invoiceEvent("invoice.paid", { sub: ADDON_SUB, periodEndSec: ADDON_PERIOD_END_SEC }),
    );

    expect(h.state.restaurant.subscriptionStatus).toBe("cancelled");
  });

  it("a one-off invoice (no subscription) on a free-plan restaurant is NOT read as platform (null === null trap)", async () => {
    Object.assign(h.state.restaurant, {
      stripeSubscriptionId: null,
      subscriptionStatus: "free",
      currentPeriodEnd: null,
    });

    await handleInvoiceEvent(invoiceEvent("invoice.paid", { sub: null, periodEndSec: ADDON_PERIOD_END_SEC }));

    expect(h.state.restaurant.subscriptionStatus).toBe("free"); // no subscription → no flip
    expect(h.state.restaurant.currentPeriodEnd).toBeNull();
  });

  it("an ADD-ON payment clears a leftover clock once everything reads healthy", async () => {
    // Clock started by an add-on failure; the row already recovered via
    // subscription.updated (processed first) — the paid invoice lands last.
    Object.assign(h.state.restaurant, { graceEndsAt: new Date(Date.now() + 7 * DAY), dunningStartedAt: new Date() });
    h.state.addOnRows = [{ restaurantId: "r1", addOnId: "ao1", status: "active", graceEndsAt: null }];

    await handleInvoiceEvent(
      invoiceEvent("invoice.paid", { sub: ADDON_SUB, periodEndSec: ADDON_PERIOD_END_SEC }),
    );

    expect(h.state.restaurant.graceEndsAt).toBeNull();
    expect(h.state.restaurant.subscriptionStatus).toBe("active"); // untouched — was already active
  });
});

describe("invoice.payment_failed — platform scoping", () => {
  it("a failed ADD-ON charge starts the shared grace clock + day-0 email but does NOT brand the plan past_due", async () => {
    await handleInvoiceEvent(invoiceEvent("invoice.payment_failed", { sub: ADDON_SUB }));

    expect(h.state.restaurant.subscriptionStatus).toBe("active"); // plan untouched
    expect(h.state.restaurant.graceEndsAt).toBeInstanceOf(Date); // coarse flag DID start
    expect(h.state.emails).toHaveLength(1); // day-0 notice sent
  });

  it("a failed PLATFORM charge sets past_due + starts the clock; a retry neither resets the deadline nor re-emails", async () => {
    await handleInvoiceEvent(invoiceEvent("invoice.payment_failed", { sub: PLATFORM_SUB }));
    const firstDeadline = h.state.restaurant.graceEndsAt;
    expect(h.state.restaurant.subscriptionStatus).toBe("past_due");
    expect(firstDeadline).toBeInstanceOf(Date);
    expect(h.state.emails).toHaveLength(1);

    await handleInvoiceEvent(invoiceEvent("invoice.payment_failed", { sub: PLATFORM_SUB, id: "in_2" }));
    expect(h.state.restaurant.graceEndsAt).toEqual(firstDeadline); // idempotent — no deadline push-out
    expect(h.state.emails).toHaveLength(1); // no re-spam
  });
});

describe("subscription events — recovery releases the shared clock", () => {
  it("add-on past_due → active clears the row grace AND the restaurant clock when the plan is healthy", async () => {
    Object.assign(h.state.restaurant, { graceEndsAt: new Date(Date.now() + 7 * DAY), dunningStartedAt: new Date() });
    h.state.addOnRows = [
      { restaurantId: "r1", addOnId: "ao1", status: "past_due", graceEndsAt: new Date(Date.now() + 7 * DAY) },
    ];

    await handleSubscriptionEvent(addOnSubEvent("customer.subscription.updated", "active"));

    expect(h.state.addOnRows[0].status).toBe("active");
    expect(h.state.addOnRows[0].graceEndsAt).toBeNull();
    expect(h.state.restaurant.graceEndsAt).toBeNull();
  });

  it("add-on recovery does NOT clear the clock while the PLATFORM plan is still past_due", async () => {
    const grace = new Date(Date.now() + 7 * DAY);
    Object.assign(h.state.restaurant, { subscriptionStatus: "past_due", graceEndsAt: grace });
    h.state.addOnRows = [
      { restaurantId: "r1", addOnId: "ao1", status: "past_due", graceEndsAt: new Date(Date.now() + 7 * DAY) },
    ];

    await handleSubscriptionEvent(addOnSubEvent("customer.subscription.updated", "active"));

    expect(h.state.addOnRows[0].status).toBe("active"); // the add-on itself recovered
    expect(h.state.restaurant.graceEndsAt).toEqual(grace); // but the plan is still failing
  });

  it("platform subscription.updated → active clears the clock when nothing else fails", async () => {
    Object.assign(h.state.restaurant, {
      subscriptionStatus: "past_due",
      graceEndsAt: new Date(Date.now() + 7 * DAY),
      dunningStartedAt: new Date(),
    });

    await handleSubscriptionEvent(platformSubEvent("active"));

    expect(h.state.restaurant.subscriptionStatus).toBe("active");
    expect(h.state.restaurant.graceEndsAt).toBeNull();
  });

  it("deleting (cancelling) a FAILING add-on ends its dunning and releases a healthy restaurant's clock", async () => {
    Object.assign(h.state.restaurant, { graceEndsAt: new Date(Date.now() + 7 * DAY), dunningStartedAt: new Date() });
    h.state.addOnRows = [
      { restaurantId: "r1", addOnId: "ao1", status: "past_due", graceEndsAt: new Date(Date.now() + 7 * DAY) },
    ];

    await handleSubscriptionEvent(addOnSubEvent("customer.subscription.deleted", "canceled"));

    expect(h.state.addOnRows[0].status).toBe("cancelled");
    expect(h.state.restaurant.graceEndsAt).toBeNull();
  });
});
