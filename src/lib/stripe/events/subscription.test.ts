/**
 * Duplicate-subscription supersede guard (2026-07-11 hardening).
 *
 * Two Stripe Checkout sessions opened before the first completes can BOTH be
 * completed, producing two live subscriptions for the same add-on / plan /
 * white-label tier while our row only stores one sub id — the loser keeps
 * billing with no in-app cancel path. These tests drive handleSubscriptionEvent
 * over an in-memory prisma + a fake platform Stripe client and assert:
 *   - the duplicate is cancelled (+ refunded) and exactly one sub survives,
 *   - the winner is STABLE regardless of event arrival order,
 *   - the loser's later `deleted` event cannot kill the survivor's row,
 *   - legit flows (first subscribe, re-subscribe after cancel, comp-row
 *     conversion, same-sub retries) are untouched.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => {
  const state = {
    stripeSubs: {} as Record<string, any>,
    invoices: {} as Record<string, any>,
    cancelled: [] as Array<{ id: string; params: any }>,
    refunds: [] as Array<{ params: any; opts: any }>,
    retrieved: [] as string[], // subscription ids we asked Stripe about
    addOns: [] as any[],
    addOnRows: [] as any[],
    restaurants: [] as any[],
    resellers: [] as any[],
    notifications: [] as Array<{ restaurantId: string; slug: string; change: string }>,
    // restaurant ids passed to clearRestaurantGraceIfHealthy — the composed
    // supersede×grace assertions read this (a missing mock export here once
    // silently disabled every grace hook via the handlers' try/catch).
    graceClears: [] as string[],
  };
  return { state };
});

vi.mock("@/lib/db", () => {
  const s = h.state;
  const matchAddOnRow = (where: any) =>
    s.addOnRows.find(
      (r) =>
        r.restaurantId === where.restaurantId_addOnId.restaurantId &&
        r.addOnId === where.restaurantId_addOnId.addOnId
    );
  return {
    default: {
      addOn: {
        findUnique: async ({ where }: any) => s.addOns.find((a) => a.slug === where.slug) ?? null,
      },
      restaurantAddOn: {
        // Snapshot copy, like real Prisma — the handler's `prior` read must not
        // be aliased to the row a later update mutates.
        findUnique: async ({ where }: any) => {
          const row = matchAddOnRow(where);
          return row ? { ...row } : null;
        },
        upsert: async ({ where, create, update }: any) => {
          const row = matchAddOnRow(where);
          if (row) {
            Object.assign(row, update);
            return row;
          }
          const created = { ...create };
          s.addOnRows.push(created);
          return created;
        },
        updateMany: async ({ where, data }: any) => {
          // Honors the conditional sub-id OR-guard the deleted branch uses —
          // without it the mock would let a guarded write through and the
          // clobber regressions below could never fail.
          const orOk = (r: any) =>
            !where.OR || where.OR.some((c: any) => r.stripeSubscriptionId === c.stripeSubscriptionId);
          const rows = s.addOnRows.filter(
            (r) => r.restaurantId === where.restaurantId && r.addOnId === where.addOnId && orOk(r)
          );
          rows.forEach((r) => Object.assign(r, data));
          return { count: rows.length };
        },
      },
      restaurant: {
        findUnique: async ({ where }: any) =>
          s.restaurants.find((r) =>
            where.id ? r.id === where.id : r.stripeCustomerId === where.stripeCustomerId
          ) ?? null,
        update: async ({ where, data }: any) => {
          const r = s.restaurants.find((x) => x.id === where.id);
          Object.assign(r, data);
          return r;
        },
        updateMany: async ({ where, data }: any) => {
          const orOk = (r: any) =>
            !where.OR || where.OR.some((c: any) => r.stripeSubscriptionId === c.stripeSubscriptionId);
          const rows = s.restaurants.filter((r) => r.id === where.id && orOk(r));
          rows.forEach((r) => Object.assign(r, data));
          return { count: rows.length };
        },
      },
      resellerProfile: {
        findUnique: async ({ where }: any) => s.resellers.find((r) => r.id === where.id) ?? null,
        update: async ({ where, data }: any) => {
          const r = s.resellers.find((x) => x.id === where.id);
          Object.assign(r, data);
          return r;
        },
        updateMany: async ({ where, data }: any) => {
          const orOk = (r: any) =>
            !where.OR ||
            where.OR.some((c: any) => r.whiteLabelStripeSubscriptionId === c.whiteLabelStripeSubscriptionId);
          const rows = s.resellers.filter((r) => r.id === where.id && orOk(r));
          rows.forEach((r) => Object.assign(r, data));
          return { count: rows.length };
        },
      },
    },
  };
});

vi.mock("@/lib/stripe", () => ({
  getStripe: async () => ({
    subscriptions: {
      retrieve: async (id: string) => {
        h.state.retrieved.push(id);
        const sub = h.state.stripeSubs[id];
        if (!sub) {
          throw Object.assign(new Error(`No such subscription: ${id}`), {
            code: "resource_missing",
            statusCode: 404,
          });
        }
        return sub;
      },
      cancel: async (id: string, params: any = {}) => {
        const sub = h.state.stripeSubs[id];
        if (!sub) {
          throw Object.assign(new Error(`No such subscription: ${id}`), {
            code: "resource_missing",
            statusCode: 404,
          });
        }
        if (sub.status === "canceled") {
          throw Object.assign(new Error("Subscription is already canceled"), {
            code: "subscription_already_canceled",
          });
        }
        sub.status = "canceled";
        h.state.cancelled.push({ id, params });
        return sub;
      },
    },
    invoices: {
      retrieve: async (id: string) => {
        const inv = h.state.invoices[id];
        if (!inv) {
          throw Object.assign(new Error(`No such invoice: ${id}`), { code: "resource_missing" });
        }
        return inv;
      },
    },
    refunds: {
      create: async (params: any, opts: any) => {
        h.state.refunds.push({ params, opts });
        return { id: "re_test", status: "succeeded" };
      },
    },
  }),
}));

vi.mock("@/lib/marketplace", () => ({ ensureMarketplaceListing: async () => {} }));
vi.mock("@/lib/platform-notifications", () => ({
  notifyAddOnChange: async (restaurantId: string, addOn: any, change: string) => {
    h.state.notifications.push({ restaurantId, slug: addOn.slug, change });
  },
}));
vi.mock("@/lib/dunning", () => ({
  graceDeadline: () => new Date("2026-08-01T00:00:00Z"),
  startRestaurantGrace: async () => {},
  clearRestaurantGraceIfHealthy: async (restaurantId: string) => {
    h.state.graceClears.push(restaurantId);
    return false;
  },
}));
vi.mock("@/lib/reseller-subdomain", () => ({ ensureResellerGenericSubdomain: async () => {} }));

import { handleSubscriptionEvent } from "@/lib/stripe/events/subscription";

const T0 = 1_780_000_000; // fixed epoch base — supersede logic compares `created`, never wall-clock
const ADDON_META = { addOnSlug: "driver_pool", addOnId: "ao_1", restaurantId: "r1" };

/** Register a subscription in the fake Stripe backend + its paid invoice. */
function seedStripeSub(opts: {
  id: string;
  created: number;
  status?: string;
  metadata?: any;
  customer?: string;
  invoice?: any; // null = no latest_invoice; object = custom invoice shape
}) {
  const invoiceId = opts.invoice === null ? null : `in_${opts.id}`;
  const sub = {
    id: opts.id,
    object: "subscription",
    customer: opts.customer ?? "cus_1",
    status: opts.status ?? "active",
    created: opts.created,
    metadata: opts.metadata ?? {},
    latest_invoice: invoiceId,
    cancel_at_period_end: false,
    current_period_end: opts.created + 30 * 86400,
    trial_end: null,
  };
  h.state.stripeSubs[opts.id] = sub;
  if (invoiceId) {
    h.state.invoices[invoiceId] =
      opts.invoice ?? {
        id: invoiceId,
        status: "paid",
        amount_paid: 1999,
        payment_intent: `pi_${opts.id}`,
      };
  }
  return sub;
}

