import { describe, expect, it } from "vitest";
import {
  FIRST_RERING_GRACE_MS,
  ROUND2_BLEED_TOLERANCE_MS,
  SECOND_FIRE_DELAY_MS,
  arrivalSoundMayStillPlay,
  roundTwoFits,
  roundTwoSendDeadline,
} from "./ios-ring-timing";

const NOW = 1_800_000_000_000;
const d = (agoMs: number) => new Date(NOW - agoMs);

describe("arrivalSoundMayStillPlay", () => {
  it("gates a just-arrived order (arrival .caf still playing)", () => {
    expect(arrivalSoundMayStillPlay(null, d(0), NOW)).toBe(true);
    expect(arrivalSoundMayStillPlay(null, d(2_600), NOW)).toBe(true); // Fabrizio's video: re-ring landed 2.6s after arrival
    expect(arrivalSoundMayStillPlay(null, d(FIRST_RERING_GRACE_MS - 1), NOW)).toBe(true);
  });

  it("stops gating once the arrival sound has (nearly) finished", () => {
    expect(arrivalSoundMayStillPlay(null, d(FIRST_RERING_GRACE_MS), NOW)).toBe(false);
    expect(arrivalSoundMayStillPlay(null, d(60_000), NOW)).toBe(false);
  });

  it("never gates a deferred (closed-placed) item — the cron IS its first ring", () => {
    // alertAt set → no arrival push ever played, regardless of how fresh.
    expect(arrivalSoundMayStillPlay(d(0), d(0), NOW)).toBe(false);
    expect(arrivalSoundMayStillPlay(d(5_000), d(3_600_000), NOW)).toBe(false);
  });

  it("treats a missing arrival stamp as not-gated (cron query requires it anyway)", () => {
    expect(arrivalSoundMayStillPlay(null, null, NOW)).toBe(false);
  });
});

describe("roundTwoFits", () => {
  it("fires round 2 for fast and moderately slow round 1s", () => {
    expect(roundTwoFits(0)).toBe(true);
    expect(roundTwoFits(2_000)).toBe(true); // the old fa1328ad limit
    expect(roundTwoFits(ROUND2_BLEED_TOLERANCE_MS + 2_000)).toBe(true); // 5s: typical cold start now passes
  });

  it("still skips round 2 when the projected audio end bleeds too far", () => {
    expect(roundTwoFits(ROUND2_BLEED_TOLERANCE_MS + 2_001)).toBe(false);
    expect(roundTwoFits(20_000)).toBe(false);
  });
});

describe("roundTwoSendDeadline", () => {
  it("caps round-2 sends at invocation start + fire delay + bleed tolerance", () => {
    expect(roundTwoSendDeadline(NOW)).toBe(NOW + SECOND_FIRE_DELAY_MS + ROUND2_BLEED_TOLERANCE_MS);
    // A round 2 whose queries finish inside the tolerance may send…
    expect(NOW + SECOND_FIRE_DELAY_MS + 2_500).toBeLessThanOrEqual(roundTwoSendDeadline(NOW));
    // …one that slipped further must drop its sends (bounded gap over stacking).
    expect(NOW + SECOND_FIRE_DELAY_MS + 3_500).toBeGreaterThan(roundTwoSendDeadline(NOW));
  });
});
