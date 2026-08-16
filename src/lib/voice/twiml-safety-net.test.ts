import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { _resetLearnedFallbacks, rememberFallbackNumber, resolveFallbackNumber, safetyNetTwiml, safetyNetTwimlBody } from "./twiml-safety-net";

/**
 * The safety net is what runs when the normal voice path already threw, so the
 * two properties that matter are: it always yields valid TwiML, and it can do
 * that without touching anything that could itself be the thing that's broken.
 */

const STORE = "+14168338405";
const NABIL_NUMBER = "+12897687778";

let savedMap: string | undefined;
let savedDefault: string | undefined;

beforeEach(() => {
  savedMap = process.env.NABIL_FALLBACK_MAP;
  savedDefault = process.env.NABIL_FALLBACK_DEFAULT_NUMBER;
  delete process.env.NABIL_FALLBACK_MAP;
  delete process.env.NABIL_FALLBACK_DEFAULT_NUMBER;
});

afterEach(() => {
  if (savedMap === undefined) delete process.env.NABIL_FALLBACK_MAP;
  else process.env.NABIL_FALLBACK_MAP = savedMap;
  if (savedDefault === undefined) delete process.env.NABIL_FALLBACK_DEFAULT_NUMBER;
  else process.env.NABIL_FALLBACK_DEFAULT_NUMBER = savedDefault;
});

describe("resolveFallbackNumber", () => {
  it("maps a dialed Nabil number to the store's own phone", () => {
    process.env.NABIL_FALLBACK_MAP = JSON.stringify({ [NABIL_NUMBER]: STORE });
    expect(resolveFallbackNumber(NABIL_NUMBER)).toBe(STORE);
  });

  it("matches whatever shape the map was hand-typed in", () => {
    // The map is maintained by a person at provisioning time; a stray space or
    // a missing +1 must not silently disable the fallback.
    process.env.NABIL_FALLBACK_MAP = JSON.stringify({ "+1 (289) 768-7778": STORE });
    expect(resolveFallbackNumber(NABIL_NUMBER)).toBe(STORE);
    expect(resolveFallbackNumber("2897687778")).toBe(STORE);
    expect(resolveFallbackNumber("1-289-768-7778")).toBe(STORE);
  });

  it("falls back to the catch-all for a number provisioned since the map was written", () => {
    process.env.NABIL_FALLBACK_MAP = JSON.stringify({ "+15550001111": "+15550002222" });
    process.env.NABIL_FALLBACK_DEFAULT_NUMBER = STORE;
    expect(resolveFallbackNumber(NABIL_NUMBER)).toBe(STORE);
  });

  it("prefers the mapped number over the catch-all", () => {
    process.env.NABIL_FALLBACK_MAP = JSON.stringify({ [NABIL_NUMBER]: STORE });
    process.env.NABIL_FALLBACK_DEFAULT_NUMBER = "+15559999999";
    expect(resolveFallbackNumber(NABIL_NUMBER)).toBe(STORE);
  });

  it("uses a number the healthy path taught it, per store, when the env map has no entry (Luigi: no platform-wide catch-all)", () => {
    _resetLearnedFallbacks();
    rememberFallbackNumber(NABIL_NUMBER, STORE);
    rememberFallbackNumber("+15550001111", "+15550002222");
    expect(resolveFallbackNumber(NABIL_NUMBER)).toBe(STORE);
    expect(resolveFallbackNumber("+15550001111")).toBe("+15550002222");
    // an unknown number still has nothing to ring — never another store's phone
    expect(resolveFallbackNumber("+15557778888")).toBeNull();
    // the operator's env map wins over what was learned; the learned number wins over the catch-all
    process.env.NABIL_FALLBACK_MAP = JSON.stringify({ [NABIL_NUMBER]: "+15551230000" });
    process.env.NABIL_FALLBACK_DEFAULT_NUMBER = "+15559999999";
    expect(resolveFallbackNumber(NABIL_NUMBER)).toBe("+15551230000");
    expect(resolveFallbackNumber("+15550001111")).toBe("+15550002222");
    // blanks teach nothing
    rememberFallbackNumber("+15550003333", "   ");
    expect(resolveFallbackNumber("+15550003333")).toBe("+15559999999");
    _resetLearnedFallbacks();
  });

  it("returns null when there is genuinely nothing to ring", () => {
    _resetLearnedFallbacks();
    expect(resolveFallbackNumber(NABIL_NUMBER)).toBeNull();
    expect(resolveFallbackNumber(undefined)).toBeNull();
    expect(resolveFallbackNumber("")).toBeNull();
  });

  it("survives a malformed map instead of throwing inside a catch block", () => {
    process.env.NABIL_FALLBACK_MAP = "{not json";
    process.env.NABIL_FALLBACK_DEFAULT_NUMBER = STORE;
    expect(resolveFallbackNumber(NABIL_NUMBER)).toBe(STORE);
  });

  it("ignores a map of the wrong shape (array, or non-string values)", () => {
    process.env.NABIL_FALLBACK_DEFAULT_NUMBER = STORE;
    process.env.NABIL_FALLBACK_MAP = JSON.stringify([NABIL_NUMBER, STORE]);
    expect(resolveFallbackNumber(NABIL_NUMBER)).toBe(STORE);
    process.env.NABIL_FALLBACK_MAP = JSON.stringify({ [NABIL_NUMBER]: 4168338405 });
    expect(resolveFallbackNumber(NABIL_NUMBER)).toBe(STORE);
  });

  it("re-parses when the env value changes rather than serving a stale memo", () => {
    process.env.NABIL_FALLBACK_MAP = JSON.stringify({ [NABIL_NUMBER]: STORE });
    expect(resolveFallbackNumber(NABIL_NUMBER)).toBe(STORE);
    process.env.NABIL_FALLBACK_MAP = JSON.stringify({ [NABIL_NUMBER]: "+15551234567" });
    expect(resolveFallbackNumber(NABIL_NUMBER)).toBe("+15551234567");
  });
});

