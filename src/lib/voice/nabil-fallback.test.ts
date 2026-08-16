import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Fly-side Twilio VoiceFallbackUrl handler. Tested from here for the same
 * reason cart-engine is (see cart-engine.test.ts): the release gate runs
 * `vitest run src/lib/voice`, so a service module covered here is covered by the
 * gate.
 *
 * The properties that matter are all about NOT losing the map: a failed refresh,
 * an empty answer, or an unreachable app must leave the previous numbers
 * standing, because "the app is unreachable" is the exact scenario this handler
 * exists for.
 */

// The service's CONFIG calls need() on four vars at import time. Set them before
// the module graph loads — vi.hoisted runs ahead of imports.
vi.hoisted(() => {
  process.env.APP_BASE_URL ||= "https://app.test";
  process.env.INTERNAL_API_SECRET ||= "internal-secret";
  process.env.NABIL_VOICE_JWT_SECRET ||= "jwt-secret";
  process.env.ANTHROPIC_API_KEY ||= "sk-ant-test-key";
});

import { CONFIG } from "../../../services/nabil-voice/src/config";
import {
  fallbackTwiml,
  handleFallback,
  refreshFallbackMap,
  resolveFallbackDial,
  seedFallbackMapFromEnv,
  verifyTwilioSignature,
} from "../../../services/nabil-voice/src/fallback";

const FALLBACK_URL = "https://nabil-voice.fly.dev/twiml/fallback";
const AUTH_TOKEN = "test-auth-token";

/** Twilio's scheme: base64(HMAC-SHA1(token, url + sorted key+value pairs)). */
function sign(url: string, params: Record<string, string>, token = AUTH_TOKEN): string {
  let data = url;
  for (const k of Object.keys(params).sort()) data += k + params[k];
  return crypto.createHmac("sha1", token).update(Buffer.from(data, "utf-8")).digest("base64");
}

const realFetch = globalThis.fetch;

beforeEach(() => {
  CONFIG.twilioAuthToken = "";
  CONFIG.fallbackUrl = "";
  CONFIG.fallbackMapJson = "";
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("fallbackTwiml", () => {
  it("rings the store when a number is known", () => {
    const x = fallbackTwiml("+14168338405");
    expect(x).toContain(`<Dial answerOnBridge="true" timeout="30">+14168338405</Dial>`);
    expect(x.startsWith(`<?xml version="1.0" encoding="UTF-8"?>`)).toBe(true);
  });

  it("apologises and hangs up rather than leaving the line silent", () => {
    const x = fallbackTwiml(null);
    expect(x).not.toContain("<Dial");
    expect(x).toContain("<Hangup/>");
  });

  it("escapes a number carrying TwiML metacharacters", () => {
    expect(fallbackTwiml(`+1"><Say>x</Say>`)).not.toContain("<Say>x</Say>");
  });
});

describe("the env floor", () => {
  it("resolves however the number was typed", () => {
    CONFIG.fallbackMapJson = JSON.stringify({ "+1 (289) 768-7778": "+14168338405" });
    seedFallbackMapFromEnv();
    expect(resolveFallbackDial("+12897687778")).toBe("+14168338405");
    expect(resolveFallbackDial("2897687778")).toBe("+14168338405");
  });

  it("ignores malformed JSON instead of failing to boot", () => {
    CONFIG.fallbackMapJson = "{nope";
    expect(() => seedFallbackMapFromEnv()).not.toThrow();
  });

  it("returns null for a number nobody has told us about", () => {
    expect(resolveFallbackDial("+15550001111")).toBeNull();
    expect(resolveFallbackDial("")).toBeNull();
  });
});

describe("refreshFallbackMap — last known good", () => {
  it("loads the map from the app", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ numbers: [{ to: "+15551230000", dial: "+15559990000" }] }), { status: 200 }),
    ) as unknown as typeof fetch;

    expect(await refreshFallbackMap()).toBe(true);
    expect(resolveFallbackDial("+15551230000")).toBe("+15559990000");
  });

  it("KEEPS the previous map when the app is unreachable", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;

    expect(await refreshFallbackMap()).toBe(false);
    // The number loaded by the previous test must survive — this is the whole
    // point of the handler, since an unreachable app is why Twilio called it.
    expect(resolveFallbackDial("+15551230000")).toBe("+15559990000");
  });

  it("KEEPS the previous map on a non-2xx", async () => {
    globalThis.fetch = vi.fn(async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    expect(await refreshFallbackMap()).toBe(false);
    expect(resolveFallbackDial("+15551230000")).toBe("+15559990000");
  });

  it("treats an EMPTY answer as a broken query, not as a platform with no phones", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ numbers: [] }), { status: 200 }),
    ) as unknown as typeof fetch;

    expect(await refreshFallbackMap()).toBe(false);
    expect(resolveFallbackDial("+15551230000")).toBe("+15559990000");
  });
});

