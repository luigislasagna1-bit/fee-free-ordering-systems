import { describe, it, expect } from "vitest";
import { bareHost, hostCandidates } from "./host-candidates";

describe("bareHost", () => {
  it("lowercases + trims", () => {
    expect(bareHost("  LuiGis.COM ")).toBe("luigis.com");
  });
  it("strips a leading www.", () => {
    expect(bareHost("www.luigis.com")).toBe("luigis.com");
  });
  it("strips protocol, path and port (pasted URLs)", () => {
    expect(bareHost("https://www.luigis.com/order/x?a=1")).toBe("luigis.com");
    expect(bareHost("luigis.com:3001")).toBe("luigis.com");
  });
  it("only strips the FIRST www label", () => {
    expect(bareHost("www.www.luigis.com")).toBe("www.luigis.com");
  });
  it("leaves a non-www subdomain alone", () => {
    expect(bareHost("order.luigis.com")).toBe("order.luigis.com");
  });
});

describe("hostCandidates — the identity the resolver and the claim checks MUST share", () => {
  it("apex and www collapse to the same candidate set", () => {
    const fromApex = hostCandidates("luigis.com");
    const fromWww = hostCandidates("www.luigis.com");
    expect(new Set(fromApex)).toEqual(new Set(fromWww));
  });

  it("includes both spellings", () => {
    expect(new Set(hostCandidates("luigis.com"))).toEqual(new Set(["luigis.com", "www.luigis.com"]));
  });

  it("de-duplicates", () => {
    expect(hostCandidates("luigis.com")).toHaveLength(2);
    expect(hostCandidates("www.luigis.com")).toHaveLength(2);
  });

  it("empty / junk input yields no candidates (never matches everything)", () => {
    expect(hostCandidates("")).toEqual([]);
    expect(hostCandidates("   ")).toEqual([]);
  });

  it("REGRESSION (2026-07-30 hijack): a www claim cannot slip past an apex claim", () => {
    // The vulnerable version compared exact strings, so "www.victim.com" did
    // not clash with a stored "victim.com" — but the resolver matched both,
    // letting the attacker's tenant answer for the victim's domain.
    const attackerClaim = hostCandidates("www.victim.com");
    expect(attackerClaim).toContain("victim.com");
    const victimStored = "victim.com";
    expect(attackerClaim.includes(victimStored)).toBe(true);
  });

  it("a subdomain is NOT confused with its apex", () => {
    expect(hostCandidates("order.luigis.com")).not.toContain("luigis.com");
  });
});