function evt(type: string, sub: any) {
  return { type, data: { object: sub } } as any;
}

beforeEach(() => {
  h.state.stripeSubs = {};
  h.state.invoices = {};
  h.state.cancelled = [];
  h.state.refunds = [];
  h.state.retrieved = [];
  h.state.notifications = [];
  h.state.graceClears = [];
  h.state.addOns = [{ id: "ao_1", slug: "driver_pool", name: "Driver Pool" }];
  h.state.addOnRows = [];
  h.state.restaurants = [
    {
      id: "r1",
      stripeCustomerId: "cus_1",
      email: "o@x.com",
      name: "R1",
      defaultLanguage: "en",
      stripeSubscriptionId: null,
      subscriptionStatus: "active",
    },
  ];
  h.state.resellers = [
    { id: "rp_1", whiteLabelStripeSubscriptionId: null, whiteLabelStatus: null, whiteLabelTier: null },
  ];
});

function seedAddOnRow(over: Partial<any> = {}) {
  const row = {
    restaurantId: "r1",
    addOnId: "ao_1",
    status: "active",
    stripeSubscriptionId: "sub_a",
    ...over,
  };
  h.state.addOnRows.push(row);
  return row;
}

describe("add-on supersede — duplicate Checkout race", () => {
  it("first subscription stamps normally (no cancels, no refunds)", async () => {
    const b = seedStripeSub({ id: "sub_b", created: T0, metadata: ADDON_META });
    await handleSubscriptionEvent(evt("customer.subscription.created", b));
    expect(h.state.addOnRows[0].stripeSubscriptionId).toBe("sub_b");
    expect(h.state.addOnRows[0].status).toBe("active");
    expect(h.state.cancelled).toEqual([]);
    expect(h.state.refunds).toEqual([]);
  });

  it("in-order duplicate: newer sub's event cancels + refunds the older, row re-stamped", async () => {
    seedStripeSub({ id: "sub_a", created: T0, metadata: ADDON_META });
    seedAddOnRow({ stripeSubscriptionId: "sub_a" });
    const b = seedStripeSub({ id: "sub_b", created: T0 + 600, metadata: ADDON_META });

    await handleSubscriptionEvent(evt("customer.subscription.created", b));

    expect(h.state.cancelled).toEqual([{ id: "sub_a", params: {} }]); // plain cancel, no prorate
    expect(h.state.refunds).toHaveLength(1);
    expect(h.state.refunds[0].params).toMatchObject({ payment_intent: "pi_sub_a", reason: "duplicate" });
    expect(h.state.refunds[0].opts).toMatchObject({ idempotencyKey: "supersede-refund-in_sub_a" });
    expect(h.state.addOnRows[0].stripeSubscriptionId).toBe("sub_b");
    expect(h.state.addOnRows[0].status).toBe("active");
  });

  it("out-of-order duplicate: older sub's event cannot clobber the newer winner", async () => {
    seedStripeSub({ id: "sub_b", created: T0 + 600, metadata: ADDON_META });
    seedAddOnRow({ stripeSubscriptionId: "sub_b" });
    const a = seedStripeSub({ id: "sub_a", created: T0, metadata: ADDON_META });

    await handleSubscriptionEvent(evt("customer.subscription.created", a));

    // Same survivor as the in-order case: sub_a dies either way.
    expect(h.state.cancelled).toEqual([{ id: "sub_a", params: {} }]);
    expect(h.state.refunds[0].params).toMatchObject({ payment_intent: "pi_sub_a", reason: "duplicate" });
    expect(h.state.addOnRows[0].stripeSubscriptionId).toBe("sub_b"); // NOT re-stamped
  });

  it("legit re-subscribe: row tracking a CANCELED sub is stamped without any supersede", async () => {
    seedStripeSub({ id: "sub_a", created: T0, status: "canceled", metadata: ADDON_META });
    seedAddOnRow({ stripeSubscriptionId: "sub_a", status: "cancelled" });
    const b = seedStripeSub({ id: "sub_b", created: T0 + 86400 * 10, metadata: ADDON_META });

    await handleSubscriptionEvent(evt("customer.subscription.created", b));

    expect(h.state.cancelled).toEqual([]);
    expect(h.state.refunds).toEqual([]);
    expect(h.state.addOnRows[0].stripeSubscriptionId).toBe("sub_b");
    expect(h.state.addOnRows[0].status).toBe("active");
  });

  it("row tracking an id Stripe no longer knows (test→live legacy) stamps normally", async () => {
    seedAddOnRow({ stripeSubscriptionId: "sub_ghost" });
    const b = seedStripeSub({ id: "sub_b", created: T0, metadata: ADDON_META });

    await handleSubscriptionEvent(evt("customer.subscription.updated", b));

    expect(h.state.cancelled).toEqual([]);
    expect(h.state.addOnRows[0].stripeSubscriptionId).toBe("sub_b");
  });

  it("complimentary row (null sub id) converts without touching Stripe", async () => {
    seedAddOnRow({ stripeSubscriptionId: null, status: "trialing" });
    const b = seedStripeSub({ id: "sub_b", created: T0, metadata: ADDON_META });

    await handleSubscriptionEvent(evt("customer.subscription.created", b));

    expect(h.state.retrieved).toEqual([]); // no supersede lookup at all
    expect(h.state.addOnRows[0].stripeSubscriptionId).toBe("sub_b");
  });

  it("retry of the winner's own event is a plain no-op stamp", async () => {
    const b = seedStripeSub({ id: "sub_b", created: T0, metadata: ADDON_META });
    seedAddOnRow({ stripeSubscriptionId: "sub_b" });

    await handleSubscriptionEvent(evt("customer.subscription.updated", b));

    expect(h.state.retrieved).toEqual([]);
    expect(h.state.cancelled).toEqual([]);
    expect(h.state.refunds).toEqual([]);
    expect(h.state.addOnRows[0].stripeSubscriptionId).toBe("sub_b");
  });

  it("deleted event for the SUPERSEDED sub does not cancel the survivor's row", async () => {
    seedStripeSub({ id: "sub_b", created: T0 + 600, metadata: ADDON_META });
    seedAddOnRow({ stripeSubscriptionId: "sub_b" });
    const a = seedStripeSub({ id: "sub_a", created: T0, status: "canceled", metadata: ADDON_META });

    await handleSubscriptionEvent(evt("customer.subscription.deleted", a));

    expect(h.state.addOnRows[0].status).toBe("active"); // untouched
    expect(h.state.addOnRows[0].stripeSubscriptionId).toBe("sub_b");
    expect(h.state.notifications).toEqual([]); // no phantom "cancelled" alert
  });

  it("deleted event for the TRACKED sub still cancels the row (existing behavior)", async () => {
    const b = seedStripeSub({ id: "sub_b", created: T0, metadata: ADDON_META });
    seedAddOnRow({ stripeSubscriptionId: "sub_b" });

    await handleSubscriptionEvent(evt("customer.subscription.deleted", b));

    expect(h.state.addOnRows[0].status).toBe("cancelled");
    expect(h.state.notifications).toEqual([{ restaurantId: "r1", slug: "driver_pool", change: "cancelled" }]);
  });

  it("replacing a MONTHS-old sub cancels with prorated credit instead of a refund", async () => {
    seedStripeSub({ id: "sub_a", created: T0 - 60 * 86400, metadata: ADDON_META });
    seedAddOnRow({ stripeSubscriptionId: "sub_a" });
    const b = seedStripeSub({ id: "sub_b", created: T0, metadata: ADDON_META });

    await handleSubscriptionEvent(evt("customer.subscription.created", b));

    expect(h.state.cancelled).toEqual([
      { id: "sub_a", params: { prorate: true, invoice_now: true } },
    ]);
    expect(h.state.refunds).toEqual([]); // credit, not blanket refund
    expect(h.state.addOnRows[0].stripeSubscriptionId).toBe("sub_b");
  });

  it("a live sub is never killed by an INCOMPLETE duplicate, even a newer one", async () => {
    seedStripeSub({ id: "sub_a", created: T0, metadata: ADDON_META });
    seedAddOnRow({ stripeSubscriptionId: "sub_a" });
    const b = seedStripeSub({ id: "sub_b", created: T0 + 600, status: "incomplete", metadata: ADDON_META });

    await handleSubscriptionEvent(evt("customer.subscription.created", b));

    expect(h.state.cancelled).toEqual([{ id: "sub_b", params: {} }]); // the husk dies
    expect(h.state.addOnRows[0].stripeSubscriptionId).toBe("sub_a"); // paying sub survives
  });

  it("refund resolves the newer `payments` list invoice shape (Basil API)", async () => {
    seedStripeSub({
      id: "sub_a",
      created: T0,
      metadata: ADDON_META,
      invoice: {
        id: "in_sub_a",
        status: "paid",
        amount_paid: 1999,
        payments: { data: [{ status: "paid", payment: { type: "payment_intent", payment_intent: "pi_basil" } }] },
      },
    });
    seedAddOnRow({ stripeSubscriptionId: "sub_a" });
    const b = seedStripeSub({ id: "sub_b", created: T0 + 600, metadata: ADDON_META });

    await handleSubscriptionEvent(evt("customer.subscription.created", b));

    expect(h.state.refunds[0].params).toMatchObject({ payment_intent: "pi_basil", reason: "duplicate" });
  });

  it("unpaid duplicate ($0 promo / not yet charged) is cancelled but NOT refunded", async () => {
    seedStripeSub({
      id: "sub_a",
      created: T0,
      metadata: ADDON_META,
      invoice: { id: "in_sub_a", status: "paid", amount_paid: 0 },
    });
    seedAddOnRow({ stripeSubscriptionId: "sub_a" });
    const b = seedStripeSub({ id: "sub_b", created: T0 + 600, metadata: ADDON_META });

    await handleSubscriptionEvent(evt("customer.subscription.created", b));

    expect(h.state.cancelled).toEqual([{ id: "sub_a", params: {} }]);
    expect(h.state.refunds).toEqual([]);
  });

  it("STALE snapshot: an out-of-order 'active' event for a sub Stripe already cancelled must not kill the survivor", async () => {
    // Backend truth: sub_a live + tracked; sub_b already canceled (e.g. by an
    // earlier run of this very guard). The webhook snapshot for sub_b still
    // claims "active" (emitted before the cancel; Stripe delivers out of
    // order). Deciding from the snapshot would cancel + refund the PAYING sub.
    seedStripeSub({ id: "sub_a", created: T0, metadata: ADDON_META });
    seedAddOnRow({ stripeSubscriptionId: "sub_a" });
    const bBackend = seedStripeSub({ id: "sub_b", created: T0 + 600, status: "canceled", metadata: ADDON_META });
    const staleSnapshot = { ...bBackend, status: "active" };

    await handleSubscriptionEvent(evt("customer.subscription.updated", staleSnapshot));

    expect(h.state.cancelled).toEqual([]); // nobody dies on unverified state
    expect(h.state.refunds).toEqual([]);
    expect(h.state.addOnRows[0].stripeSubscriptionId).toBe("sub_a");
    expect(h.state.addOnRows[0].status).toBe("active");
  });

  it("a PAYING sub outranks a newer FAILING duplicate (past_due never wins on recency)", async () => {
    seedStripeSub({ id: "sub_a", created: T0, metadata: ADDON_META });
    seedAddOnRow({ stripeSubscriptionId: "sub_a" });
    const b = seedStripeSub({
      id: "sub_b",
      created: T0 + 600,
      status: "past_due",
      metadata: ADDON_META,
      invoice: { id: "in_sub_b", status: "open", amount_paid: 0 },
    });

    await handleSubscriptionEvent(evt("customer.subscription.updated", b));

    expect(h.state.cancelled).toEqual([{ id: "sub_b", params: {} }]); // failing dup dies
    expect(h.state.refunds).toEqual([]); // nothing paid to refund
    expect(h.state.addOnRows[0].stripeSubscriptionId).toBe("sub_a"); // paying sub survives
    expect(h.state.addOnRows[0].status).toBe("active");
  });

  it("mirror ordering: the older PAYING sub's event re-claims a row stamped with the failing newer sub", async () => {
    seedStripeSub({
      id: "sub_b",
      created: T0 + 600,
      status: "past_due",
      metadata: ADDON_META,
      invoice: { id: "in_sub_b", status: "open", amount_paid: 0 },
    });
    seedAddOnRow({ stripeSubscriptionId: "sub_b", status: "past_due" });
    const a = seedStripeSub({ id: "sub_a", created: T0, metadata: ADDON_META });

    await handleSubscriptionEvent(evt("customer.subscription.updated", a));

    // Same survivor as the other ordering — the rule is two-sided.
    expect(h.state.cancelled).toEqual([{ id: "sub_b", params: {} }]);
    expect(h.state.addOnRows[0].stripeSubscriptionId).toBe("sub_a");
    expect(h.state.addOnRows[0].status).toBe("active");
  });

  it("superseded-delete releases the shared dunning clock (health-checked) while leaving the row untouched", async () => {
    // The loser's failed invoice may have started the restaurant clock; its
    // deleted event is the only event that ever resolves that sub — the guard's
    // early-return must still offer to clear, or the clock is orphaned and a
    // healthy restaurant rides a phantom countdown into "features paused".
    seedStripeSub({ id: "sub_b", created: T0 + 600, metadata: ADDON_META });
    seedAddOnRow({ stripeSubscriptionId: "sub_b" });
    const a = seedStripeSub({ id: "sub_a", created: T0, status: "canceled", metadata: ADDON_META });

    await handleSubscriptionEvent(evt("customer.subscription.deleted", a));

    expect(h.state.addOnRows[0].status).toBe("active"); // row untouched
    expect(h.state.graceClears).toEqual(["r1"]); // clock offered for release
  });

  it("recovery (past_due → active) releases the restaurant clock via clearRestaurantGraceIfHealthy", async () => {
    const b = seedStripeSub({ id: "sub_b", created: T0, metadata: ADDON_META });
    seedAddOnRow({ stripeSubscriptionId: "sub_b", status: "past_due", graceEndsAt: new Date("2026-07-20") });

    await handleSubscriptionEvent(evt("customer.subscription.updated", b));

    expect(h.state.addOnRows[0].status).toBe("active");
    expect(h.state.addOnRows[0].graceEndsAt).toBeNull();
    expect(h.state.graceClears).toEqual(["r1"]);
  });

  it("deleted TRACKED add-on sub clears the row's own graceEndsAt too", async () => {
    const b = seedStripeSub({ id: "sub_b", created: T0, metadata: ADDON_META });
    seedAddOnRow({ stripeSubscriptionId: "sub_b", status: "past_due", graceEndsAt: new Date("2026-07-20") });

    await handleSubscriptionEvent(evt("customer.subscription.deleted", b));

    expect(h.state.addOnRows[0].status).toBe("cancelled");
    expect(h.state.addOnRows[0].graceEndsAt).toBeNull(); // dunning story over
    expect(h.state.graceClears).toEqual(["r1"]); // failing sub cancelled → clock released
  });
});

