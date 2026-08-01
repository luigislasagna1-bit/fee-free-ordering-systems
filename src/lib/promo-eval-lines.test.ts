/**
 * Which cart lines reach the promo engine — the filter whose failure mode is
 * invisible (the line just never gets evaluated and every promo shows $0).
 *
 * Written after Luigi's "Large / Wings Combo": a combo MENU ITEM the owner had
 * explicitly targeted with a VIP special previewed $0 forever, because the cart
 * flags combos isBundle:true (to reuse the bundle rendering) and the preview
 * filter read only isBundle. Meanwhile the CHARGE path has always included
 * combo lines — so the preview under-promised what the server would charge,
 * which is precisely the preview==charge contract (Blocker #7) inverted.
 */
import { describe, it, expect } from "vitest";
import { includeLineInPromoEval } from "./promo-eval-lines";

describe("includeLineInPromoEval", () => {
  it("keeps ordinary items", () => {
    expect(includeLineInPromoEval({})).toBe(true);
    expect(includeLineInPromoEval({ isBundle: false })).toBe(true);
  });

  it("keeps COMBO menu items — real id, real category, owner can target them", () => {
    expect(includeLineInPromoEval({ isBundle: true, isCombo: true })).toBe(true);
  });

  it("still excludes promo-priced bundles — their price IS the deal", () => {
    expect(includeLineInPromoEval({ isBundle: true })).toBe(false);
    expect(includeLineInPromoEval({ isBundle: true, isCombo: false })).toBe(false);
  });
});
