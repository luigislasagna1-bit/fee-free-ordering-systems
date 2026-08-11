import { describe, expect, it } from "vitest";
// The voice service is a separate package (deployed to Fly), but this module is
// dependency-free on purpose so the duplicate-order contract can be tested here
// with the rest of the money-path suite.
import { basketSignature, fnv1a } from "../../../services/nabil-voice/src/basket-signature";

/**
 * The guard this protects: `ctx.placedOrders` refuses to place a basket whose
 * signature it has already seen. That saved us from the 2026-08-10 double order
 * — but it means a signature COLLISION silently drops a real order the caller
 * asked for. Every field that makes two baskets different must be hashed.
 */

const pizza = (mods: Array<{ modifierOptionId: string; name: string }>) => ({
  type: "pickup",
  items: [{ menuItemId: "mi_pizza", variantId: "v_lg", quantity: 1, modifiers: mods }],
});

describe("basketSignature — two different baskets must never collide", () => {
  it("distinguishes LEFT-half from RIGHT-half (same option id, different name)", () => {
    // The whole half/half convention lives in the name prefix, so an id-only
    // hash would make these identical and the second pizza would vanish.
    const left = basketSignature(pizza([{ modifierOptionId: "o_pep", name: "(L.H) Pepperoni" }]));
    const right = basketSignature(pizza([{ modifierOptionId: "o_pep", name: "(R.H) Pepperoni" }]));
    expect(left).not.toBe(right);
  });

  it("distinguishes a whole topping from a half topping", () => {
    const whole = basketSignature(pizza([{ modifierOptionId: "o_pep", name: "Pepperoni" }]));
    const half = basketSignature(pizza([{ modifierOptionId: "o_pep", name: "(L.H) Pepperoni" }]));
    expect(whole).not.toBe(half);
  });

  it("distinguishes single from double (per-unit expansion)", () => {
    const single = basketSignature(pizza([{ modifierOptionId: "o_pep", name: "Pepperoni" }]));
    const double = basketSignature(
      pizza([
        { modifierOptionId: "o_pep", name: "Pepperoni" },
        { modifierOptionId: "o_pep", name: "Pepperoni" },
      ]),
    );
    expect(single).not.toBe(double);
  });

  it("distinguishes combos whose children differ", () => {
    const base = (childVariant: string) => ({
      type: "pickup",
      items: [
        {
          menuItemId: "mi_combo",
          variantId: null,
          quantity: 1,
          modifiers: [],
          isCombo: true,
          bundleItems: [
            { menuItemId: "mi_pizza", variantId: childVariant, name: "Pizza", modifiers: [] },
          ],
        },
      ],
    });
    expect(basketSignature(base("v_lg"))).not.toBe(basketSignature(base("v_med")));
  });

  it("distinguishes combos whose children carry different toppings", () => {
    const combo = (topping: string) => ({
      type: "pickup",
      items: [
        {
          menuItemId: "mi_combo",
          variantId: null,
          quantity: 1,
          modifiers: [],
          isCombo: true,
          bundleItems: [
            {
              menuItemId: "mi_pizza",
              variantId: "v_lg",
              name: "Pizza",
              modifiers: [{ modifierOptionId: "o_x", name: topping }],
            },
          ],
        },
      ],
    });
    expect(basketSignature(combo("(L.H) Bacon"))).not.toBe(basketSignature(combo("(R.H) Bacon")));
  });

  it("distinguishes pickup from delivery", () => {
    const a = { ...pizza([]), type: "pickup" };
    const b = { ...pizza([]), type: "delivery" };
    expect(basketSignature(a)).not.toBe(basketSignature(b));
  });
});

describe("basketSignature — the SAME basket must always collide (that's the point)", () => {
  it("is order-insensitive across items and modifiers", () => {
    const a = {
      type: "pickup",
      items: [
        { menuItemId: "b", variantId: null, quantity: 1, modifiers: [{ modifierOptionId: "o2", name: "B" }, { modifierOptionId: "o1", name: "A" }] },
        { menuItemId: "a", variantId: null, quantity: 1, modifiers: [] },
      ],
    };
    const b = {
      type: "pickup",
      items: [
        { menuItemId: "a", variantId: null, quantity: 1, modifiers: [] },
        { menuItemId: "b", variantId: null, quantity: 1, modifiers: [{ modifierOptionId: "o1", name: "A" }, { modifierOptionId: "o2", name: "B" }] },
      ],
    };
    expect(basketSignature(a)).toBe(basketSignature(b));
  });

  it("ignores order-level notes — a reworded note is the same order intent", () => {
    const a = { ...pizza([]), notes: "ring the buzzer" };
    const b = { ...pizza([]), notes: "please ring buzzer" };
    expect(basketSignature(a)).toBe(basketSignature(b));
  });
});

describe("fnv1a — the idempotency key must stay legal", () => {
  it("is 8 lowercase hex chars, so the key matches /^[A-Za-z0-9_-]{16,64}$/", () => {
    const h = fnv1a(basketSignature(pizza([{ modifierOptionId: "o_pep", name: "Pepperoni" }])));
    expect(h).toMatch(/^[0-9a-f]{8}$/);
    // Real key shape: voice-<34-char CallSid>-<8 hex> = 49 chars.
    const key = `voice-${"CA".padEnd(34, "0")}-${h}`;
    expect(key).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
  });

  it("is stable for the same input", () => {
    const s = basketSignature(pizza([{ modifierOptionId: "o_pep", name: "(L.H) Pepperoni" }]));
    expect(fnv1a(s)).toBe(fnv1a(s));
  });
});
