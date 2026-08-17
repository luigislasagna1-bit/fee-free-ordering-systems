import { describe, expect, it } from "vitest";
import { isRoboticUtterance } from "./metrics";

describe("naturalness lint (what Luigi heard on 2026-08-15 must be caught)", () => {
  it("flags ticket read-backs, numbered lists, currency codes, ids and SKU names", () => {
    expect(isRoboticUtterance("Large 2 Topping — left half: Pepperoni, Mushrooms; right half: Green Peppers, Onions.")).toBeTruthy();
    expect(isRoboticUtterance("1. Large 1 Topping with Pepperoni 2. 2× Coke")).toBeTruthy();
    expect(isRoboticUtterance("That's CA$45.22 including tax.")).toBeTruthy();
    expect(isRoboticUtterance("I updated line L2 for you.")).toBeTruthy();
    expect(isRoboticUtterance("Got it, one Large 2 Topping pizza.")).toBeTruthy();
  });
  it("still catches SKU names and numbered lists once numbers are spoken as words (spoken-numbers.ts, 2026-08-16)", () => {
    expect(isRoboticUtterance("Got it, one Large two Topping pizza.")).toBeTruthy();
    expect(isRoboticUtterance("Got it — a large three-topping pizza and twenty wings.")).toBeTruthy();
    expect(isRoboticUtterance("one. Large pizza with pepperoni two. two Cokes")).toBeTruthy();
  });
  it("passes natural speech", () => {
    expect(isRoboticUtterance("Sure. So that's a large pizza, half pepperoni and mushrooms, half green peppers and onions — anything else?")).toBeNull();
    expect(isRoboticUtterance("Your total comes to forty-five dollars and twenty-two cents, tax included. Shall I place it?")).toBeNull();
    expect(isRoboticUtterance("It's for pickup in about 20 minutes, ready around 6:15.")).toBeNull();
    expect(isRoboticUtterance("It's for pickup in about twenty minutes, ready around six fifteen.")).toBeNull();
    expect(isRoboticUtterance("That's the last one. Anything else for you?")).toBeNull();
    expect(isRoboticUtterance("Is six four seven, six six nine, zero eight zero eight the best number for you?")).toBeNull();
    expect(isRoboticUtterance("Got it, three thirty-eight Black Drive in Milton.")).toBeNull();
    expect(isRoboticUtterance("")).toBeNull();
  });
});
