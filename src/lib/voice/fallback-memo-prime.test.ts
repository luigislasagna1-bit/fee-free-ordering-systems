/**
 * primeFallbackNumbers — the no-DB safety net learns EVERY store's own number
 * from the database on the healthy path (Luigi 2026-08-16: "this number may be
 * different for each restaurant … set it up that way"). Per store, from each
 * restaurant's settings; throttled; never throws.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({ prismaMock: { voiceNumber: { findMany: vi.fn() } } }));
vi.mock("@/lib/db", () => ({ default: prismaMock }));

import { PRIME_INTERVAL_MS, _resetFallbackPrime, primeFallbackNumbers, storeFallbackDial } from "./fallback-memo-prime";
import { _resetLearnedFallbacks, resolveFallbackNumber } from "./twiml-safety-net";

beforeEach(() => {
  vi.clearAllMocks();
  _resetFallbackPrime();
  _resetLearnedFallbacks();
  vi.stubEnv("NABIL_FALLBACK_MAP", "");
  vi.stubEnv("NABIL_FALLBACK_DEFAULT_NUMBER", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("storeFallbackDial — same precedence as the handoff route and the Fly feed", () => {
  it("transferToNumber → alertPhone → phone, blanks skipped, none → null", () => {
    expect(storeFallbackDial({ phone: "905", alertPhone: "289", voiceAgentConfig: { transferToNumber: "416" } })).toBe("416");
    expect(storeFallbackDial({ phone: "905", alertPhone: "289", voiceAgentConfig: { transferToNumber: "  " } })).toBe("289");
    expect(storeFallbackDial({ phone: "905", alertPhone: null, voiceAgentConfig: null })).toBe("905");
    expect(storeFallbackDial({ phone: " ", alertPhone: "", voiceAgentConfig: null })).toBeNull();
    expect(storeFallbackDial(null)).toBeNull();
  });
});

describe("primeFallbackNumbers", () => {
  it("teaches the safety net one number per store, from that store's own settings", async () => {
    prismaMock.voiceNumber.findMany.mockResolvedValue([
      { phoneNumber: "+13656581458", restaurant: { phone: "905-385-4444", alertPhone: "2894091133", voiceAgentConfig: { transferToNumber: null } } },
      { phoneNumber: "+12895550000", restaurant: { phone: "+19051112222", alertPhone: null, voiceAgentConfig: { transferToNumber: "+14165550000" } } },
      { phoneNumber: "+15550009999", restaurant: { phone: null, alertPhone: null, voiceAgentConfig: null } }, // nothing to ring → skipped
    ]);
    expect(await primeFallbackNumbers(1_000_000)).toBe(2);
    expect(resolveFallbackNumber("+13656581458")).toBe("2894091133");
    expect(resolveFallbackNumber("+12895550000")).toBe("+14165550000");
    expect(resolveFallbackNumber("+15550009999")).toBeNull(); // never another store's phone
    expect(prismaMock.voiceNumber.findMany).toHaveBeenCalledTimes(1);
    const where = prismaMock.voiceNumber.findMany.mock.calls[0][0].where;
    expect(where).toEqual({ status: { not: "released" } });
  });

  it("is throttled: a second call inside the interval does not hit the database; after it, it does", async () => {
    prismaMock.voiceNumber.findMany.mockResolvedValue([]);
    await primeFallbackNumbers(1_000_000);
    expect(await primeFallbackNumbers(1_000_000 + PRIME_INTERVAL_MS - 1)).toBe(0);
    expect(prismaMock.voiceNumber.findMany).toHaveBeenCalledTimes(1);
    await primeFallbackNumbers(1_000_000 + PRIME_INTERVAL_MS + 1);
    expect(prismaMock.voiceNumber.findMany).toHaveBeenCalledTimes(2);
  });

  it("never throws when the database fails, and retries on the next call", async () => {
    prismaMock.voiceNumber.findMany.mockRejectedValueOnce(new Error("db down"));
    await expect(primeFallbackNumbers(1_000_000)).resolves.toBe(0);
    prismaMock.voiceNumber.findMany.mockResolvedValueOnce([
      { phoneNumber: "+13656581458", restaurant: { phone: "905", alertPhone: null, voiceAgentConfig: null } },
    ]);
    expect(await primeFallbackNumbers(1_000_001)).toBe(1); // the failure did not arm the throttle
  });
});
