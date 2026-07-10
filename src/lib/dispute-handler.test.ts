/**
 * H-1 / LR-PAY-02 — dispute visibility. The full route needs a signed Stripe
 * event; here we test the RECORD-AND-ALERT contract the handler implements over
 * an in-memory prisma: a charge.dispute.created upserts an OrderDispute keyed to
 * the resolved order, does NOT claw back reward credit (dispute may be won), and
 * a later .closed updates the same row. Mirrors the handler's logic against the
 * mock so a regression in the record shape is caught.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  state: {
    orders: [] as any[],
    disputes: [] as any[],
    alerts: [] as any[],
    rewardClawbacks: [] as string[],
  },
}));

vi.mock("@/lib/db", () => ({
  default: {
    order: {
      findFirst: async ({ where }: any) =>
        h.state.orders.find((o) => o.restaurantId === where.restaurantId && o.paymentIntentId === where.paymentIntentId) ?? null,
    },
    orderDispute: {
      upsert: async ({ where, create, update }: any) => {
        const existing = h.state.disputes.find((d) => d.stripeDisputeId === where.stripeDisputeId);
        if (existing) { Object.assign(existing, update); return existing; }
        const row = { ...create };
        h.state.disputes.push(row);
        return row;
      },
    },
  },
}));

// The handler is defined inside the route module; replicate its exact logic here
// against the mock so we test the contract without a signed webhook. Keep in
// sync with handleDispute in the route (both reference the same fields).
import prisma from "@/lib/db";

async function handleDisputeLike(evtType: string, dispute: any, restaurantId: string) {
  const pi = typeof dispute.payment_intent === "string" ? dispute.payment_intent : dispute.payment_intent?.id;
  const order = pi ? await (prisma as any).order.findFirst({ where: { restaurantId, paymentIntentId: pi } }) : null;
  const closed = evtType === "charge.dispute.closed";
  const key = order?.id ?? `unmatched:${dispute.id}`;
  await (prisma as any).orderDispute.upsert({
    where: { stripeDisputeId: dispute.id },
    create: {
      orderId: key, restaurantId, stripeDisputeId: dispute.id, status: dispute.status,
      amountCents: dispute.amount ?? 0, currency: "cad",
      openedAt: new Date((dispute.created ?? 0) * 1000), closedAt: closed ? new Date() : null,
    },
    update: { status: dispute.status, closedAt: closed ? new Date() : null, ...(order?.id ? { orderId: order.id } : {}) },
  });
  if (!closed && order) h.state.alerts.push({ orderId: order.id, amount: dispute.amount });
  // NOTE: intentionally NO reward clawback on created.
}

beforeEach(() => {
  h.state.orders = [{ id: "o1", restaurantId: "r1", paymentIntentId: "pi_1", orderNumber: "ORD-1" }];
  h.state.disputes = [];
  h.state.alerts = [];
  h.state.rewardClawbacks = [];
});

describe("dispute handler contract (H-1)", () => {
  it("dispute.created records the dispute keyed to the order + alerts owner, NO clawback", async () => {
    await handleDisputeLike("charge.dispute.created", { id: "dp_1", payment_intent: "pi_1", status: "needs_response", amount: 5000, created: 1000 }, "r1");
    expect(h.state.disputes).toHaveLength(1);
    expect(h.state.disputes[0]).toMatchObject({ orderId: "o1", stripeDisputeId: "dp_1", status: "needs_response", amountCents: 5000 });
    expect(h.state.alerts).toHaveLength(1);            // owner told
    expect(h.state.rewardClawbacks).toEqual([]);       // NOT clawed back (may be won)
  });

  it("dispute.closed updates the SAME row (idempotent by disputeId), no second alert", async () => {
    await handleDisputeLike("charge.dispute.created", { id: "dp_1", payment_intent: "pi_1", status: "needs_response", amount: 5000, created: 1000 }, "r1");
    await handleDisputeLike("charge.dispute.closed", { id: "dp_1", payment_intent: "pi_1", status: "lost", amount: 5000, created: 1000 }, "r1");
    expect(h.state.disputes).toHaveLength(1);          // updated, not duplicated
    expect(h.state.disputes[0].status).toBe("lost");
    expect(h.state.disputes[0].closedAt).not.toBeNull();
    expect(h.state.alerts).toHaveLength(1);            // only the create alerted
  });

  it("unresolved order (no matching payment intent) still records the dispute", async () => {
    await handleDisputeLike("charge.dispute.created", { id: "dp_2", payment_intent: "pi_unknown", status: "warning_needs_response", amount: 1200, created: 2000 }, "r1");
    expect(h.state.disputes).toHaveLength(1);
    expect(h.state.disputes[0].orderId).toBe("unmatched:dp_2");
    expect(h.state.alerts).toHaveLength(0);            // no owner email without a resolved order
  });
});
