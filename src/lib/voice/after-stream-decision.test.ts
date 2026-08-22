import { describe, expect, it } from "vitest";
import { HANGUP_REASONS, decideAfterStream } from "./after-stream-decision";

describe("decideAfterStream", () => {
  it("time limit → goodbye + hangup regardless of flags", () => {
    expect(decideAfterStream({ reason: "call_time_limit", rowExists: true, decisionTableOn: false })).toEqual({ action: "hangup_time_limit" });
  });
  it("spam/IVR → polite hangup", () => {
    expect(decideAfterStream({ reason: "spam", rowExists: true, decisionTableOn: true })).toEqual({ action: "hangup_spam" });
  });
  it("no_input (A4: the silent line Nabil already said goodbye to) → hangup, never the store", () => {
    expect(decideAfterStream({ reason: "no_input", rowExists: true, decisionTableOn: true })).toEqual({ action: "hangup_no_input" });
    expect(decideAfterStream({ reason: "no_input", rowExists: true, decisionTableOn: false })).toEqual({ action: "hangup_no_input" });
    // Every hangup reason is known to the dashboard so it never draws a transfer arrow for one.
    for (const r of ["call_time_limit", "spam", "no_input"]) expect(HANGUP_REASONS.has(r)).toBe(true);
    expect(HANGUP_REASONS.has("caller asked for a person")).toBe(false);
  });
  it("any other reason → dial the store", () => {
    for (const reason of ["caller asked for a person", "agent struggling (3 failed attempts)", "pipeline_failed", "service_restart"]) {
      expect(decideAfterStream({ reason, rowExists: true, decisionTableOn: false })).toEqual({ action: "dial_store", why: "transfer" });
    }
  });
  it("no row at all → the stream never established → ConversationRelay fallback", () => {
    expect(decideAfterStream({ reason: "", rowExists: false, decisionTableOn: true })).toEqual({ action: "relay_fallback", why: "no_row" });
  });
  it("row but no reason: flag on → ring the store (stream died); flag off → legacy relay fallback", () => {
    expect(decideAfterStream({ reason: "", rowExists: true, decisionTableOn: true })).toEqual({ action: "dial_store", why: "stream_died" });
    expect(decideAfterStream({ reason: "  ", rowExists: true, decisionTableOn: false })).toEqual({ action: "relay_fallback", why: "legacy_no_reason" });
  });
});
