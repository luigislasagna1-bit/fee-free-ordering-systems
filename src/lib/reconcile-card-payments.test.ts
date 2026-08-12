/**
 * Card-payment reconciliation — the safety net for orders whose customer never
 * made it back from Stripe (Luigi 2026-08-11).
 *
 * Three behaviours have to hold, because each one maps to real damage we found
 * live at Luigi's store:
 *   RESCUE  — a paid order the browser never released must reach the kitchen.
 *   VOID    — a dead order must not keep holding money on the customer's card.
 *   FLAG    — a phantom "completed" order (the auto-complete bug) must be
 *             REPORTED, never auto-cancelled: the restaurant may have fed the
 *             customer anyway and still be owed for it.
 * Plus the one thing that must never happen: touching an order that was already
 * released to the kitchen.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => {
  const state = {
    orders: [] as any[],
    intents: {} as Record<string, any>,
    voided: [] as string[],
    released: [] as string[],
    releasedPromoUsage: [] as string[],
    syncedTotals: [] as string[],
    searchHits: {} as Record<string, string>, // orderId -> intent id
  };
  return { state };
});

/** Minimal Prisma `where` matcher — covers the operators this module uses. */
function matches(row: any, where: any): boolean {
  for (const [key, cond] of Object.entries(where ?? {})) {
    const v = row[key];
    if (cond === null) { if (v !== null && v !== undefined) return false; continue; }
    if (cond && typeof cond === "object" && !(cond instanceof Date)) {
      const c = cond as any;
      if ("in" in c && !c.in.includes(v)) return false;
      if ("not" in c) {
        if (c.not === null && (v === null || v === undefined)) return false;
        if (c.not !== null && v === c.not) return false;
      }
      if ("gte" in c && !(v && v.getTime() >= c.gte.getTime())) return false;
      if ("lte" in c && !(v && v.getTime() <= c.lte.getTime())) return false;
      continue;
    }
    if (v !== cond) return false;
  }
  return true;
}

vi.mock("@/lib/db", () => {
  const s = h.state;
  return {
    default: {
      order: {
        findMany: async ({ where, take }: any) => {
          const rows = s.orders.filter((o) => matches(o, where));
          return (take ? rows.slice(0, take) : rows).map((o) => ({ ...o }));
        },
        findUnique: async ({ where }: any) => {
          const o = s.orders.find((x) => x.id === where.id);
          return o ? { ...o } : null;
        },
        updateMany: async ({ where, data }: any) => {
          const rows = s.orders.filter((o) => matches(o, where));
          rows.forEach((o) => Object.assign(o, data));
          return { count: rows.length };
        },
      },
    },
  };
});

vi.mock("@/lib/stripe", () => ({
  getRestaurantStripe: async () => ({
    client: {
      paymentIntents: {
        // Copy, like the real SDK — a later cancel() must not retroactively
        // mutate an intent object the caller already read.
        retrieve: async (id: string) => ({ ...h.state.intents[id] }),
        search: async ({ query }: any) => {
          const m = /metadata\['orderId'\]:'([^']+)'/.exec(query);
          const hit = m ? h.state.searchHits[m[1]] : null;
          return { data: hit ? [{ id: hit }] : [] };
        },
      },
    },
  }),
  voidPayment: async ({ paymentIntentId }: any) => {
    h.state.voided.push(paymentIntentId);
    h.state.intents[paymentIntentId].status = "canceled";
    return { id: paymentIntentId, status: "canceled" };
  },
}));

// Stand in for the real release path — asserting we DELEGATE to it is the point;
// its own capture/notify/dispatch behaviour is covered by verify-order-payment.test.ts.
vi.mock("@/lib/stripe/verify-order-payment", () => ({
  verifyAndReleaseOrderPayment: async ({ orderId, paymentIntentId }: any) => {
    const o = h.state.orders.find((x) => x.id === orderId);
    const intent = h.state.intents[paymentIntentId];
    if (!o || !intent) return null;
    if (o.status === "cancelled" || o.status === "rejected") return o.paymentStatus; // dead-order guard
    if (intent.metadata?.orderId !== o.id) return o.paymentStatus;
    if (intent.status === "requires_capture" || intent.status === "succeeded") {
      o.paymentStatus = "paid";
      o.notifiedAt = new Date();
      h.state.released.push(orderId);
      return "paid";
    }
    return o.paymentStatus;
  },
}));

