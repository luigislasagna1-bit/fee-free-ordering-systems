import { describe, expect, it } from "vitest";
import { MIN_AGREEING, firstNameKey, nameHintFromRecentVoiceOrders } from "./name-hint";

describe("name on file from recent voice tickets (Luigi's live call 2026-08-15)", () => {
  it("Luigi's own line — Dishen, Jashan, Dishen — offers NO name", () => {
    expect(nameHintFromRecentVoiceOrders(["Dishen (phone)", "Jashan (phone)", "Dishen (phone)"])).toBeNull();
  });
  it("three agreeing tickets offer the newest spelling, placeholder stripped", () => {
    expect(nameHintFromRecentVoiceOrders(["Roya Nabil (phone)", "roya (phone)", "Roya"])).toBe("Roya Nabil");
  });
  it("fewer than MIN_AGREEING tickets is not a history", () => {
    expect(MIN_AGREEING).toBe(3);
    expect(nameHintFromRecentVoiceOrders(["Sam (phone)", "Sam (phone)"])).toBeNull();
    expect(nameHintFromRecentVoiceOrders([])).toBeNull();
    expect(nameHintFromRecentVoiceOrders([null, "", undefined])).toBeNull();
  });
  it("first-name key ignores case, surname and the placeholder", () => {
    expect(firstNameKey("Sam Nabil (phone)")).toBe("sam");
    expect(firstNameKey("  ")).toBe("");
  });
});
