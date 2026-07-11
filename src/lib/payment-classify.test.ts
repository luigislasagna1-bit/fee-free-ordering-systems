import { describe, it, expect } from "vitest";
import { isOnlineCapturedPayment } from "./payment-classify";

describe("isOnlineCapturedPayment (EOD online/offline split)", () => {
  it("paid card and paid PayPal are ONLINE (PayPal was misclassified as offline until 2026-07-11)", () => {
    expect(isOnlineCapturedPayment("card", "paid")).toBe(true);
    expect(isOnlineCapturedPayment("paypal", "paid")).toBe(true);
  });

  it("a fully store-credit-paid order is ONLINE (nothing to collect at the counter)", () => {
    expect(isOnlineCapturedPayment("reward_credit", "paid")).toBe(true);
  });

  it("cash and card-at-handoff are OFFLINE till money", () => {
    expect(isOnlineCapturedPayment("cash", "paid")).toBe(false);
    expect(isOnlineCapturedPayment("cash", "pending")).toBe(false);
    expect(isOnlineCapturedPayment("card_in_person", "paid")).toBe(false);
  });

  it("an online method that never reached paid stays OFFLINE (authorized/pending/refunded)", () => {
    expect(isOnlineCapturedPayment("card", "authorized")).toBe(false);
    expect(isOnlineCapturedPayment("paypal", "pending")).toBe(false);
    expect(isOnlineCapturedPayment("card", "refunded")).toBe(false);
  });

  it("missing fields never classify as online", () => {
    expect(isOnlineCapturedPayment(null, "paid")).toBe(false);
    expect(isOnlineCapturedPayment("card", null)).toBe(false);
    expect(isOnlineCapturedPayment(undefined, undefined)).toBe(false);
  });
});
