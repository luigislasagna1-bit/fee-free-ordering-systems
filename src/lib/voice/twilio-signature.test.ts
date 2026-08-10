import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  shouldEnforceTwilioSignature,
  verifyTwilioSignature,
  verifyTwilioSignatureAny,
  twilioUrlCandidates,
} from "./twilio-signature";

// Known vector straight from the Twilio security docs: auth token "12345",
// this URL + these POST params must yield this exact base64 signature.
const URL_ = "https://mycompany.com/myapp.php?foo=1&bar=2";
const PARAMS: Record<string, string> = {
  CallSid: "CA1234567890ABCDE",
  Caller: "+14158675310",
  Digits: "1234",
  From: "+14158675310",
  To: "+18005551212",
};
const EXPECTED = "GvWf1cFY/Q7PnoempGyD5oXAezc=";

const ENV_KEY = "FFOS_TWILIO_AUTH_TOKEN";
let savedToken: string | undefined;

beforeEach(() => {
  savedToken = process.env[ENV_KEY];
  process.env[ENV_KEY] = "12345";
});
afterEach(() => {
  if (savedToken === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = savedToken;
});

describe("verifyTwilioSignature", () => {
  it("accepts the Twilio docs known vector", () => {
    expect(verifyTwilioSignature(URL_, PARAMS, EXPECTED)).toBe(true);
  });

  it("rejects a tampered param value", () => {
    expect(verifyTwilioSignature(URL_, { ...PARAMS, Digits: "9999" }, EXPECTED)).toBe(false);
  });

  it("rejects an added param", () => {
    expect(verifyTwilioSignature(URL_, { ...PARAMS, Extra: "x" }, EXPECTED)).toBe(false);
  });

  it("rejects a different URL", () => {
    expect(verifyTwilioSignature("https://mycompany.com/other.php", PARAMS, EXPECTED)).toBe(false);
  });

  it("rejects when the auth token differs", () => {
    process.env[ENV_KEY] = "not-the-token";
    expect(verifyTwilioSignature(URL_, PARAMS, EXPECTED)).toBe(false);
  });

  it("rejects a missing header", () => {
    expect(verifyTwilioSignature(URL_, PARAMS, null)).toBe(false);
  });

  it("rejects a garbage header without throwing", () => {
    expect(verifyTwilioSignature(URL_, PARAMS, "!!not-base64!!")).toBe(false);
    expect(verifyTwilioSignature(URL_, PARAMS, "")).toBe(false);
  });

  it("fails closed when the token env is missing", () => {
    delete process.env[ENV_KEY];
    expect(verifyTwilioSignature(URL_, PARAMS, EXPECTED)).toBe(false);
  });

  it("handles no params (URL-only signing)", () => {
    // Signature of the bare URL — recomputed vector for token "12345".
    const sig = crypto.createHmac("sha1", "12345").update(URL_).digest("base64");
    expect(verifyTwilioSignature(URL_, {}, sig)).toBe(true);
  });
});

describe("shouldEnforceTwilioSignature", () => {
  it("is true when the token is set", () => {
    expect(shouldEnforceTwilioSignature()).toBe(true);
  });

  it("is false when the token is missing", () => {
    delete process.env[ENV_KEY];
    expect(shouldEnforceTwilioSignature()).toBe(false);
  });
});

describe("twilioUrlCandidates + verifyTwilioSignatureAny", () => {
  // Twilio signs the URL saved on the NUMBER, which may use the apex host even
  // though the request reaches us on www (or vice-versa). Both forms must pass,
  // or every genuine call 403s the moment enforcement turns on.
  const APEX = "https://mycompany.com/myapp.php?foo=1&bar=2";
  const WWW = "https://www.mycompany.com/myapp.php?foo=1&bar=2";

  it("offers the www/apex counterpart of the request URL", () => {
    expect(twilioUrlCandidates(APEX)).toContain(WWW);
    expect(twilioUrlCandidates(WWW)).toContain(APEX);
  });

  it("accepts a signature made for the apex URL when reached on www", () => {
    // Single-URL check fails; the candidate check succeeds.
    expect(verifyTwilioSignature(WWW, PARAMS, EXPECTED)).toBe(false);
    expect(verifyTwilioSignatureAny(twilioUrlCandidates(WWW), PARAMS, EXPECTED)).toBe(true);
  });

  it("still rejects a tampered body on every candidate", () => {
    expect(
      verifyTwilioSignatureAny(twilioUrlCandidates(WWW), { ...PARAMS, Digits: "9999" }, EXPECTED),
    ).toBe(false);
  });

  it("still rejects an unrelated host", () => {
    expect(
      verifyTwilioSignatureAny(twilioUrlCandidates("https://evil.example/myapp.php?foo=1&bar=2"), PARAMS, EXPECTED),
    ).toBe(false);
  });
});
