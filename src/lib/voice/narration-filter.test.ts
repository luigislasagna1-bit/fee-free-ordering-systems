import { describe, expect, it } from "vitest";
import { isNarrationLeak } from "../../../services/nabil-voice/src/narration-filter";

describe("narration filter — the model's inner monologue never reaches the caller", () => {
  it("drops the leaks seen in the 2026-08-15 Opus bench", () => {
    for (const s of [
      "I'll use the Large 1 Topping menu item directly.",
      "They asked to take mushrooms off the first pizza — but mushrooms were never added (the update was blocked by ambiguity).",
      "L1 is pepperoni only; L2 has mushrooms.",
      'So "take the mushrooms off again" likely means the second pizza.',
      "Let me set that up properly.",
      "Let me check the Meat Lovers toppings.",
      "I need to make sure the topping came through on those first two.",
    ]) {
      expect(isNarrationLeak(s), s).toBe(true);
    }
  });
  it("keeps ordinary speech and every question", () => {
    for (const s of [
      "Sure.",
      "Got it — a large pizza, half pepperoni and mushrooms, half green peppers and onions.",
      "Anything else for you?",
      "I'll check that address for you.",
      "Do you mean the first pizza, the pepperoni one?",
      "Your total comes to twenty dollars and fifty-one cents, tax included.",
      "We're open until midnight tonight.",
      "",
    ]) {
      expect(isNarrationLeak(s), s).toBe(false);
    }
  });
});
