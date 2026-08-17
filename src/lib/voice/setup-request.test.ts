import { describe, it, expect } from "vitest";
import { parseVoiceSetupRequest, readVoiceSetupPayload, MAX_GREETING_NAME_CHARS, MAX_SETUP_NOTES_CHARS } from "./setup-request";

const good = {
  currentNumber: "(905) 555-0123",
  mode: "forward",
  transferNumber: "+1 289 409 1133",
  greetingName: "  Luigi's   Lasagna & Pizzeria ",
  notes: "  We close at 10 on Sundays.  ",
};

describe("parseVoiceSetupRequest", () => {
  it("normalises phones to E.164, collapses whitespace in the name, trims notes, lower-cases the submitter", () => {
    const r = parseVoiceSetupRequest(good, "Owner@Luigis.Test ");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({
      currentNumber: "+19055550123",
      mode: "forward",
      transferNumber: "+12894091133",
      greetingName: "Luigi's Lasagna & Pizzeria",
      notes: "We close at 10 on Sundays.",
      submittedBy: "owner@luigis.test",
    });
  });
  it("optional notes / submitter become null", () => {
    const r = parseVoiceSetupRequest({ ...good, notes: "   " });
    expect(r.ok && r.value.notes).toBeNull();
    expect(r.ok && r.value.submittedBy).toBeNull();
  });
  it("rejects a bad current number / transfer number / mode / greeting name with a code", () => {
    expect(parseVoiceSetupRequest({ ...good, currentNumber: "12" })).toEqual({ ok: false, code: "invalid_current_number" });
    expect(parseVoiceSetupRequest({ ...good, transferNumber: "" })).toEqual({ ok: false, code: "invalid_transfer_number" });
    expect(parseVoiceSetupRequest({ ...good, mode: "magic" })).toEqual({ ok: false, code: "invalid_mode" });
    expect(parseVoiceSetupRequest({ ...good, greetingName: "L" })).toEqual({ ok: false, code: "invalid_greeting_name" });
    expect(parseVoiceSetupRequest({ ...good, greetingName: "x".repeat(MAX_GREETING_NAME_CHARS + 1) })).toEqual({ ok: false, code: "invalid_greeting_name" });
    expect(parseVoiceSetupRequest(null)).toEqual({ ok: false, code: "invalid_current_number" });
    expect(parseVoiceSetupRequest("nope")).toEqual({ ok: false, code: "invalid_current_number" });
  });
  it("caps notes length", () => {
    const r = parseVoiceSetupRequest({ ...good, notes: "n".repeat(MAX_SETUP_NOTES_CHARS + 50) });
    expect(r.ok && r.value.notes?.length).toBe(MAX_SETUP_NOTES_CHARS);
  });
});

describe("readVoiceSetupPayload", () => {
  it("round-trips a stored payload and survives garbage", () => {
    const parsed = parseVoiceSetupRequest(good, "o@x.test");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(readVoiceSetupPayload(JSON.parse(JSON.stringify(parsed.value)))).toEqual(parsed.value);
    expect(readVoiceSetupPayload(null)).toBeNull();
    expect(readVoiceSetupPayload({ mode: "weird", notes: 3 })).toEqual({
      currentNumber: "",
      mode: "new",
      transferNumber: "",
      greetingName: "",
      notes: null,
      submittedBy: null,
    });
  });
});
