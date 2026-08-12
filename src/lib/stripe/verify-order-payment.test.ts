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
    dispatched: [] as string[],     // order ids dispatchAcceptedOrderSafe ran for
    captureThrows: null as null | (() => never),
  };
  return { state };
});

// after() would throw outside a real request scope — run the deferred work
// inline so the dispatch calls are observable.
vi.mock("next/server", () => ({ after: (p: unknown) => p }));
vi.mock("@/lib/delivery-dispatch", () => ({
  dispatchAcceptedOrderSafe: async (orderId: string) => { h.state.dispatched.push(orderId); },
}));

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
  h.state.dispatched = [];
  h.state.captureThrows = null;
});

function seedOrder(o: Partial<any>) {
  const order = {
    id: "o1", restaurantId: "r1", status: "pending", paymentMethod: "card",
    paymentStatus: "pending", paymentIntentId: "pi_1", notifiedAt: null, ...o,
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

  // A "completed" card order with notifiedAt null is a phantom left by the
  // auto-complete bug. The confirmation page keeps it payable on purpose so the
  // restaurant can still collect for food it may well have served — but every
  // capture site gated on status === "accepted", so paying one placed a hold
  // nothing would ever capture. It expired after ~7 days and the restaurant was
  // paid nothing, silently. Adversarial review, 2026-08-12.
  it("PHANTOM: completed + requires_capture → CAPTURES the money", async () => {
    const o = seedOrder({ status: "completed" });
    const result = await verifyAndReleaseOrderPayment({ orderId: o.id });
    expect(result).toBe("paid");
    expect(h.state.captures).toEqual(["pi_1"]);
    expect(o.paymentStatus).toBe("paid");
  });

  it("PHANTOM: completed order is never re-sent to the kitchen", async () => {
    // The food was made and handed over days ago. Collecting the money is
    // right; printing a fresh ticket is how a restaurant cooks it twice.
    const o = seedOrder({ status: "completed" });
    await verifyAndReleaseOrderPayment({ orderId: o.id });
    expect(h.state.notified).not.toContain(o.id);
    expect(h.state.dispatched).not.toContain(o.id);
  });

  it("PHANTOM: an already-paid completed order is not released either", async () => {
    // The self-heal path releases anything paid-but-unreleased; a phantom must
    // be exempt or the reconcile sweep would print old tickets in a loop.
    const o = seedOrder({ status: "completed", paymentStatus: "paid" });
    await verifyAndReleaseOrderPayment({ orderId: o.id });
    expect(h.state.notified).not.toContain(o.id);
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

describe("verifyAndReleaseOrderPayment — auto-accept delivery dispatch (the 2026-08-10 missed wire)", () => {
  it("AUTO-ACCEPT capture → dispatches the courier (key-only model: this is THE payment moment)", async () => {
    const o = seedOrder({ status: "accepted" });
    await verifyAndReleaseOrderPayment({ orderId: o.id });
    expect(h.state.dispatched).toEqual([o.id]);
  });

  it("'already captured' race → still dispatches", async () => {
    const o = seedOrder({ status: "accepted" });
    h.state.captureThrows = () => {
      throw Object.assign(new Error("PaymentIntent already captured"), { code: "payment_intent_unexpected_state" });
    };
    await verifyAndReleaseOrderPayment({ orderId: o.id });
    expect(h.state.dispatched).toEqual([o.id]);
  });

  it("NORMAL pending order → NO dispatch (kitchen Accept is that trigger)", async () => {
    const o = seedOrder({ status: "pending" });
    await verifyAndReleaseOrderPayment({ orderId: o.id });
    expect(h.state.dispatched).toEqual([]);
  });

  it("capture FAILURE → NO dispatch (order not prepaid yet; later retry dispatches)", async () => {
    const o = seedOrder({ status: "accepted" });
    h.state.captureThrows = () => { throw Object.assign(new Error("card declined"), { code: "card_declined" }); };
    await verifyAndReleaseOrderPayment({ orderId: o.id });
    expect(h.state.dispatched).toEqual([]);
  });

  it("intent already 'succeeded' + order accepted → dispatches; pending → does not", async () => {
    const a = seedOrder({ id: "oA", status: "accepted", paymentIntentId: "pi_A" });
    h.state.intents["pi_A"].status = "succeeded";
    await verifyAndReleaseOrderPayment({ orderId: a.id });
    expect(h.state.dispatched).toEqual(["oA"]);

    const b = seedOrder({ id: "oB", status: "pending", paymentIntentId: "pi_B" });
    h.state.intents["pi_B"].status = "succeeded";
    await verifyAndReleaseOrderPayment({ orderId: b.id });
    expect(h.state.dispatched).toEqual(["oA"]); // unchanged — oB not dispatched
  });
});

describe("SELF-HEAL — payment settled but the order was never released", () => {
  // Both branches below set paymentStatus BEFORE calling fireOrderNotifications.
  // If anything kills the process in between (lambda timeout, throw inside the
  // fan-out, deploy mid-request) the order is paid with notifiedAt still null —
  // and every later call used to hit a terminal early-return and give up, so the
  // kitchen never learned about food the customer had paid for. Luigi 2026-08-11.
  it("releases a PAID order that never reached the kitchen", async () => {
    const o = seedOrder({ status: "accepted", paymentStatus: "paid", notifiedAt: null });
    const result = await verifyAndReleaseOrderPayment({ orderId: o.id });
    expect(result).toBe("paid");
    expect(h.state.notified).toContain(o.id);
    expect(h.state.dispatched).toContain(o.id); // courier not forgotten either
  });

  it("releases an AUTHORIZED manual-accept order that never reached the kitchen", async () => {
    // status "pending" hits the `authorized && status !== accepted` early return.
    const o = seedOrder({ status: "pending", paymentStatus: "authorized", notifiedAt: null });
    const result = await verifyAndReleaseOrderPayment({ orderId: o.id });
    expect(result).toBe("authorized");
    expect(h.state.notified).toContain(o.id);
  });

  it("does NOT re-notify an order the kitchen already has", async () => {
    const o = seedOrder({ status: "accepted", paymentStatus: "paid", notifiedAt: new Date() });
    await verifyAndReleaseOrderPayment({ orderId: o.id });
    expect(h.state.notified).toEqual([]);
  });

  it("never releases a refunded or voided order", async () => {
    for (const st of ["refunded", "voided"]) {
      h.state.orders = []; h.state.notified = [];
      const o = seedOrder({ id: `o_${st}`, status: "accepted", paymentStatus: st, notifiedAt: null });
      await verifyAndReleaseOrderPayment({ orderId: o.id });
      expect(h.state.notified).toEqual([]);
    }
  });
});
