/**
 * LR-PAY-01 — auto-accepted card orders must be CAPTURED, not just authorized.
 *
 * Under the key-only model the platform webhook never fires, so
 * verifyAndReleaseOrderPayment (run on the confirmation page + status poll) is
 * the only place a card payment advances. Before the fix, its requires_capture
 * branch set paymentStatus='authorized' and released the order to the kitchen
 * but never captured — so an AUTO-ACCEPT restaurant (order created already
 * status='accepted') would make + deliver the food and never collect the money
 * (the hold expires in ~7 days). These tests drive the function over an
 * in-memory prisma + a fake restaurant Stripe client.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => {
  const state = {
    orders: [] as any[],
    intents: {} as Record<string, { status: string; metadata: { orderId: string } }>,
    captures: [] as string[],       // intent ids we called capture on
    notified: [] as string[],       // order ids fireOrderNotifications ran for
    captureThrows: null as null | (() => never),
  };
  return { state };
});

vi.mock("@/lib/db", () => {
  const s = h.state;
  return {
    default: {
      order: {
        findUnique: async ({ where }: any) => s.orders.find((o) => o.id === where.id) ?? null,
        update: async ({ where, data }: any) => {
          const o = s.orders.find((x) => x.id === where.id);
          Object.assign(o, data);
          return o;
        },
      },
    },
  };
});

vi.mock("@/lib/stripe", () => ({
  getRestaurantStripe: async () => ({
    client: {
      paymentIntents: {
        retrieve: async (id: string) => ({ id, ...h.state.intents[id] }),
      },
    },
  }),
  capturePayment: async ({ paymentIntentId }: any) => {
    if (h.state.captureThrows) h.state.captureThrows();
    h.state.captures.push(paymentIntentId);
    h.state.intents[paymentIntentId].status = "succeeded";
    return { id: paymentIntentId, status: "succeeded" };
  },
}));

vi.mock("@/lib/order-notifications", () => ({
  fireOrderNotifications: async (orderId: string) => { h.state.notified.push(orderId); },
}));

import { verifyAndReleaseOrderPayment } from "@/lib/stripe/verify-order-payment";
import { isStripeAlreadyCaptured } from "@/lib/capture-idempotency";

beforeEach(() => {
  h.state.orders = [];
  h.state.intents = {};
  h.state.captures = [];
  h.state.notified = [];
  h.state.captureThrows = null;
});

function seedOrder(o: Partial<any>) {
  const order = {
    id: "o1", restaurantId: "r1", status: "pending", paymentMethod: "card",
    paymentStatus: "pending", paymentIntentId: "pi_1", ...o,
  };
  h.state.orders.push(order);
  h.state.intents[order.paymentIntentId] = { status: "requires_capture", metadata: { orderId: order.id } };
  return order;
}

describe("verifyAndReleaseOrderPayment — auto-accept capture (LR-PAY-01)", () => {
  it("AUTO-ACCEPT: accepted + requires_capture → CAPTURES and marks paid", async () => {
    const o = seedOrder({ status: "accepted" });
    const result = await verifyAndReleaseOrderPayment({ orderId: o.id });
    expect(result).toBe("paid");
    expect(h.state.captures).toEqual(["pi_1"]);       // capture happened
    expect(o.paymentStatus).toBe("paid");
    expect(h.state.notified).toContain(o.id);          // still released to kitchen
  });

  it("NORMAL: pending + requires_capture → authorizes but does NOT capture", async () => {
    const o = seedOrder({ status: "pending" });
    const result = await verifyAndReleaseOrderPayment({ orderId: o.id });
    expect(result).toBe("authorized");
    expect(h.state.captures).toEqual([]);              // capture waits for Accept PATCH
    expect(o.paymentStatus).toBe("authorized");
    expect(h.state.notified).toContain(o.id);
  });

  it("RETRY: accepted + already authorized (first capture failed earlier) → re-attempts capture", async () => {
    const o = seedOrder({ status: "accepted", paymentStatus: "authorized" });
    const result = await verifyAndReleaseOrderPayment({ orderId: o.id });
    expect(result).toBe("paid");
    expect(h.state.captures).toEqual(["pi_1"]);
  });

  it("NORMAL authorized order early-returns without a Stripe round-trip", async () => {
    const o = seedOrder({ status: "pending", paymentStatus: "authorized" });
    const result = await verifyAndReleaseOrderPayment({ orderId: o.id });
    expect(result).toBe("authorized");
    expect(h.state.captures).toEqual([]);
  });

  it("capture FAILURE (real decline) leaves order authorized + released, does not mark paid", async () => {
    const o = seedOrder({ status: "accepted" });
    h.state.captureThrows = () => { throw Object.assign(new Error("card declined"), { code: "card_declined" }); };
    const result = await verifyAndReleaseOrderPayment({ orderId: o.id });
    expect(result).toBe("authorized");
    expect(o.paymentStatus).toBe("authorized");
    expect(h.state.notified).toContain(o.id);          // kitchen still sees it
  });

  it("capture 'already captured' race is treated as paid", async () => {
    const o = seedOrder({ status: "accepted" });
    h.state.captureThrows = () => {
      throw Object.assign(new Error("PaymentIntent already captured"), { code: "payment_intent_unexpected_state" });
    };
    // sanity: the predicate the code relies on (real Stripe errors are Error instances)
    expect(isStripeAlreadyCaptured(Object.assign(new Error("already captured"), { code: "payment_intent_unexpected_state" }))).toBe(true);
    const result = await verifyAndReleaseOrderPayment({ orderId: o.id });
    expect(result).toBe("paid");
    expect(o.paymentStatus).toBe("paid");
  });

  it("terminal states (paid/refunded/voided) short-circuit", async () => {
    for (const st of ["paid", "refunded", "voided"]) {
      h.state.orders = []; h.state.captures = [];
      const o = seedOrder({ status: "accepted", paymentStatus: st });
      const result = await verifyAndReleaseOrderPayment({ orderId: o.id });
      expect(result).toBe(st);
      expect(h.state.captures).toEqual([]);
    }
  });
});
