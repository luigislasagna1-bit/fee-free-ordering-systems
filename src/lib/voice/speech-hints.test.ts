import { describe, expect, it } from "vitest";
import { HINTS_MAX_CHARS, cleanHint, packHints } from "./speech-hints";

/**
 * These assertions encode a real outage: on 2026-08-09 a malformed `hints`
 * string 400ed Deepgram and EVERY pilot call died before the greeting. The
 * invariants below are the ones that outage taught us.
 */
describe("packHints", () => {
  it("never exceeds the ConversationRelay 500-char ceiling", () => {
    const items = Array.from({ length: 150 }, (_, i) => `Menu Item Number ${i}`);
    const toppings = Array.from({ length: 400 }, (_, i) => `Topping ${i}`);
    expect(packHints(items, toppings).length).toBeLessThanOrEqual(HINTS_MAX_CHARS);
  });

  it("emits only characters Deepgram accepts", () => {
    const out = packHints(
      ["MINI CARROTS + RANCH DIP", "Kit!", "Chef's Special (Large)", "Café Latte"],
      ["Jalapeño", "1/2 & 1/2"],
    );
    // Commas are the separator; every other char must be [A-Za-z0-9 -].
    expect(out).toMatch(/^[A-Za-z0-9 ,-]*$/);
    expect(out).not.toContain("+");
    expect(out).not.toContain("!");
  });

  it("packs whole terms only — never a truncated dish name", () => {
    const long = "A".repeat(38);
    const out = packHints([long, "Pizza"], []);
    for (const term of out.split(",")) {
      expect(["Pizza", long]).toContain(term);
    }
  });

  it("reserves room for toppings even when the item list is enormous", () => {
    const items = Array.from({ length: 150 }, (_, i) => `Extremely Long Menu Item Name ${i}`);
    const out = packHints(items, ["Pepperoni", "Giardiniera", "Bocconcini"]);
    expect(out).toContain("Pepperoni");
    expect(out).toContain("Giardiniera");
    expect(out).toContain("Bocconcini");
  });

  it("gives the whole budget to items when there are no toppings", () => {
    const items = Array.from({ length: 150 }, (_, i) => `Item ${i}`);
    const out = packHints(items, []);
    expect(out.length).toBeGreaterThan(400);
    expect(out.length).toBeLessThanOrEqual(HINTS_MAX_CHARS);
  });

  it("dedupes case-insensitively so budget isn't spent twice on one word", () => {
    const out = packHints(["Pepperoni", "PEPPERONI", "pepperoni"], ["Pepperoni"]);
    expect(out).toBe("Pepperoni");
  });

  it("skips a too-long term instead of stopping the pack", () => {
    const out = packHints(["B".repeat(60), "Calzone"], []);
    expect(out).toBe("Calzone");
  });

  it("drops one-character and empty names", () => {
    expect(packHints(["A", "", "   ", "Wings"], [])).toBe("Wings");
  });

  it("is safe to embed in an XML attribute (no quotes or angle brackets)", () => {
    const out = packHints(['12" "Big" Pizza', "Fish & Chips <special>"], []);
    expect(out).not.toMatch(/["'<>&]/);
  });
});

describe("cleanHint", () => {
  it("collapses punctuation into single spaces", () => {
    expect(cleanHint("MINI CARROTS + RANCH DIP")).toBe("MINI CARROTS RANCH DIP");
    expect(cleanHint("Chef's  Special!!")).toBe("Chef s Special");
  });
  it("keeps hyphens, which are legal", () => {
    expect(cleanHint("Half-and-Half")).toBe("Half-and-Half");
  });
});
