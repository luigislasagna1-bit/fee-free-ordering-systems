import { describe, expect, it } from "vitest";
import { isVoiceChannel, resolveVoiceLane, VOICE_CHANNELS } from "./voice-channel";

const CUR = "wss://nabil-voice.fly.dev/call";
const STG = "wss://nabil-voice-staging.fly.dev/call";

describe("resolveVoiceLane — the public line never reaches an unpromoted build", () => {
  it("default / unknown / null channel → current", () => {
    for (const requested of [undefined, null, "", "current", "canary", "STAGING", "nonsense"]) {
      expect(resolveVoiceLane({ requested, currentWss: CUR, stagingWss: STG })).toEqual({ channel: "current", wss: CUR, fellBack: false });
    }
  });
  it("staging number + staging lane configured → staging", () => {
    expect(resolveVoiceLane({ requested: "staging", currentWss: CUR, stagingWss: ` ${STG} ` })).toEqual({ channel: "staging", wss: STG, fellBack: false });
  });
  it("staging requested but no staging URL on this deployment → falls back to current, flagged", () => {
    expect(resolveVoiceLane({ requested: "staging", currentWss: CUR, stagingWss: "" })).toEqual({ channel: "current", wss: CUR, fellBack: true });
    expect(resolveVoiceLane({ requested: "staging", currentWss: CUR, stagingWss: undefined })).toEqual({ channel: "current", wss: CUR, fellBack: true });
  });
  it("no current URL at all → empty wss (the route rings the store), still current", () => {
    expect(resolveVoiceLane({ requested: "current", currentWss: "  ", stagingWss: STG })).toEqual({ channel: "current", wss: "", fellBack: false });
  });
  it("a staging-only deployment never routes a current number to staging", () => {
    expect(resolveVoiceLane({ requested: "current", currentWss: "", stagingWss: STG }).wss).toBe("");
  });
});

describe("isVoiceChannel", () => {
  it("accepts exactly the two lanes", () => {
    expect(VOICE_CHANNELS).toEqual(["current", "staging"]);
    expect(isVoiceChannel("current")).toBe(true);
    expect(isVoiceChannel("staging")).toBe(true);
    for (const bad of ["canary", "", null, undefined, 1, "Staging"]) expect(isVoiceChannel(bad)).toBe(false);
  });
});
