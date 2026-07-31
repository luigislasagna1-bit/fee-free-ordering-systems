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

  it("an online method that never reached paid stays OFFLINE (authorized/pending/voided)", () => {
    expect(isOnlineCapturedPayment("card", "authorized")).toBe(false);
    expect(isOnlineCapturedPayment("paypal", "pending")).toBe(false);
    expect(isOnlineCapturedPayment("card", "voided")).toBe(false);
  });

  it("refunded statuses stay ONLINE — the money WAS captured online; a partial refund must not move the order into the till bucket (Fabrizio cms0gyexp #14, 2026-07-31)", () => {
    expect(isOnlineCapturedPayment("card", "partially_refunded")).toBe(true);
    expect(isOnlineCapturedPayment("card", "refunded")).toBe(true);
    expect(isOnlineCapturedPayment("paypal", "partially_refunded")).toBe(true);
    expect(isOnlineCapturedPayment("paypal", "refunded")).toBe(true);
    // ...but not for offline methods.
    expect(isOnlineCapturedPayment("cash", "refunded")).toBe(false);
    expect(isOnlineCapturedPayment("card_in_person", "partially_refunded")).toBe(false);
  });

  it("missing fields never classify as online", () => {
    expect(isOnlineCapturedPayment(null, "paid")).toBe(false);
    expect(isOnlineCapturedPayment("card", null)).toBe(false);
    expect(isOnlineCapturedPayment(undefined, undefined)).toBe(false);
  });
});