describe("safetyNetTwimlBody", () => {
  it("rings the store when it knows the number", () => {
    process.env.NABIL_FALLBACK_MAP = JSON.stringify({ [NABIL_NUMBER]: STORE });
    const body = safetyNetTwimlBody(NABIL_NUMBER);
    expect(body).toContain(`<Dial answerOnBridge="true" timeout="30">${STORE}</Dial>`);
    expect(body).toMatch(/^<Response>/);
    expect(body).toMatch(/<\/Response>$/);
  });

  it("apologises and hangs up rather than dead-air when it knows no number", () => {
    const body = safetyNetTwimlBody(NABIL_NUMBER);
    expect(body).not.toContain("<Dial");
    expect(body).toContain("<Hangup/>");
    expect(body).toContain("<Say");
  });

  it("escapes a number containing TwiML metacharacters", () => {
    process.env.NABIL_FALLBACK_DEFAULT_NUMBER = `+1416"><Say>pwned</Say>`;
    const body = safetyNetTwimlBody(NABIL_NUMBER);
    expect(body).not.toContain("<Say>pwned</Say>");
    expect(body).toContain("&quot;&gt;&lt;Say&gt;");
  });
});

describe("safetyNetTwiml", () => {
  it("answers 200 with XML — a non-2xx would make Twilio play its error tone", async () => {
    process.env.NABIL_FALLBACK_MAP = JSON.stringify({ [NABIL_NUMBER]: STORE });
    const res = safetyNetTwiml(NABIL_NUMBER);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/xml; charset=utf-8");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const text = await res.text();
    expect(text.startsWith(`<?xml version="1.0" encoding="UTF-8"?>`)).toBe(true);
    expect(text).toContain(STORE);
  });

  it("still returns valid TwiML with no configuration at all", async () => {
    const text = await safetyNetTwiml(undefined).text();
    expect(text).toContain("<Response>");
    expect(text).toContain("<Hangup/>");
  });
});

describe("the module's import graph", () => {
  it("imports nothing — Prisma being unreachable is why this file runs", () => {
    // If this ever fails, do not "fix" it by mocking the import in the test.
    // The point is that the last-resort path cannot depend on the database, the
    // entitlement cache, or anything that transitively pulls one in.
    const src = readFileSync(new URL("./twiml-safety-net.ts", import.meta.url), "utf8");
    const imports = src.match(/^\s*import\s.+$/gm) ?? [];
    expect(imports).toEqual([]);
    expect(src).not.toMatch(/\brequire\s*\(/);
  });
});