vi.mock("@/lib/coupon-ledger", () => ({ releaseCouponsForOrder: async () => {} }));
vi.mock("@/lib/reward-ledger", () => ({ releaseForOrder: async () => {} }));
vi.mock("@/lib/promo-usage", () => ({
  releasePromotionUsageForOrder: async (id: string) => { h.state.releasedPromoUsage.push(id); },
}));
vi.mock("@/lib/customer-totals", () => ({
  syncCustomerTotalsForOrder: async (id: string) => { h.state.syncedTotals.push(id); },
}));
vi.mock("@/lib/marketplace", () => ({ unrecordMarketplaceOrder: async () => {} }));
vi.mock("@/lib/marketing-studio", () => ({ unrecordSmartLinkOrder: async () => {} }));

import { reconcileCardPayments } from "./reconcile-card-payments";

const NOW = new Date("2026-08-11T21:00:00.000Z");
/** Old enough to clear MIN_AGE_MS, recent enough for every window. */
const TEN_MIN_AGO = new Date(NOW.getTime() - 10 * 60_000);

function order(over: Partial<any> = {}) {
  return {
    id: "o1", orderNumber: "ORD-1", restaurantId: "r1", paymentMethod: "card",
    status: "accepted", paymentStatus: "pending", notifiedAt: null, paymentIntentId: null,
    createdAt: TEN_MIN_AGO, total: 36.44, customerName: "Sharon", customerEmail: "s@x.com",
    viaMarketplace: false, marketplaceCounterApplied: false, smartLinkCounterApplied: false,
    completedAt: null, ...over,
  };
}

beforeEach(() => {
  h.state.orders = [];
  h.state.intents = {};
  h.state.voided = [];
  h.state.released = [];
  h.state.releasedPromoUsage = [];
  h.state.syncedTotals = [];
  h.state.searchHits = {};
});

describe("RESCUE — the customer paid but their browser never released the order", () => {
  it("releases an auto-accepted card order whose authorization is live", async () => {
    h.state.orders = [order({ paymentIntentId: "pi_1" })];
    h.state.intents = { pi_1: { id: "pi_1", status: "requires_capture", metadata: { orderId: "o1" }, amount: 3644, currency: "cad" } };

    const r = await reconcileCardPayments({ now: NOW });

    expect(r.rescued).toBe(1);
    expect(h.state.released).toEqual(["o1"]);
    expect(h.state.orders[0].notifiedAt).toBeInstanceOf(Date);
  });

  it("recovers the intent id for a legacy order that never stored one", async () => {
    // Every stranded order we found live had paymentIntentId NULL, because the
    // create route wasn't persisting it — so the search fallback is the only
    // way those get rescued.
    h.state.orders = [order()];
    h.state.searchHits = { o1: "pi_legacy" };
    h.state.intents = { pi_legacy: { id: "pi_legacy", status: "requires_capture", metadata: { orderId: "o1" }, amount: 3644, currency: "cad" } };

    const r = await reconcileCardPayments({ now: NOW });

    expect(r.intentsRecovered).toBe(1);
    expect(r.rescued).toBe(1);
    expect(h.state.orders[0].paymentIntentId).toBe("pi_legacy");
  });

  it("leaves an order alone when the customer never reached the card form", async () => {
    h.state.orders = [order()]; // no stored intent, no search hit
    const r = await reconcileCardPayments({ now: NOW });
    expect(r.rescued).toBe(0);
    expect(h.state.orders[0].notifiedAt).toBeNull();
  });

  it("never touches an order the kitchen already has", async () => {
    h.state.orders = [order({ notifiedAt: new Date(), paymentStatus: "paid", paymentIntentId: "pi_1" })];
    const r = await reconcileCardPayments({ now: NOW });
    expect(r.scannedRescue).toBe(0);
    expect(h.state.voided).toEqual([]);
  });

  it("ignores an order too young to have finished paying", async () => {
    h.state.orders = [order({ createdAt: new Date(NOW.getTime() - 5_000), paymentIntentId: "pi_1" })];
    h.state.intents = { pi_1: { id: "pi_1", status: "requires_capture", metadata: { orderId: "o1" } } };
    const r = await reconcileCardPayments({ now: NOW });
    expect(r.scannedRescue).toBe(0);
  });
});