describe("platform-plan supersede", () => {
  it("duplicate plan sub: older cancelled + refunded, restaurant stamped with newer", async () => {
    seedStripeSub({ id: "sub_p1", created: T0 });
    h.state.restaurants[0].stripeSubscriptionId = "sub_p1";
    const p2 = seedStripeSub({ id: "sub_p2", created: T0 + 300 });

    await handleSubscriptionEvent(evt("customer.subscription.created", p2));

    expect(h.state.cancelled).toEqual([{ id: "sub_p1", params: {} }]);
    expect(h.state.refunds[0].params).toMatchObject({ payment_intent: "pi_sub_p1", reason: "duplicate" });
    expect(h.state.restaurants[0].stripeSubscriptionId).toBe("sub_p2");
    expect(h.state.restaurants[0].subscriptionStatus).toBe("active");
  });

  it("deleted event for the superseded plan sub leaves the restaurant untouched", async () => {
    seedStripeSub({ id: "sub_p2", created: T0 + 300 });
    h.state.restaurants[0].stripeSubscriptionId = "sub_p2";
    const p1 = seedStripeSub({ id: "sub_p1", created: T0, status: "canceled" });

    await handleSubscriptionEvent(evt("customer.subscription.deleted", p1));

    expect(h.state.restaurants[0].stripeSubscriptionId).toBe("sub_p2");
    expect(h.state.restaurants[0].subscriptionStatus).toBe("active");
  });

  it("deleted event for the TRACKED plan sub still cancels (existing behavior)", async () => {
    const p2 = seedStripeSub({ id: "sub_p2", created: T0 });
    h.state.restaurants[0].stripeSubscriptionId = "sub_p2";

    await handleSubscriptionEvent(evt("customer.subscription.deleted", p2));

    expect(h.state.restaurants[0].subscriptionStatus).toBe("cancelled");
    expect(h.state.restaurants[0].stripeSubscriptionId).toBeNull();
    // A plan cancelled while failing must end its dunning too — otherwise the
    // cron counts down to a false "features paused for non-payment" email.
    expect(h.state.graceClears).toEqual(["r1"]);
  });

  it("deleted event for the superseded plan sub still offers to release the dunning clock", async () => {
    seedStripeSub({ id: "sub_p2", created: T0 + 300 });
    h.state.restaurants[0].stripeSubscriptionId = "sub_p2";
    const p1 = seedStripeSub({ id: "sub_p1", created: T0, status: "canceled" });

    await handleSubscriptionEvent(evt("customer.subscription.deleted", p1));

    expect(h.state.restaurants[0].stripeSubscriptionId).toBe("sub_p2"); // untouched
    expect(h.state.graceClears).toEqual(["r1"]); // orphaned-clock release offered
  });
});

