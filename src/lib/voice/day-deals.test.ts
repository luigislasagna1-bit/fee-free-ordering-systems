import { describe, expect, it } from "vitest";
import { isFulfilableAt } from "@/lib/menu-fulfilment";

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
