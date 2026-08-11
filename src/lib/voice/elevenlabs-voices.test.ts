import { describe, expect, it } from "vitest";
import {
  NABIL_VOICES,
  buildVoiceAttrValue,
  clampVoiceSpeed,
  isKnownVoiceId,
} from "./elevenlabs-voices";

/**
 * The ConversationRelay `voice` attribute is load-bearing: a value the provider
 * rejects kills the call before the greeting, exactly like the malformed
 * `hints` string did on 2026-08-09. These tests pin the shape.
 */
describe("clampVoiceSpeed", () => {
  it("keeps ElevenLabs' accepted 0.7–1.2 range", () => {
    expect(clampVoiceSpeed(0.5)).toBe(0.7); // our schema allows 0.5, ElevenLabs does not
    expect(clampVoiceSpeed(2)).toBe(1.2);
    expect(clampVoiceSpeed(1)).toBe(1);
    expect(clampVoiceSpeed(0.95)).toBe(0.95);
  });
  it("treats garbage as normal speed", () => {
    expect(clampVoiceSpeed(null)).toBe(1);
    expect(clampVoiceSpeed(undefined)).toBe(1);
    expect(clampVoiceSpeed(NaN)).toBe(1);
  });
});

describe("buildVoiceAttrValue", () => {
  it("emits nothing when no voice is picked — TwiML stays as it was", () => {
    expect(buildVoiceAttrValue(null, 1)).toBeNull();
    expect(buildVoiceAttrValue("", 1.2)).toBeNull();
    expect(buildVoiceAttrValue("   ", 0.8)).toBeNull();
  });

  it("emits the bare id at normal speed", () => {
    expect(buildVoiceAttrValue("21m00Tcm4TlvDq8ikWAM", 1)).toBe("21m00Tcm4TlvDq8ikWAM");
    expect(buildVoiceAttrValue("21m00Tcm4TlvDq8ikWAM", null)).toBe("21m00Tcm4TlvDq8ikWAM");
  });

  it("uses the extended id-model-speed_stability_similarity form when speed differs", () => {
    expect(buildVoiceAttrValue("21m00Tcm4TlvDq8ikWAM", 0.8)).toBe(
      "21m00Tcm4TlvDq8ikWAM-flash_v2_5-0.80_0.50_0.75",
    );
  });

  it("clamps an out-of-range stored speed rather than sending it", () => {
    expect(buildVoiceAttrValue("abc123def456ghij", 2)).toBe("abc123def456ghij-flash_v2_5-1.20_0.50_0.75");
    expect(buildVoiceAttrValue("abc123def456ghij", 0.1)).toBe("abc123def456ghij-flash_v2_5-0.70_0.50_0.75");
  });

  it("never emits a character that would break the XML attribute", () => {
    for (const v of NABIL_VOICES) {
      const out = buildVoiceAttrValue(v.id, 0.9) ?? "";
      expect(out).toMatch(/^[A-Za-z0-9_.-]+$/);
    }
  });
});

describe("NABIL_VOICES", () => {
  it("has unique ids that look like ElevenLabs ids", () => {
    const ids = NABIL_VOICES.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9]{16,32}$/);
  });
  it("recognises its own ids and rejects strangers", () => {
    expect(isKnownVoiceId(NABIL_VOICES[0].id)).toBe(true);
    expect(isKnownVoiceId("not-a-voice")).toBe(false);
    expect(isKnownVoiceId("not-a-voice", ["not-a-voice"])).toBe(true);
  });
});
