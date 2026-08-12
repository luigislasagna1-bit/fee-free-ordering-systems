import { describe, expect, it } from "vitest";
import { isFulfilableAt } from "@/lib/menu-fulfilment";
import { variantsCorrespond } from "@/lib/voice/variant-match";

/**
 * THE DAY GATE — "certain specials are only available on certain days, ensure
 * those are offered only on those days not other days" (Luigi, 2026-08-11).
 *
 * The deal finder never stores its own copy of a schedule. It asks the deal
 * ITEM whether it can be fulfilled right now, through `isFulfilableAt` — the
 * same helper `/api/orders` validates against at checkout. That single source
 * is the whole guarantee: there is no second schedule to drift, so a deal Nabil
 * offers can never be refused at the till for being the wrong day, and a deal
 * the till would refuse can never be offered.
 *
 * These lock the behaviour for Luigi's real deal items.
 */

const at = (iso: string) => new Date(iso);

// Luigi's live data, verbatim.
const TUESDAY_LARGE_PIZZA = { fulfilDays: "[2]" }; // "Tuesday - Large Pizza Special"
const MONDAY_MEDIUM_PIZZA = { fulfilDays: "[1]" }; // "Monday - Medium Pizza Special"
const WEDNESDAY_WING_DAY = { fulfilDays: "[3]" }; // "Wednesday - WING Day (20% OFF)"
const THURSDAY_SANDWICH = { fulfilDays: "[4]" };
const FRIDAY_FISH = { fulfilDays: "[5]" };
const EVERY_DAY = { fulfilDays: null };

// A week of noon-in-Toronto instants. 2026-08-09 is a Sunday.
const NOON = {
  sun: at("2026-08-09T16:00:00Z"),
  mon: at("2026-08-10T16:00:00Z"),
  tue: at("2026-08-11T16:00:00Z"),
  wed: at("2026-08-12T16:00:00Z"),
  thu: at("2026-08-13T16:00:00Z"),
  fri: at("2026-08-14T16:00:00Z"),
  sat: at("2026-08-15T16:00:00Z"),
};
const TZ = "America/Toronto";

describe("a day deal runs on its day and no other", () => {
  it("the Tuesday large pizza special is offerable ONLY on Tuesday", () => {
    expect(isFulfilableAt(TUESDAY_LARGE_PIZZA, NOON.tue, TZ)).toBe(true);
    for (const day of ["sun", "mon", "wed", "thu", "fri", "sat"] as const) {
      expect(isFulfilableAt(TUESDAY_LARGE_PIZZA, NOON[day], TZ)).toBe(false);
    }
  });

  it("the Monday medium special is offerable ONLY on Monday", () => {
    expect(isFulfilableAt(MONDAY_MEDIUM_PIZZA, NOON.mon, TZ)).toBe(true);
    expect(isFulfilableAt(MONDAY_MEDIUM_PIZZA, NOON.tue, TZ)).toBe(false);
    expect(isFulfilableAt(MONDAY_MEDIUM_PIZZA, NOON.sun, TZ)).toBe(false);
  });

  it("wing day is Wednesday only", () => {
    expect(isFulfilableAt(WEDNESDAY_WING_DAY, NOON.wed, TZ)).toBe(true);
    expect(isFulfilableAt(WEDNESDAY_WING_DAY, NOON.tue, TZ)).toBe(false);
    expect(isFulfilableAt(WEDNESDAY_WING_DAY, NOON.thu, TZ)).toBe(false);
  });

  it("Thursday sandwiches and Friday fish don't leak into each other", () => {
    expect(isFulfilableAt(THURSDAY_SANDWICH, NOON.thu, TZ)).toBe(true);
    expect(isFulfilableAt(THURSDAY_SANDWICH, NOON.fri, TZ)).toBe(false);
    expect(isFulfilableAt(FRIDAY_FISH, NOON.fri, TZ)).toBe(true);
    expect(isFulfilableAt(FRIDAY_FISH, NOON.thu, TZ)).toBe(false);
  });

  it("an item with no day restriction is always offerable", () => {
    for (const day of Object.values(NOON)) {
      expect(isFulfilableAt(EVERY_DAY, day, TZ)).toBe(true);
    }
  });

  it("uses the RESTAURANT's timezone, not the server's", () => {
    // 01:30 UTC Wednesday is still Tuesday evening in Toronto — a caller
    // ringing at 9:30pm Tuesday must still get the Tuesday deal.
    const lateTuesdayInToronto = at("2026-08-12T01:30:00Z");
    expect(isFulfilableAt(TUESDAY_LARGE_PIZZA, lateTuesdayInToronto, TZ)).toBe(true);
    expect(isFulfilableAt(WEDNESDAY_WING_DAY, lateTuesdayInToronto, TZ)).toBe(false);
  });
});

/**
 * THE SIZE GATE — "many items have sizes etc, make sure everything matches
 * exactly to the correct thing" (Luigi, 2026-08-11).
 *
 * Every pair below is his live menu, verbatim.
 */
const v = (...names: string[]) => names.map((name) => ({ name }));

describe("a deal is only offered when its sizes match the standard item's", () => {
  it("accepts Luigi's real size-carrying pairs", () => {
    // Chicken Cheese Steak 6" $9.99 / 12" $15.99 ↔ Thursday 6" $7.99 / 12" $12.59
    expect(variantsCorrespond(v("6'", "12'"), v("6'", "12'"))).toBe(true);
    // Fish & Chips 1pc $13.99 / 2pc $17.99 ↔ Friday 1pc $10.49 / 2pc $13.49
    expect(variantsCorrespond(v("1 Piece", "2 Pieces"), v("1 Piece", "2 Pieces"))).toBe(true);
    // Wing day: all four counts, which is the whole point of that pairing.
    expect(variantsCorrespond(v("10", "20", "30", "40"), v("10", "20", "30", "40"))).toBe(true);
  });

  it("accepts two flat-priced items — no size to get wrong", () => {
    // Smash Burger $8.99 ↔ Thursday - Smash Burger $7.19
    expect(variantsCorrespond([], [])).toBe(true);
  });

  it("REFUSES a flat-priced deal for a sized item (the $8 hole)", () => {
    // If the Thursday Chicken Cheese Steak ever lost its 12", quoting its flat
    // price to someone buying a 12" would be the wrong sandwich AND wrong money.
    expect(variantsCorrespond(v("6'", "12'"), [])).toBe(false);
    expect(variantsCorrespond([], v("6'", "12'"))).toBe(false);
  });

  it("REFUSES a deal that covers only some of the sizes", () => {
    expect(variantsCorrespond(v("6'", "12'"), v("6'"))).toBe(false);
    expect(variantsCorrespond(v("10", "20", "30", "40"), v("10", "20"))).toBe(false);
  });

  it("REFUSES sizes that merely look similar", () => {
    expect(variantsCorrespond(v("Large"), v("Extra Large"))).toBe(false);
    expect(variantsCorrespond(v("XL"), v("X-Large"))).toBe(false);
    expect(variantsCorrespond(v("1 Piece"), v("2 Pieces"))).toBe(false);
  });

  it("ignores punctuation, case and spacing — 6' and 6\" are one shelf", () => {
    expect(variantsCorrespond(v("6'", "12'"), v('6"', '12"'))).toBe(true);
    expect(variantsCorrespond(v("1 Piece"), v("1  piece"))).toBe(true);
  });
});
