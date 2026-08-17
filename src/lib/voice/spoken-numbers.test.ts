/**
 * Numbers as spoken on the phone — the deterministic pass before TTS
 * (services/nabil-voice/src/spoken-numbers.ts). Anchored on the real
 * utterances from the 2026-08-16 calls that made Luigi file report
 * cmswjlo87 ("number issues when announcing double digits etc").
 */
import { describe, expect, it } from "vitest";
import {
  ordinalWords,
  spokenDigits,
  spokenHouseNumber,
  spokenTime,
  spokenYear,
  verbalizeNumbersEn,
} from "../../../services/nabil-voice/src/spoken-numbers";

const say = (s: string) => verbalizeNumbersEn(s).text;

describe("spoken-numbers — the exact lines from tonight's calls", () => {
  it("Luigi's call: the callback number written as digits with hyphens", () => {
    expect(say("Perfect. Can I get a name for the order, and is 647-669-0808 the best number for you?")).toBe(
      "Perfect. Can I get a name for the order, and is six four seven, six six nine, zero eight zero eight the best number for you?",
    );
  });
  it("Grace's call: the number written with spaces", () => {
    expect(say("should we use this number, 416 799 6207, for the callback?")).toBe(
      "should we use this number, four one six, seven nine nine, six two zero seven, for the callback?",
    );
  });
  it("leaves a number the model already wrote in words alone", () => {
    const s = "I have your number as four one six, five two nine, eight seven five six, is that the best number?";
    expect(verbalizeNumbersEn(s)).toEqual({ text: s, changes: 0 });
  });
  it("addresses: house numbers the way people say them", () => {
    expect(say("Got it, 338 Black Drive in Milton.")).toBe("Got it, three thirty-eight Black Drive in Milton.");
    expect(say("I have 1166 McEachern Court — is that right?")).toBe("I have eleven sixty-six McEachern Court — is that right?");
    expect(say("66 McKechnie Court")).toBe("sixty-six McKechnie Court");
    expect(say("delivery to 305 Main St")).toBe("delivery to three oh five Main St");
    expect(say("1000 Island dressing")).toBe("one thousand Island dressing");
    expect(say("Unit 1204, 338A King Street")).toBe("Unit twelve oh four, three thirty-eight A King Street");
    expect(say("apt 12 at 45 Bronte Rd")).toBe("apartment twelve at forty-five Bronte Rd");
    expect(say("buzzer #305")).toBe("buzzer three oh five");
    expect(say("postal code L9T 6W9")).toBe("postal code L nine T, six W nine");
  });
});

describe("spoken-numbers — money, times, dates, misc", () => {
  it("money in words (and never touches money already in words)", () => {
    expect(say("your total comes to $46.87, tax included")).toBe("your total comes to forty-six dollars and eighty-seven cents, tax included");
    expect(say("delivery is $7.99 or free over $30")).toBe("delivery is seven dollars and ninety-nine cents or free over thirty dollars");
    expect(say("CA$0.50 extra")).toBe("fifty cents extra");
    expect(say("between $5-$10")).toBe("between five dollars to ten dollars");
    expect(say("that's 12.50 dollars")).toBe("that's twelve dollars and fifty cents");
  });
  it("times", () => {
    expect(say("we open this morning at 10:00 AM")).toBe("we open this morning at ten a.m.");
    expect(say("ready around 6:30 pm")).toBe("ready around six thirty p.m.");
    expect(say("kitchen closes at 12:05 AM")).toBe("kitchen closes at twelve oh five a.m.");
    expect(say("we close at 22:00")).toBe("we close at twenty-two hundred");
    expect(say("pickup at 5pm")).toBe("pickup at five p.m.");
    expect(say("about 20 minutes")).toBe("about twenty minutes");
  });
  it("dates and years", () => {
    expect(say("on August 16, 2026")).toBe("on August sixteenth, twenty twenty-six");
    expect(say("Aug 3rd")).toBe("August third");
    expect(say("since 2005")).toBe("since two thousand and five");
    expect(say("2026-08-16")).toBe("August sixteenth, twenty twenty-six");
  });
  it("percent, ordinals, sizes, ranges, fractions, long numbers", () => {
    expect(say("10% off")).toBe("ten percent off");
    expect(say("12.5% tax")).toBe("twelve point five percent tax");
    expect(say("your 2nd order")).toBe("your second order");
    expect(say("the 21st")).toBe("the twenty-first");
    expect(say('an 18" pizza')).toBe("an eighteen inch pizza");
    expect(say("an 18-inch pizza")).toBe("an eighteen inch pizza");
    expect(say("20-25 minutes")).toBe("twenty to twenty-five minutes");
    expect(say("Zones 1–3 are free")).toBe("Zones one to three are free");
    expect(say("1/2 pepperoni")).toBe("half pepperoni");
    expect(say("½ cheese")).toBe("half cheese");
    expect(say("order ORD-647686206")).toBe("order ORD-six four seven, six eight six, two zero six");
    expect(say("1,250 points")).toBe("one thousand two hundred and fifty points");
    expect(say("1.5 litres")).toBe("one point five litres");
  });
  it("leaves ids and letter-glued tokens alone; no-op when there are no digits", () => {
    expect(say("line L1 and pizza P2")).toBe("line L1 and pizza P2");
    expect(say("a 2L bottle")).toBe("a 2L bottle");
    expect(verbalizeNumbersEn("Anything else for you?")).toEqual({ text: "Anything else for you?", changes: 0 });
  });
  it("counts substitutions", () => {
    expect(verbalizeNumbersEn("2 pizzas at $46.87 to 338 Black Drive").changes).toBe(3);
  });
});

describe("spoken-numbers — helpers", () => {
  it("spokenDigits / house numbers / years / ordinals / times", () => {
    expect(spokenDigits("0808")).toBe("zero eight zero eight");
    expect(spokenDigits("647669206", 3)).toBe("six four seven, six six nine, two zero six");
    expect([66, 100, 305, 338, 1000, 1005, 1100, 1166, 12345].map(spokenHouseNumber)).toEqual([
      "sixty-six", "one hundred", "three oh five", "three thirty-eight", "one thousand", "ten oh five", "eleven hundred", "eleven sixty-six", "one twenty-three forty-five",
    ]);
    expect([1999, 2000, 2005, 2010, 2026].map(spokenYear)).toEqual(["nineteen ninety-nine", "two thousand", "two thousand and five", "twenty ten", "twenty twenty-six"]);
    expect([1, 2, 3, 4, 5, 8, 9, 12, 20, 21, 22, 30, 100, 105].map(ordinalWords)).toEqual([
      "first", "second", "third", "fourth", "fifth", "eighth", "ninth", "twelfth", "twentieth", "twenty-first", "twenty-second", "thirtieth", "one hundredth", "one hundred and fifth",
    ]);
    expect(spokenTime(10, 0, "AM")).toBe("ten a.m.");
    expect(spokenTime(10, 30, null)).toBe("ten thirty");
    expect(spokenTime(12, 5, "pm")).toBe("twelve oh five p.m.");
    expect(spokenTime(10, 0, null)).toBe("ten o'clock");
  });
});
