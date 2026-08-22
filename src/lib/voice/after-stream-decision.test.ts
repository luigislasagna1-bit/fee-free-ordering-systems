import { describe, expect, it } from "vitest";
import { decideAfterStream } from "./after-stream-decision";

describe("decideAfterStream", () => {
  it("time limit → goodbye + hangup regardless of flags", () => {
    expect(decideAfterStream({ reason: "call_time_limit", rowExists: true, decisionTableOn: false })).toEqual({ action: "hangup_time_limit" });
  });
  it("spam/IVR → polite hangup", () => {
    expect(decideAfterStream({ reason: "spam", rowExists: true, decisionTableOn: true })).toEqual({ action: "hangup_spam" });
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
