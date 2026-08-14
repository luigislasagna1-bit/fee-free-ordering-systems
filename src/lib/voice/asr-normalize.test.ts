/**
 * ASR surface-form repair, tested against the REAL normaliser in the voice
 * service (`services/nabil-voice/src/asr-normalize.ts`).
 *
 * Every case here is either a live utterance from call cmssema67000504l1u8eivki7
 * (2026-08-14) or a string that MUST survive untouched. The second half matters
 * more than the first: a normaliser that eats a price is worse than the defect
 * it fixes.
 */
import { describe, expect, it } from "vitest";
import { normalizeAsr } from "../../../services/nabil-voice/src/asr-normalize";

describe('"half" comes back from Deepgram as "0.5"', () => {
  it("repairs the two utterances from the live call", () => {
    // Verbatim, both of them.
    expect(normalizeAsr("I want to order 1 extra large pizza. 0.5 of it, uh, pepperoni.")).toBe(
      "I want to order 1 extra large pizza. half of it, uh, pepperoni.",
    );
    expect(normalizeAsr("No. I want, like, extra large pizza, 0.5 of it, pepperoni and ground beef.")).toBe(
      "No. I want, like, extra large pizza, half of it, pepperoni and ground beef.",
    );
  });

  it("handles the fraction spelling too", () => {
    expect(normalizeAsr("1/2 pepperoni 1/2 mushroom")).toBe("half pepperoni half mushroom");
  });

  it("repairs quarters", () => {
    expect(normalizeAsr("0.25 of it cheese")).toBe("a quarter of it cheese");
    expect(normalizeAsr("0.75 of it cheese")).toBe("three quarters of it cheese");
  });
});

describe("it must never touch a real number", () => {
  it("leaves money alone", () => {
    expect(normalizeAsr("that comes to $26.30")).toBe("that comes to $26.30");
    expect(normalizeAsr("it's $0.50 more")).toBe("it's $0.50 more");
  });

  it("leaves quantities and decimals alone", () => {
    expect(normalizeAsr("a 1.5 litre bottle")).toBe("a 1.5 litre bottle");
    expect(normalizeAsr("10.5 inches")).toBe("10.5 inches");
    expect(normalizeAsr("20.25 percent")).toBe("20.25 percent");
  });

  it("leaves a phone number alone", () => {
    expect(normalizeAsr("647 669 0808")).toBe("647 669 0808");
  });

  it("leaves ordinary speech untouched", () => {
    const s = "Ground beef, jalapeno and chicken on the other side please.";
    expect(normalizeAsr(s)).toBe(s);
  });
});
