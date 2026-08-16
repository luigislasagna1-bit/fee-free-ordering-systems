import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isE164,
  voiceConfigDrift,
  voiceFallbackUrl,
  voiceWebhookUrl,
  type NumberConfig,
} from "./twilio-number-config";

/**
 * The pure half of the number-config module. The webhook URL has to be
 * byte-identical to what twilio-signature.ts verifies against — a drift of one
 * slash 403s every inbound call — and the drift detector is what decides
 * whether we write to Twilio at all.
 */

const ENV_KEYS = ["NEXT_PUBLIC_APP_URL", "NABIL_VOICE_WSS_URL", "NABIL_VOICE_FALLBACK_URL"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("isE164", () => {
  it("accepts a real number and rejects the shapes people actually paste", () => {
    expect(isE164("+12897687778")).toBe(true);
    expect(isE164("  +12897687778  ")).toBe(true);
    expect(isE164("2897687778")).toBe(false);
    expect(isE164("+1 289 768 7778")).toBe(false);
    expect(isE164("+0123456789")).toBe(false);
    expect(isE164("")).toBe(false);
  });
});

describe("voiceWebhookUrl", () => {
  it("uses the real domain when NEXT_PUBLIC_APP_URL is a dev localhost", () => {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3001";
    expect(voiceWebhookUrl()).toBe("https://feefreeordering.com/api/twilio/voice");
  });

  it("has no trailing slash and no double slash — the signature is over this exact string", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://feefreeordering.com/";
    expect(voiceWebhookUrl()).toBe("https://feefreeordering.com/api/twilio/voice");
  });
});

describe("voiceFallbackUrl", () => {
  it("derives the Fly host from the websocket URL — a different provider from the primary", () => {
    process.env.NABIL_VOICE_WSS_URL = "wss://nabil-voice.fly.dev/call";
    expect(voiceFallbackUrl()).toBe("https://nabil-voice.fly.dev/twiml/fallback");
  });

  it("keeps a plain-ws host on http (local voice service)", () => {
    process.env.NABIL_VOICE_WSS_URL = "ws://localhost:8080/call";
    expect(voiceFallbackUrl()).toBe("http://localhost:8080/twiml/fallback");
  });

  it("prefers an explicit override", () => {
    process.env.NABIL_VOICE_WSS_URL = "wss://nabil-voice.fly.dev/call";
    process.env.NABIL_VOICE_FALLBACK_URL = "https://elsewhere.example/twiml/";
    expect(voiceFallbackUrl()).toBe("https://elsewhere.example/twiml");
  });

  it("returns null rather than a guess when there is no host to derive from", () => {
    expect(voiceFallbackUrl()).toBeNull();
    process.env.NABIL_VOICE_WSS_URL = "not a url";
    expect(voiceFallbackUrl()).toBeNull();
  });
});

describe("voiceConfigDrift", () => {
  const base: NumberConfig = {
    sid: "PN123",
    phoneNumber: "+12897687778",
    voiceUrl: "https://feefreeordering.com/api/twilio/voice",
    voiceMethod: "POST",
    voiceFallbackUrl: "https://nabil-voice.fly.dev/twiml/fallback",
    voiceFallbackMethod: "POST",
    friendlyName: "Nabil",
  };
  const want = {
    voiceUrl: "https://feefreeordering.com/api/twilio/voice",
    voiceFallbackUrl: "https://nabil-voice.fly.dev/twiml/fallback",
  };

  it("reports nothing for an already-correct number, so we never write pointlessly", () => {
    expect(voiceConfigDrift(base, want)).toEqual([]);
  });

  it("catches the case that takes the line dead — a stale primary URL", () => {
    expect(voiceConfigDrift({ ...base, voiceUrl: "https://www.feefreeordering.com/api/twilio/voice" }, want))
      .toEqual(["VoiceUrl"]);
  });

  it("catches an unset fallback — the hole that produced dead air", () => {
    expect(voiceConfigDrift({ ...base, voiceFallbackUrl: null, voiceFallbackMethod: null }, want))
      .toEqual(["VoiceFallbackUrl", "VoiceFallbackMethod"]);
  });

  it("catches a GET method (Twilio drops the form body, so `To` never arrives)", () => {
    expect(voiceConfigDrift({ ...base, voiceMethod: "GET" }, want)).toEqual(["VoiceMethod"]);
  });

  it("leaves Twilio's fallback alone when we have none to offer, rather than clearing a good one", () => {
    const drift = voiceConfigDrift(
      { ...base, voiceFallbackUrl: "https://someone-elses-twiml-bin", voiceFallbackMethod: "POST" },
      { voiceUrl: want.voiceUrl, voiceFallbackUrl: null },
    );
    expect(drift).toEqual([]);
  });
});
