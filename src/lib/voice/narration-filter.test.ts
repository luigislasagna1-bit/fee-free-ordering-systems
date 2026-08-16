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
      "[STATE t=2 | cart=db5a1218 | pickup/delivery: not settled | name: needed | phone: caller ID]",
      "Nothing is on the order yet. I should set fulfilment to pickup and set the customer phone confirmation.",
      "I can't quote an empty order.",
      "They may be distracted.",
      "I'll pick the most natural reading: they originally said one Hawaiian.",
      "Let me add the large pepperoni and the medium Hawaiian.",
      "The wings id needed a tweak. Let me try that again.",
      "That didn't go through — my mistake.",
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
      "I'll add that for you.",
      "Let me get that on.",
      "Do you mean the first pizza, the pepperoni one?",
      "Your total comes to twenty dollars and fifty-one cents, tax included.",
      "We're open until midnight tonight.",
      "",
    ]) {
      expect(isNarrationLeak(s), s).toBe(false);
    }
  });
});