describe("reseller white-label supersede", () => {
  const WL_META = { whiteLabelTier: "full", resellerProfileId: "rp_1" };

  it("duplicate white-label sub: older cancelled + refunded, profile stamped with newer", async () => {
    seedStripeSub({ id: "sub_w1", created: T0, metadata: WL_META });
    h.state.resellers[0].whiteLabelStripeSubscriptionId = "sub_w1";
    h.state.resellers[0].whiteLabelStatus = "active";
    const w2 = seedStripeSub({ id: "sub_w2", created: T0 + 300, metadata: WL_META });

    await handleSubscriptionEvent(evt("customer.subscription.created", w2));

    expect(h.state.cancelled).toEqual([{ id: "sub_w1", params: {} }]);
    expect(h.state.refunds[0].params).toMatchObject({ payment_intent: "pi_sub_w1", reason: "duplicate" });
    expect(h.state.resellers[0].whiteLabelStripeSubscriptionId).toBe("sub_w2");
    expect(h.state.resellers[0].whiteLabelStatus).toBe("active");
  });

  it("deleted event for the superseded white-label sub leaves the profile untouched", async () => {
    seedStripeSub({ id: "sub_w2", created: T0 + 300, metadata: WL_META });
    h.state.resellers[0].whiteLabelStripeSubscriptionId = "sub_w2";
    h.state.resellers[0].whiteLabelStatus = "active";
    h.state.resellers[0].whiteLabelTier = "full";
    const w1 = seedStripeSub({ id: "sub_w1", created: T0, status: "canceled", metadata: WL_META });

    await handleSubscriptionEvent(evt("customer.subscription.deleted", w1));

    expect(h.state.resellers[0].whiteLabelStripeSubscriptionId).toBe("sub_w2");
    expect(h.state.resellers[0].whiteLabelStatus).toBe("active");
    expect(h.state.resellers[0].whiteLabelTier).toBe("full");
  });
});
