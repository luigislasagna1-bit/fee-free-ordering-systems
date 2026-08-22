/**
 * A1b — per-store transfer policy, the one chokepoint every transfer request
 * passes through (services/nabil-voice/src/transfer-policy.ts).
 */
import { describe, expect, it } from "vitest";
import { applyTransferPolicy } from "../../../services/nabil-voice/src/transfer-policy";
import { normalizeAgentConfig } from "../../../services/nabil-voice/src/agent-config";
import { voicePhrase } from "../../../services/nabil-voice/src/voice-i18n";

const cfg = (over: Record<string, unknown> = {}) => normalizeAgentConfig({ ...over });

describe("immediate (the default — today's behaviour)", () => {
  it("puts every request through, including an unset/older config", () => {
    for (const trigger of ["caller_request", "dtmf", "struggle", "tool_failure"] as const) {
      expect(applyTransferPolicy({ cfg: cfg() }, trigger, "x").allowed).toBe(true);
    }
    expect(normalizeAgentConfig(undefined).transferPolicy).toBe("immediate");
  });
});

describe("never", () => {
  it("refuses every caller request with the localized default line and an honest instruction", () => {
    const ctx = { cfg: cfg({ transferPolicy: "never" }), language: "en-US" };
    const d = applyTransferPolicy(ctx, "caller_request", "wants a person");
    expect(d.allowed).toBe(false);
    expect(d.speakExactly).toBe(voicePhrase("en", "transferDeflect"));
    expect(d.instruction).toMatch(/never say you are connecting/i);
    expect(d.instruction).toMatch(/leave_message/);
    // asking again never changes the answer
    expect(applyTransferPolicy(ctx, "caller_request", "again").allowed).toBe(false);
    expect(applyTransferPolicy(ctx, "dtmf", "0").allowed).toBe(false);
    expect(applyTransferPolicy(ctx, "struggle", "stuck").allowed).toBe(false);
  });
  it("speaks the store's own line when set, in the caller's language otherwise", () => {
    const own = applyTransferPolicy({ cfg: cfg({ transferPolicy: "never", transferDeflectionMessage: "  Tony's is slammed — but I've got you.  " }) }, "caller_request", "x");
    expect(own.speakExactly).toBe("Tony's is slammed — but I've got you.");
    const fr = applyTransferPolicy({ cfg: cfg({ transferPolicy: "never" }), language: "fr-CA" }, "caller_request", "x");
    expect(fr.speakExactly).toBe(voicePhrase("fr", "transferDeflect"));
  });
  it("without take-a-message, points to the website instead of leave_message", () => {
    const d = applyTransferPolicy({ cfg: cfg({ transferPolicy: "never", transferTakeMessage: false }) }, "caller_request", "x");
    expect(d.instruction).not.toMatch(/leave_message/);
    expect(d.instruction).toMatch(/website/i);
  });
});

describe("reluctant", () => {
  it("deflects the first explicit ask and puts the second one through", () => {
    const ctx = { cfg: cfg({ transferPolicy: "reluctant" }) };
    const first = applyTransferPolicy(ctx, "caller_request", "person");
    expect(first.allowed).toBe(false);
    expect(first.speakExactly).toBe(voicePhrase("en", "transferDeflect"));
    expect(first.instruction).toMatch(/asks for a person AGAIN/);
    const second = applyTransferPolicy(ctx, "dtmf", "0");
    expect(second.allowed).toBe(true);
    expect(ctx.transferAsks).toBe(2);
  });
  it("a genuine struggle goes through even on the first episode", () => {
    expect(applyTransferPolicy({ cfg: cfg({ transferPolicy: "reluctant" }) }, "struggle", "stuck").allowed).toBe(true);
    expect(applyTransferPolicy({ cfg: cfg({ transferPolicy: "reluctant" }) }, "tool_failure", "place failed").allowed).toBe(true);
  });
});

describe("config normalization", () => {
  it("guards the enum, trims + caps the message, defaults take-a-message on", () => {
    const c = normalizeAgentConfig({ transferPolicy: "sometimes", transferDeflectionMessage: " hi ".padEnd(400, "x"), transferTakeMessage: "yes" });
    expect(c.transferPolicy).toBe("immediate");
    expect(c.transferDeflectionMessage!.length).toBe(300);
    expect(c.transferTakeMessage).toBe(true);
    expect(normalizeAgentConfig({ transferPolicy: "never", transferDeflectionMessage: "   " }).transferDeflectionMessage).toBeNull();
  });
});
