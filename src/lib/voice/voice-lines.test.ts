/**
 * describeLayers — who each fallback layer would ring for a Nabil number.
 * The Fly feed precedence MUST equal the handoff route's
 * (transferToNumber → alertPhone → phone); the Vercel safety net follows
 * twiml-safety-net.ts (env map → default). Two layers that quietly disagree is
 * the bug the superadmin page exists to make visible.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { describeLayers, voiceLinesEnv } from "./voice-lines";

const NABIL = "+13656581458";

beforeEach(() => {
  vi.stubEnv("NABIL_FALLBACK_MAP", "");
  vi.stubEnv("NABIL_FALLBACK_DEFAULT_NUMBER", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("describeLayers — Fly feed precedence", () => {
  it("transferToNumber wins over alertPhone over phone", () => {
    const row = { phoneNumber: NABIL, restaurant: { phone: "+19051110000", alertPhone: "+19052220000", voiceAgentConfig: { transferToNumber: "+19053330000" } } };
    expect(describeLayers(row).flyFeed).toEqual({ dial: "+19053330000", source: "transferToNumber" });
    row.restaurant.voiceAgentConfig.transferToNumber = "   ";
    expect(describeLayers(row).flyFeed).toEqual({ dial: "+19052220000", source: "alertPhone" });
    row.restaurant.alertPhone = null;
    expect(describeLayers(row).flyFeed).toEqual({ dial: "+19051110000", source: "phone" });
  });
  it("no number anywhere → none", () => {
    expect(describeLayers({ phoneNumber: NABIL, restaurant: { phone: null, alertPhone: "", voiceAgentConfig: null } }).flyFeed).toEqual({ dial: null, source: "none" });
    expect(describeLayers({ phoneNumber: NABIL, restaurant: null }).flyFeed).toEqual({ dial: null, source: "none" });
  });
});

describe("describeLayers — Vercel safety net", () => {
  it("nothing configured → none (apology-only)", () => {
    expect(describeLayers({ phoneNumber: NABIL, restaurant: null }).safetyNet).toEqual({ dial: null, source: "none" });
  });
  it("default number only → source NABIL_FALLBACK_DEFAULT_NUMBER", () => {
    vi.stubEnv("NABIL_FALLBACK_DEFAULT_NUMBER", "+14165550100");
    expect(describeLayers({ phoneNumber: NABIL, restaurant: null }).safetyNet).toEqual({ dial: "+14165550100", source: "NABIL_FALLBACK_DEFAULT_NUMBER" });
  });
  it("a map hit for this number wins and is labelled as the map", () => {
    vi.stubEnv("NABIL_FALLBACK_DEFAULT_NUMBER", "+14165550100");
    vi.stubEnv("NABIL_FALLBACK_MAP", JSON.stringify({ [NABIL]: "+19051112222" }));
    expect(describeLayers({ phoneNumber: NABIL, restaurant: null }).safetyNet).toEqual({ dial: "+19051112222", source: "NABIL_FALLBACK_MAP" });
    // another number falls through to the default
    expect(describeLayers({ phoneNumber: "+12895550000", restaurant: null }).safetyNet).toEqual({ dial: "+14165550100", source: "NABIL_FALLBACK_DEFAULT_NUMBER" });
  });
});

describe("voiceLinesEnv — presence only, never values", () => {
  it("reports booleans", () => {
    vi.stubEnv("FFOS_TWILIO_ACCOUNT_SID", "AC1");
    vi.stubEnv("FFOS_TWILIO_AUTH_TOKEN", "t");
    vi.stubEnv("NABIL_VOICE_WSS_URL", "wss://nabil-voice.fly.dev/call");
    const env = voiceLinesEnv();
    expect(env).toEqual({ twilioCredentials: true, fallbackMap: false, fallbackDefaultNumber: false, voiceWssUrl: true, voiceStagingWssUrl: false });
    for (const v of Object.values(env)) expect(typeof v).toBe("boolean");
  });
  it("reports the staging lane URL's presence", () => {
    vi.stubEnv("NABIL_VOICE_STAGING_WSS_URL", "wss://nabil-voice-staging.fly.dev/call");
    expect(voiceLinesEnv().voiceStagingWssUrl).toBe(true);
  });
});
