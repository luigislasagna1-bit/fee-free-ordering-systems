/**
 * Channel feature flags: staging sees everything, the live lane only what was
 * promoted, and the Fly copy is byte-identical to the Vercel original.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { flagOn, flagsFor, NABIL_FLAG_NAMES, parsePromotedFlags } from "./feature-flags";
import * as flyCopy from "../../../services/nabil-voice/src/feature-flags";

describe("flagsFor", () => {
  it("staging lane has every flag on regardless of the promoted list", () => {
    const f = flagsFor("staging", "");
    for (const n of NABIL_FLAG_NAMES) expect(f[n]).toBe(true);
  });
  it("current lane has nothing on by default", () => {
    const f = flagsFor("current", undefined);
    for (const n of NABIL_FLAG_NAMES) expect(f[n]).toBe(false);
    // unknown / null channels behave as current — never as staging
    for (const ch of [null, undefined, "", "canary", "STAGING"]) {
      for (const n of NABIL_FLAG_NAMES) expect(flagsFor(ch, "")[n]).toBe(false);
    }
  });
  it("promoted names switch on for current, with whitespace tolerated", () => {
    const first = NABIL_FLAG_NAMES[0];
    const second = NABIL_FLAG_NAMES[1];
    const f = flagsFor("current", ` ${first} , ${second} `);
    expect(f[first]).toBe(true);
    expect(f[second]).toBe(true);
    for (const n of NABIL_FLAG_NAMES.slice(2)) expect(f[n]).toBe(false);
    expect(flagOn(first, "current", first)).toBe(true);
    expect(flagOn(first, "current", second)).toBe(false);
  });
  it("'*' promotes everything", () => {
    const f = flagsFor("current", "*");
    for (const n of NABIL_FLAG_NAMES) expect(f[n]).toBe(true);
  });
  it("unknown names are reported and never enabled", () => {
    const p = parsePromotedFlags("typo_flag,deterministic_recap");
    expect(p.unknown).toEqual(["typo_flag"]);
    expect(p.enabled.has("deterministic_recap")).toBe(true);
    expect(p.enabled.size).toBe(1);
  });
});

describe("Fly copy parity", () => {
  it("services/nabil-voice/src/feature-flags.ts is byte-identical to the Vercel original", () => {
    const a = readFileSync(join(__dirname, "feature-flags.ts"), "utf8");
    const b = readFileSync(join(__dirname, "../../../services/nabil-voice/src/feature-flags.ts"), "utf8");
    expect(b).toBe(a);
  });
  it("and exports the same flag names", () => {
    expect(flyCopy.NABIL_FLAG_NAMES).toEqual(NABIL_FLAG_NAMES);
    expect(flyCopy.flagsFor("staging", "")).toEqual(flagsFor("staging", ""));
  });
});
