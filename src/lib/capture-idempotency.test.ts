import { describe, it, expect } from "vitest";
import { isStripeAlreadyCaptured, isPaypalAlreadyCaptured } from "./capture-idempotency";

// These predicates gate whether a capture error is treated as SUCCESS ("money
// already moved") vs a real failure. The dangerous mistake is a false positive:
// swallowing a genuine decline/expiry would mark an unpaid order "paid". These
// tests lock the boundary — especially that real failures return false.

describe("isStripeAlreadyCaptured", () => {
  const err = (over: Record<string, unknown>) => Object.assign(new Error(String(over.message ?? "")), over);

  it("true when Stripe reports the intent already captured", () => {
    expect(isStripeAlreadyCaptured(err({ message: "This PaymentIntent has already been captured.", code: "payment_intent_unexpected_state" }))).toBe(true);
  });
  it("true when the intent status is succeeded (already captured)", () => {
    expect(isStripeAlreadyCaptured(err({ message: "unexpected state", code: "payment_intent_unexpected_state", raw: { payment_intent: { status: "succeeded" } } }))).toBe(true);
  });
  it("true when the intent status is canceled (auth released)", () => {
    expect(isStripeAlreadyCaptured(err({ message: "unexpected state", code: "payment_intent_unexpected_state", raw: { payment_intent: { status: "canceled" } } }))).toBe(true);
  });
  it("FALSE for a real card decline at capture (must not be swallowed)", () => {
    expect(isStripeAlreadyCaptured(err({ message: "Your card was declined.", code: "card_declined" }))).toBe(false);
  });
  it("FALSE for the unexpected_state code without an already/settled signal", () => {
    expect(isStripeAlreadyCaptured(err({ message: "requires_payment_method", code: "payment_intent_unexpected_state", raw: { payment_intent: { status: "requires_payment_method" } } }))).toBe(false);
  });
  it("FALSE for a bare network error", () => {
    expect(isStripeAlreadyCaptured(new Error("network timeout"))).toBe(false);
  });
});

describe("isPaypalAlreadyCaptured", () => {
  it("true for AUTHORIZATION_ALREADY_CAPTURED", () => {
    expect(isPaypalAlreadyCaptured(new Error("AUTHORIZATION_ALREADY_CAPTURED: ..."))).toBe(true);
  });
  it("true for 'already been captured'", () => {
    expect(isPaypalAlreadyCaptured(new Error("This authorization has already been captured"))).toBe(true);
  });
  it("true for AUTH_CAPTURE_NOT_ALLOWED", () => {
    expect(isPaypalAlreadyCaptured(new Error("AUTH_CAPTURE_NOT_ALLOWED"))).toBe(true);
  });
  it("FALSE for a real funding decline (INSTRUMENT_DECLINED)", () => {
    expect(isPaypalAlreadyCaptured(new Error("INSTRUMENT_DECLINED: The funding instrument was declined"))).toBe(false);
  });
  it("FALSE for an expired authorization", () => {
    expect(isPaypalAlreadyCaptured(new Error("AUTHORIZATION_EXPIRED"))).toBe(false);
  });
});