describe("VOID — a dead order must not keep holding the customer's money", () => {
  it("cancels a live authorization on an abandoned-then-cancelled order", async () => {
    h.state.orders = [order({ status: "cancelled", paymentIntentId: "pi_2" })];
    h.state.intents = { pi_2: { id: "pi_2", status: "requires_capture", metadata: { orderId: "o1" }, amount: 3644, currency: "cad" } };

    const r = await reconcileCardPayments({ now: NOW });

    expect(r.voided).toBe(1);
    expect(h.state.voided).toEqual(["pi_2"]);
    expect(h.state.orders[0].paymentStatus).toBe("voided");
  });

  it("refuses to guess when a cancelled order was actually captured", async () => {
    h.state.orders = [order({ status: "cancelled", paymentIntentId: "pi_3" })];
    h.state.intents = { pi_3: { id: "pi_3", status: "succeeded", metadata: { orderId: "o1" }, amount: 3644, amount_received: 3644, currency: "cad" } };

    const r = await reconcileCardPayments({ now: NOW });

    expect(h.state.voided).toEqual([]);
    expect(r.errors[0].reason).toMatch(/manual refund/i);
    expect(h.state.orders[0].paymentStatus).toBe("pending"); // untouched for a human
  });

  it("ignores an intent that doesn't belong to the order", async () => {
    h.state.orders = [order({ status: "cancelled", paymentIntentId: "pi_4" })];
    h.state.intents = { pi_4: { id: "pi_4", status: "requires_capture", metadata: { orderId: "SOMEONE_ELSE" } } };
    await reconcileCardPayments({ now: NOW });
    expect(h.state.voided).toEqual([]);
  });
});

describe("FLAG — phantom 'completed' orders from the auto-complete bug", () => {
  it("reports an unpaid phantom order without touching it", async () => {
    // Exactly Sharon Craven's row: auto-accepted, never released, never paid,
    // flipped to completed 20 min later. Luigi's store served her anyway when
    // she walked in, so cancelling it or clawing back her promo would destroy a
    // real fulfilled order. Report it; let staff decide.
    h.state.orders = [order({ status: "completed", completedAt: new Date(), orderNumber: "ORD-710341102" })];

    const r = await reconcileCardPayments({ now: NOW });

    expect(r.scannedRepair).toBe(1);
    expect(r.unpaidNeedingAttention).toEqual([
      expect.objectContaining({ orderId: "o1", orderNumber: "ORD-710341102", total: 36.44 }),
    ]);
    const o = h.state.orders[0];
    expect(o.status).toBe("completed");        // untouched
    expect(o.paymentStatus).toBe("pending");   // untouched
    expect(h.state.voided).toEqual([]);        // no money moved
    expect(h.state.releasedPromoUsage).toEqual([]); // promo NOT clawed back
  });

  it("never flags a genuinely completed order", async () => {
    h.state.orders = [order({ status: "completed", notifiedAt: new Date(), paymentStatus: "paid" })];
    const r = await reconcileCardPayments({ now: NOW });
    expect(r.scannedRepair).toBe(0);
    expect(r.unpaidNeedingAttention).toEqual([]);
  });
});

describe("a dead order is never captured, released or re-logged", () => {
  it("does not release an order cancelled between the batch read and the release", async () => {
    // The reconciler reads a batch, then the 30-minute abandoned sweep cancels
    // one of them a moment later. Without the guard inside
    // verifyAndReleaseOrderPayment we would capture the card and send a
    // cancelled order to the kitchen. Caught in adversarial review.
    h.state.orders = [order({ status: "cancelled", paymentIntentId: "pi_race" })];
    h.state.intents = { pi_race: { id: "pi_race", status: "requires_capture", metadata: { orderId: "o1" }, amount: 3644, currency: "cad" } };

    const r = await reconcileCardPayments({ now: NOW });

    expect(r.rescued).toBe(0);
    expect(h.state.released).toEqual([]);
    expect(h.state.orders[0].notifiedAt).toBeNull();
    // ...and the hold it was carrying gets released instead.
    expect(h.state.voided).toEqual(["pi_race"]);
  });

  it("reports phantom orders without writing customer PII to the logs", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    h.state.orders = [order({ status: "completed", orderNumber: "ORD-710341102", customerEmail: "sharoncraven@bell.net" })];

    await reconcileCardPayments({ now: NOW });

    const logged = warn.mock.calls.map((c) => c.join(" ")).join(" | ");
    expect(logged).toContain("ORD-710341102");
    expect(logged).not.toContain("sharoncraven@bell.net");
    expect(logged).not.toContain("Sharon");
    warn.mockRestore();
  });
});
