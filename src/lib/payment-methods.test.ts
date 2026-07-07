import { describe, it, expect } from "vitest";
import {
  parsePaymentMethods,
  methodsForOrderType,
  allAcceptedMethods,
  isPaymentMethodAcceptedForType,
  slugToPaymentValue,
  paymentValueToSlug,
} from "@/lib/payment-methods";

// These tests pin down the accepted-payment-method logic that sits directly
// under checkout. The headline cases are REGRESSION GUARDS for the dead-end we
// fixed on 2026-06-15: a restaurant could be left with online card as the only
// method without the add-on, stranding both the admin and the customer.

describe("parsePaymentMethods", () => {
  it("reads a legacy flat array", () => {
    expect(parsePaymentMethods('["cash","online_card"]')).toEqual({
      mode: "all",
      methods: ["cash", "online_card"],
    });
  });

  it("reads the per-order-type object", () => {
    const r = parsePaymentMethods('{"pickup":["cash"],"delivery":["card_in_person"]}');
    expect(r.mode).toBe("perType");
    if (r.mode === "perType") {
      expect(r.perType.pickup).toEqual(["cash"]);
      expect(r.perType.delivery).toEqual(["card_in_person"]);
    }
  });

  it("treats malformed JSON and null as empty (no crash)", () => {
    expect(parsePaymentMethods("{not json")).toEqual({ mode: "all", methods: [] });
    expect(parsePaymentMethods(null)).toEqual({ mode: "all", methods: [] });
    expect(parsePaymentMethods(undefined)).toEqual({ mode: "all", methods: [] });
  });
});

describe("methodsForOrderType", () => {
  it("applies a flat list to every order type", () => {
    const raw = '["cash","card_in_person"]';
    expect(methodsForOrderType(raw, "pickup")).toEqual(["cash", "card_in_person"]);
    expect(methodsForOrderType(raw, "delivery")).toEqual(["cash", "card_in_person"]);
  });

  it("returns the per-type list for the matching type", () => {
    const raw = '{"pickup":["cash"],"delivery":["online_card"]}';
    expect(methodsForOrderType(raw, "pickup")).toEqual(["cash"]);
    expect(methodsForOrderType(raw, "delivery")).toEqual(["online_card"]);
  });

  it("falls back to the union of all methods when a type has no config", () => {
    const raw = '{"pickup":["cash"],"delivery":["online_card"]}';
    expect(methodsForOrderType(raw, "dine_in").sort()).toEqual(["cash", "online_card"]);
  });

  it("never leaves checkout with zero options — defaults to cash", () => {
    expect(methodsForOrderType(null, "pickup")).toEqual(["cash"]);
    expect(methodsForOrderType("[]", "pickup")).toEqual(["cash"]);
    expect(methodsForOrderType("{}", "delivery")).toEqual(["cash"]);
  });

  it("maps catering to the dine_in config", () => {
    expect(methodsForOrderType('{"dine_in":["card_in_person"]}', "catering")).toEqual([
      "card_in_person",
    ]);
  });
});

describe("allAcceptedMethods — promo wizard union", () => {
  it("returns the flat list as-is (legacy)", () => {
    expect(allAcceptedMethods('["cash","card_in_person"]').sort()).toEqual(["card_in_person", "cash"]);
  });

  it("unions the per-order-type object across all types (deduped)", () => {
    // The bug Luigi hit: online_card lived only under some order types, and the
    // promo pages (which assumed a flat array) got [] and hid every method. The
    // union must surface online_card so the wizard can offer it once enabled.
    const raw = '{"pickup":["cash","card_in_person","online_card"],"delivery":["cash","online_card"],"dine_in":["card_in_person"]}';
    expect(allAcceptedMethods(raw).sort()).toEqual(["card_in_person", "cash", "online_card"]);
  });

  it("excludes online methods when they aren't in the accepted list", () => {
    // Original bug direction: a store WITHOUT the add-on has no online_card in
    // its saved methods, so the wizard must NOT offer it.
    const raw = '{"pickup":["cash","card_in_person"],"delivery":["cash"]}';
    expect(allAcceptedMethods(raw).sort()).toEqual(["card_in_person", "cash"]);
  });

  it("returns [] for empty / malformed config (caller supplies a safe default)", () => {
    expect(allAcceptedMethods("[]")).toEqual([]);
    expect(allAcceptedMethods("{}")).toEqual([]);
    expect(allAcceptedMethods(null)).toEqual([]);
  });
});

describe("slug <-> checkout value conversion", () => {
  it("bridges online_card (slug) and card (checkout value)", () => {
    expect(slugToPaymentValue("online_card")).toBe("card");
    expect(paymentValueToSlug("card")).toBe("online_card");
  });

  it("leaves the in-person methods unchanged", () => {
    expect(slugToPaymentValue("cash")).toBe("cash");
    expect(paymentValueToSlug("card_in_person")).toBe("card_in_person");
  });
});

describe("isPaymentMethodAcceptedForType — server order guard", () => {
  it("ALWAYS accepts in-person methods, even when not in the config (cash fallback)", () => {
    // The exact dead-end we fixed: only online card is configured, the customer
    // falls back to Cash, and the order MUST still be accepted server-side.
    const raw = '{"pickup":["online_card"]}';
    expect(isPaymentMethodAcceptedForType(raw, "pickup", "cash")).toBe(true);
    expect(isPaymentMethodAcceptedForType(raw, "pickup", "card_in_person")).toBe(true);
  });

  it("gates online card against the restaurant's accepted list", () => {
    expect(isPaymentMethodAcceptedForType('{"pickup":["online_card"]}', "pickup", "card")).toBe(true);
    expect(isPaymentMethodAcceptedForType('{"pickup":["cash"]}', "pickup", "card")).toBe(false);
  });
});
