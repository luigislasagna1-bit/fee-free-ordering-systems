/**
 * Mixer tests — gain, ducking ramps, soft limiter, silence.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mixFrame, DuckRamp } from "../mixer";

/** Helper: RMS of a PCM16 buffer in dBFS. */
function rmsDbfs(buf: Int16Array): number {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  const rms = Math.sqrt(sum / buf.length);
  return 20 * Math.log10(rms / 32767);
}

/** Helper: create a constant-amplitude tone buffer. */
function constantTone(length: number, amplitude: number): Int16Array {
  const out = new Int16Array(length);
  for (let i = 0; i < length; i++) {
    out[i] = Math.round(amplitude * Math.sin((2 * Math.PI * 400 * i) / 8000));
  }
  return out;
}

describe("mixer", () => {
  describe("gain", () => {
    it("applies bed gain correctly", () => {
      const voice = new Int16Array(160); // silence
      const bed = constantTone(160, 10000); // strong bed
      const ramp = new DuckRamp();

      // -20 dB = factor of 0.1 — the bed should be ~10× quieter.
      const mixed = mixFrame(voice, bed, -20, -3, false, ramp);
      const bedRms = rmsDbfs(bed);
      const mixRms = rmsDbfs(mixed);

      // Mixed should be about 20 dB below the raw bed (±2 dB tolerance for
      // the soft limiter and quantization).
      assert.ok(
        Math.abs(mixRms - (bedRms - 20)) < 2,
        `Expected ~${bedRms - 20} dBFS, got ${mixRms} dBFS`,
      );
    });

    it("0 dB gain passes bed through at full volume", () => {
      const voice = new Int16Array(160);
      const bed = constantTone(160, 5000);
      const ramp = new DuckRamp();

      const mixed = mixFrame(voice, bed, 0, 0, false, ramp);
      const bedRms = rmsDbfs(bed);
      const mixRms = rmsDbfs(mixed);

      assert.ok(Math.abs(mixRms - bedRms) < 1, `Expected ~${bedRms} dBFS, got ${mixRms} dBFS`);
    });
  });

  describe("ducking", () => {
    it("ducks the bed when speaking", () => {
      const voice = constantTone(160, 15000);
      const bed = constantTone(160, 10000);
      const rampSpeaking = new DuckRamp();
      const rampSilent = new DuckRamp();

      // Both start at "not ducked" (ramp.current = 1).
      const mixedSpeaking = mixFrame(voice, bed, -10, -6, true, rampSpeaking);
      const mixedSilent = mixFrame(voice, bed, -10, -6, false, rampSilent);

      // The speaking mix should have a lower bed contribution than the silent
      // mix. We can't compare total RMS easily because voice dominates, but
      // the duck ramp's target should have moved.
      assert.ok(rampSpeaking.target < rampSilent.target, "Duck ramp should have a lower target when speaking");
    });

    it("ramps smoothly over multiple frames", () => {
      const ramp = new DuckRamp();
      // Start unducked (current = 1), then ask for ducking.
      const voice = constantTone(160, 10000);
      const bed = constantTone(160, 10000);

      // First frame: start ducking.
      mixFrame(voice, bed, -10, -6, true, ramp);
      const afterFirst = ramp.current;

      // The ramp should have moved TOWARD the target but not reached it
      // (160 samples < 400 ramp samples).
      assert.ok(afterFirst < 1, "Ramp should have started moving");
      assert.ok(afterFirst > ramp.target, "Ramp should not have reached target in 160 samples");

      // After 3 more frames (total 640 samples > 400 ramp), it should be at target.
      mixFrame(voice, bed, -10, -6, true, ramp);
      mixFrame(voice, bed, -10, -6, true, ramp);
      assert.equal(ramp.current, ramp.target);
    });
  });

  describe("soft limiter", () => {
    it("prevents output from exceeding ±32767", () => {
      // Loud voice + loud bed with 0 dB gain — should clip without the limiter.
      const voice = constantTone(160, 30000);
      const bed = constantTone(160, 30000);
      const ramp = new DuckRamp();

      const mixed = mixFrame(voice, bed, 0, 0, false, ramp);

      for (let i = 0; i < mixed.length; i++) {
        assert.ok(
          mixed[i] >= -32767 && mixed[i] <= 32767,
          `Sample ${i} out of range: ${mixed[i]}`,
        );
      }
    });

    it("passes through quiet signals unchanged", () => {
      // Below the -1 dBFS knee, the limiter is transparent.
      const voice = constantTone(160, 1000);
      const bed = constantTone(160, 500);
      const ramp = new DuckRamp();

      const mixed = mixFrame(voice, bed, 0, 0, false, ramp);

      // Sum should be close to voice + bed (both well below the knee).
      for (let i = 0; i < mixed.length; i++) {
        const expected = voice[i] + bed[i];
        assert.ok(
          Math.abs(mixed[i] - expected) <= 1,
          `Sample ${i}: expected ${expected}, got ${mixed[i]}`,
        );
      }
    });
  });

  describe("voice shorter than bed", () => {
    it("fills missing voice samples with silence", () => {
      const voice = constantTone(80, 10000); // half frame
      const bed = constantTone(160, 5000);
      const ramp = new DuckRamp();

      const mixed = mixFrame(voice, bed, -20, -3, false, ramp);
      assert.equal(mixed.length, 160);

      // The second half should be bed-only (attenuated).
      // The first half should be louder (voice + attenuated bed).
      const firstHalfRms = rmsDbfs(mixed.subarray(0, 80));
      const secondHalfRms = rmsDbfs(mixed.subarray(80, 160));
      assert.ok(
        firstHalfRms > secondHalfRms,
        `First half (${firstHalfRms} dBFS) should be louder than second half (${secondHalfRms} dBFS)`,
      );
    });
  });

  describe("empty voice", () => {
    it("outputs bed-only when voice is empty", () => {
      const voice = new Int16Array(0);
      const bed = constantTone(160, 5000);
      const ramp = new DuckRamp();

      const mixed = mixFrame(voice, bed, -10, 0, false, ramp);
      assert.equal(mixed.length, 160);
      // Should be non-silent (the bed is playing).
      const rms = rmsDbfs(mixed);
      assert.ok(rms > -60, `Expected audible bed, got ${rms} dBFS`);
    });
  });
});