describe("verifyTwilioSignature", () => {
  it("accepts a correctly signed request", () => {
    CONFIG.twilioAuthToken = AUTH_TOKEN;
    CONFIG.fallbackUrl = FALLBACK_URL;
    const params = { To: "+12897687778", From: "+14165551234", CallSid: "CA1" };
    expect(verifyTwilioSignature(params, sign(FALLBACK_URL, params))).toBe(true);
  });

  it("rejects a tampered parameter, a wrong token, and a missing header", () => {
    CONFIG.twilioAuthToken = AUTH_TOKEN;
    CONFIG.fallbackUrl = FALLBACK_URL;
    const params = { To: "+12897687778", From: "+14165551234" };
    const good = sign(FALLBACK_URL, params);

    expect(verifyTwilioSignature({ ...params, To: "+15559999999" }, good)).toBe(false);
    expect(verifyTwilioSignature(params, sign(FALLBACK_URL, params, "other-token"))).toBe(false);
    expect(verifyTwilioSignature(params, null)).toBe(false);
    expect(verifyTwilioSignature(params, "short")).toBe(false);
  });

  it("verifies against the CONFIGURED url, never a reconstructed one", () => {
    CONFIG.twilioAuthToken = AUTH_TOKEN;
    CONFIG.fallbackUrl = FALLBACK_URL;
    const params = { To: "+12897687778" };
    expect(verifyTwilioSignature(params, sign("https://other.host/twiml/fallback", params))).toBe(false);
  });

  it("degrades to open (with a warning) when no token is configured, so a dev deploy still answers", () => {
    expect(verifyTwilioSignature({ To: "+1" }, null)).toBe(true);
  });
});

describe("handleFallback", () => {
  beforeEach(() => {
    CONFIG.fallbackMapJson = JSON.stringify({ "+12897687778": "+14168338405" });
    seedFallbackMapFromEnv();
  });

  it("dials the store for a signed request", () => {
    CONFIG.twilioAuthToken = AUTH_TOKEN;
    CONFIG.fallbackUrl = FALLBACK_URL;
    const params = { To: "+12897687778", From: "+14165551234" };
    const body = new URLSearchParams(params).toString();

    const out = handleFallback(body, sign(FALLBACK_URL, params));
    expect(out.status).toBe(200);
    expect(out.xml).toContain("+14168338405");
  });

  it("403s an unsigned request rather than dialing a real phone for anyone who asks", () => {
    CONFIG.twilioAuthToken = AUTH_TOKEN;
    CONFIG.fallbackUrl = FALLBACK_URL;
    const out = handleFallback("To=%2B12897687778", null);
    expect(out.status).toBe(403);
    expect(out.xml).not.toContain("+14168338405");
  });

  it("still answers with valid TwiML for a malformed body", () => {
    const out = handleFallback("", null);
    expect(out.status).toBe(200);
    expect(out.xml).toContain("<Response>");
    expect(out.xml).toContain("<Hangup/>");
  });
});
