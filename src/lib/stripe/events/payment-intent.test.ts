/**
 * Wiring tests for the auto-accept capture-on-authorize path (Luigi
 * 2026-08-10). The 3-day ShipDay outage was a missed WIRE, not missed logic:
 * this handler captured the money for auto-accepted orders but never
 * dispatched the courier. These tests lock the wire so it cannot silently
 * disappear again:
 *   - accepted + authorize event => capture AND dispatchAcceptedOrderSafe
 *   - pending order => neither (kitchen Accept is the trigger there)
 *   - replayed event on a paid order => no second capture, no dispatch
 *   - succeeded event => NO dispatch (it would race the kitchen-accept
 *     after() dispatch and double-create ShipDay orders — deliberate)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

const { prismaMock, capturePaymentMock, dispatchMock, fireNotificationsMock, isAlreadyCapturedMock } = vi.hoisted(() => ({
  prismaMock: {
    order: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) },
  },
  capturePaymentMock: vi.fn(),
  dispatchMock: vi.fn().mockResolvedValue(undefined),
  fireNotificationsMock: vi.fn().mockResolvedValue(undefined),
  isAlreadyCapturedMock: vi.fn().mockReturnValue(false),
}));
vi.mock("@/lib/db", () => ({ default: prismaMock }));
vi.mock("@/lib/stripe", () => ({ capturePayment: capturePaymentMock }));
vi.mock("@/lib/order-notifications", () => ({ fireOrderNotifications: fireNotificationsMock }));
vi.mock("@/lib/capture-idempotency", () => ({ isStripeAlreadyCaptured: isAlreadyCapturedMock }));
vi.mock("@/lib/delivery-dispatch", () => ({ dispatchAcceptedOrderSafe: dispatchMock }));

import { handlePaymentIntentEvent } from "./payment-intent";

function makeEvent(type: string, orderId = "o1"): Stripe.Event {
  return {
    type,
    data: { object: { id: "pi_1", metadata: { orderId } } },
  } as unknown as Stripe.Event;
}

const baseOrder = (over: Record<string, unknown> = {}) => ({
  id: "o1",
  paymentStatus: "pending",
  notifiedAt: null,
  status: "pending",
  restaurantId: "r1",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.order.update.mockResolvedValue({});
  dispatchMock.mockResolvedValue(undefined);
  fireNotificationsMock.mockResolvedValue(undefined);
  isAlreadyCapturedMock.mockReturnValue(false);
  capturePaymentMock.mockResolvedValue({});
});

describe("payment_intent.amount_capturable_updated — auto-accept capture + dispatch wiring", () => {
  it("AUTO-ACCEPTED order: captures AND dispatches (the wire the 2026-08 outage was missing)", async () => {
    prismaMock.order.findUnique.mockResolvedValue(baseOrder({ status: "accepted" }));
    await handlePaymentIntentEvent(makeEvent("payment_intent.amount_capturable_updated"));
    expect(capturePaymentMock).toHaveBeenCalledWith({ paymentIntentId: "pi_1", restaurantId: "r1" });
    expect(dispatchMock).toHaveBeenCalledWith("o1");
    expect(fireNotificationsMock).toHaveBeenCalledWith("o1");
  });

  it("PENDING order (manual-accept restaurant): releases to kitchen, does NOT capture or dispatch", async () => {
    prismaMock.order.findUnique.mockResolvedValue(baseOrder({ status: "pending" }));
    await handlePaymentIntentEvent(makeEvent("payment_intent.amount_capturable_updated"));
    expect(capturePaymentMock).not.toHaveBeenCalled();
    expect(dispatchMock).not.toHaveBeenCalled();
    expect(fireNotificationsMock).toHaveBeenCalledWith("o1"); // kitchen release still happens
  });

  it("replayed event on an already-paid order: no second capture, no dispatch", async () => {
    prismaMock.order.findUnique.mockResolvedValue(baseOrder({ status: "accepted", paymentStatus: "paid" }));
    await handlePaymentIntentEvent(makeEvent("payment_intent.amount_capturable_updated"));
    expect(capturePaymentMock).not.toHaveBeenCalled();
    expect(dispatchMock).not.toHaveBeenCalled();
    expect(prismaMock.order.update).not.toHaveBeenCalled();
  });

  it("capture FAILURE still calls the dispatch wrapper (its prepaid guard makes it a safe no-op)", async () => {
    prismaMock.order.findUnique.mockResolvedValue(baseOrder({ status: "accepted" }));
    capturePaymentMock.mockRejectedValue(new Error("card issuer says no"));
    await handlePaymentIntentEvent(makeEvent("payment_intent.amount_capturable_updated"));
    expect(dispatchMock).toHaveBeenCalledWith("o1"); // wire intact even on failure paths
    expect(fireNotificationsMock).toHaveBeenCalledWith("o1"); // release never blocked by capture failure
  });
});

describe("payment_intent.succeeded — deliberately NOT a dispatch trigger", () => {
  it("never dispatches (would race the kitchen-accept after() dispatch => duplicate ShipDay orders)", async () => {
    prismaMock.order.findUnique.mockResolvedValue(baseOrder({ status: "accepted", paymentStatus: "authorized" }));
    await handlePaymentIntentEvent(makeEvent("payment_intent.succeeded"));
    expect(dispatchMock).not.toHaveBeenCalled();
    expect(fireNotificationsMock).toHaveBeenCalledWith("o1");
  });
});
