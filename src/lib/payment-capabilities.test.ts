import { describe, it, expect } from "vitest";
import { usablePaymentMethods } from "./payment-capabilities";

describe("usablePaymentMethods", () => {
  const all = ["cash", "card_in_person", "online_card", "paypal"];

  it("keeps cash + card_in_person regardless of online capability", () => {
    const out = usablePaymentMethods(all, { cardPaymentEnabled: false, paypalEnabled: false });
    expect(out).toContain("cash");
    expect(out).toContain("card_in_person");
  });

  it("drops online_card + paypal when the Online Payments add-on is OFF", () => {
    // This is the bug the promo wizard hit: online methods offered for a
    // pay-online reward even though customers can't select them.
    expect(usablePaymentMethods(all, { cardPaymentEnabled: false, paypalEnabled: false })).toEqual([
      "cash",
      "card_in_person",
    ]);
  });

  it("keeps online_card only when card is live, paypal only when paypal is live", () => {
    expect(usablePaymentMethods(all, { cardPaymentEnabled: true, paypalEnabled: false })).toEqual([
      "cash",
      "card_in_person",
      "online_card",
    ]);
    expect(usablePaymentMethods(all, { cardPaymentEnabled: false, paypalEnabled: true })).toEqual([
      "cash",
      "card_in_person",
      "paypal",
    ]);
    expect(usablePaymentMethods(all, { cardPaymentEnabled: true, paypalEnabled: true })).toEqual(all);
  });

  it("preserves order and passes through unknown slugs untouched", () => {
    expect(
      usablePaymentMethods(["card_in_person", "cash"], { cardPaymentEnabled: false, paypalEnabled: false }),
    ).toEqual(["card_in_person", "cash"]);
  });
});
