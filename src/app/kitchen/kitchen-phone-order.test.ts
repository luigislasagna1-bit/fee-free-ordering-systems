import { describe, it, expect } from "vitest";
import { isPhoneOrder, phoneOrderPaymentState, PHONE_ORDER_CHANNEL, THEMES } from "./kitchen-types";
import { getChannel } from "@/lib/reports/channels";

/**
 * Kitchen-side PHONE ORDER cues (Luigi 2026-08-16). These pin the two facts the
 * tile + detail badge depend on:
 *   1. the marker is Order.channel === "voice" — the slug /api/orders stamps for
 *      Nabil AI and the one the Sales report colours pink; and
 *   2. the payment chip has the SAME semantics as the printed receipt banner
 *      (phoneOrderPaymentLine): PAID / NOT PAID with due = total − creditApplied /
 *      any other Stripe state passed through in its generic tone.
 */
describe("isPhoneOrder", () => {
  it("is keyed on the 'voice' channel slug the report knows as Phone (Nabil AI)", () => {
    expect(PHONE_ORDER_CHANNEL).toBe("voice");
    expect(getChannel(PHONE_ORDER_CHANNEL).label).toBe("Phone (Nabil AI)");
    expect(getChannel(PHONE_ORDER_CHANNEL).hex).toBe("#ec4899");
  });

  it("flags only voice orders — web, marketplace, null and legacy payloads are not phone orders", () => {
    expect(isPhoneOrder({ channel: "voice" })).toBe(true);
    expect(isPhoneOrder({ channel: "marketplace" })).toBe(false);
    expect(isPhoneOrder({ channel: "direct" })).toBe(false);
    expect(isPhoneOrder({ channel: null })).toBe(false);
    expect(isPhoneOrder({})).toBe(false);
  });
});

describe("phoneOrderPaymentState — receipt-banner semantics", () => {
  it("paid → PAID", () => {
    expect(phoneOrderPaymentState({ paymentStatus: "paid", total: 34.5, creditApplied: 0 })).toEqual({ kind: "paid" });
  });

  it("pending → NOT PAID with the full total due", () => {
    expect(phoneOrderPaymentState({ paymentStatus: "pending", total: 34.5, creditApplied: 0 })).toEqual({ kind: "unpaid", due: 34.5 });
  });

  it("pending with Reward Dollars applied → only the remainder is due (total − creditApplied)", () => {
    expect(phoneOrderPaymentState({ paymentStatus: "pending", total: 34.5, creditApplied: 10 })).toEqual({ kind: "unpaid", due: 24.5 });
    // Legacy rows carry null creditApplied — treated as 0, never NaN.
    expect(phoneOrderPaymentState({ paymentStatus: "pending", total: 20, creditApplied: null })).toEqual({ kind: "unpaid", due: 20 });
  });

  it("never reports a negative amount due", () => {
    expect(phoneOrderPaymentState({ paymentStatus: "pending", total: 10, creditApplied: 15 })).toEqual({ kind: "unpaid", due: 0 });
  });

  it("other Stripe states pass through with the generic label + tone", () => {
    expect(phoneOrderPaymentState({ paymentStatus: "refunded", total: 34.5, creditApplied: 0 }))
      .toEqual({ kind: "other", label: "REFUNDED", tone: "blue" });
    expect(phoneOrderPaymentState({ paymentStatus: "failed", total: 34.5, creditApplied: 0 }))
      .toEqual({ kind: "other", label: "FAILED", tone: "red" });
  });
});

describe("kitchen theme tokens for the phone-order cues", () => {
  it("both day and night themes carry the pink pill, paid/unpaid chips and the banner", () => {
    for (const mode of ["light", "dark"] as const) {
      const t = THEMES[mode];
      expect(t.badgePhone).toMatch(/pink/);
      expect(t.badgePaid).toMatch(/green/);
      expect(t.badgeUnpaid).toMatch(/red/);
      expect(t.bannerPhone).toMatch(/pink/);
    }
  });
});
