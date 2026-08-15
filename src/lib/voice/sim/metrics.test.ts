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
  it("passes natural speech", () => {
    expect(isRoboticUtterance("Sure. So that's a large pizza, half pepperoni and mushrooms, half green peppers and onions — anything else?")).toBeNull();
    expect(isRoboticUtterance("Your total comes to forty-five dollars and twenty-two cents, tax included. Shall I place it?")).toBeNull();
    expect(isRoboticUtterance("It's for pickup in about 20 minutes, ready around 6:15.")).toBeNull();
    expect(isRoboticUtterance("")).toBeNull();
  });
});
