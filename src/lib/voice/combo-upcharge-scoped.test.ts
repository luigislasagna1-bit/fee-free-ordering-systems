/**
 * Pick-time combo upcharge disclosure (Luigi 2026-08-20: "announce those
 * specific add-ons as extra IF chosen"): update_line now prepends a SCOPED
 * premium reminder for exactly the picks the caller just made, and the spoken
 * pricing note for a compiled combo comes from its priceParts.
 */
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.APP_BASE_URL = "http://localhost:3001";
  process.env.INTERNAL_API_SECRET = "test-internal";
  process.env.NABIL_VOICE_JWT_SECRET = "test-jwt";
  process.env.ANTHROPIC_API_KEY = "test-anthropic";
});

import { comboUpchargeSummaryScoped, type RawSlot } from "../../../services/nabil-voice/src/tools";
import { buildMenuIndex } from "../../../services/nabil-voice/src/menu-index";
import { spokenPriceParts } from "../../../services/nabil-voice/src/spoken-money";

const MENU = buildMenuIndex({
  restaurant: { name: "Luigi's", currency: "cad" },
  menu: [
    {
      category: "Pasta",
      items: [
        { menuItemId: "mi_alfredo", name: "Fettuccine Alfredo", price: 14.99 },
        { menuItemId: "mi_rose", name: "Fettuccine Rose", price: 14.99 },
        { menuItemId: "mi_napoli", name: "Penne Napoli", price: 11.99 },
      ],
    },
  ],
});

const SLOTS: RawSlot[] = [
  { id: "s_pz", label: "Pizza Toppings", min: 1, max: 1, choices: [{ name: "EXTRA Large 1 Topping", menuItemId: "mi_xl" }] },
  {
    id: "s_pa",
    label: "Choose 2 Pastas",
    min: 2,
    max: 2,
    choices: [
      { name: "Fettuccine Alfredo", menuItemId: "mi_alfredo" },
      { name: "Fettuccine Rose", menuItemId: "mi_rose", sizes: ["Regular", "Large"] },
      { name: "Penne Napoli", menuItemId: "mi_napoli" },
    ],
  },
];

function ctxWith(upcharges: Record<string, { items?: Record<string, number>; variants?: Record<string, number> }>) {
  return {
    menu: MENU,
    currency: "cad",
    comboUpchargeCache: new Map([["mi_combo", upcharges]]),
  } as never;
}

const UPCHARGES = {
  s_pa: { items: { mi_alfredo: 5, mi_rose: 3 }, variants: { "mi_rose::v_r_lg": 7 } },
};

describe("comboUpchargeSummaryScoped", () => {
  it("a premium pick → a scoped confirm-the-cost instruction naming ONLY that pick", () => {
    const out = comboUpchargeSummaryScoped(ctxWith(UPCHARGES), "mi_combo", [{ slotLabel: "Choose 2 Pastas", menuItemId: "mi_alfredo" }], SLOTS);
    expect(out).toContain("PREMIUM");
    expect(out).toContain("Fettuccine Alfredo (+CA$5.00)");
    expect(out).not.toContain("Rose");
  });

  it("a non-premium pick → null (nothing to prepend)", () => {
    const out = comboUpchargeSummaryScoped(ctxWith(UPCHARGES), "mi_combo", [{ slotLabel: "Choose 2 Pastas", menuItemId: "mi_napoli" }], SLOTS);
    expect(out).toBeNull();
  });

  it("matches by item even when the pick names no slot (first-fit can relocate)", () => {
    const out = comboUpchargeSummaryScoped(ctxWith(UPCHARGES), "mi_combo", [{ menuItemId: "mi_rose" }], SLOTS);
    expect(out).toContain("Fettuccine Rose (+CA$3.00)");
    expect(out).toContain("size upgrade (+CA$7.00)");
  });

  it("pickId-only edits fall back to the full background summary", () => {
    const out = comboUpchargeSummaryScoped(ctxWith(UPCHARGES), "mi_combo", [{ pickId: "P2" }], SLOTS);
    expect(out).toContain("Background only");
    expect(out).toContain("Fettuccine Alfredo (+CA$5.00)");
  });

  it("no cached upcharges → null, never a throw", () => {
    const ctx = { menu: MENU, currency: "cad", comboUpchargeCache: undefined } as never;
    expect(comboUpchargeSummaryScoped(ctx, "mi_combo", [{ menuItemId: "mi_alfredo" }], SLOTS)).toBeNull();
  });
});

describe("spokenPriceParts", () => {
  it("one combined sentence: slot premium named, lone pizza extras anonymous", () => {
    expect(
      spokenPriceParts([
        { label: "Fettuccine Alfredo", amount: 5, kind: "slot_upcharge" },
        { label: "EXTRA Large 1 Topping", amount: 9, kind: "child_extras" },
      ]),
    ).toBe("Fettuccine Alfredo adds five dollars, and the extra toppings add nine dollars.");
  });

  it("two pizzas with extras are told apart by name", () => {
    expect(
      spokenPriceParts([
        { label: "First Pizza", amount: 3, kind: "child_extras" },
        { label: "Second Pizza", amount: 6, kind: "child_extras" },
      ]),
    ).toBe("The First Pizza extra toppings add three dollars, and the Second Pizza extra toppings add six dollars.");
  });

  it("sub-threshold parts are dropped; nothing left → null", () => {
    expect(spokenPriceParts([{ label: "Napkin", amount: 0.05, kind: "slot_upcharge" }])).toBeNull();
    expect(spokenPriceParts([])).toBeNull();
    expect(spokenPriceParts(undefined)).toBeNull();
  });
});
