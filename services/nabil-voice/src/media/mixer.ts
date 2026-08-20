/**
 * Audio mixer — combines the AI voice stream with the ambient bed.
 *
 * `mixFrame` takes a voice buffer and a bed buffer (both PCM16), applies gain
 * and ducking to the bed, sums them, and runs a soft limiter to prevent
 * clipping. The result is a new PCM16 buffer ready for mu-law encoding.
 *
 * Ducking ramps over 50 ms (400 samples at 8 kHz) to avoid clicks when the
 * speaking state changes.
 */

/** 8 kHz sample rate — one sample = 0.125 ms. */
const SAMPLE_RATE = 8000;

/** Ramp duration for ducking transitions: 50 ms = 400 samples. */
const RAMP_SAMPLES = Math.round(0.05 * SAMPLE_RATE); // 400

/** Convert decibels to a linear gain multiplier. */
function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

/**
 * Soft limiter with a tanh-style knee above -1 dBFS.
 *
 * Below the knee (±29204, which is -1 dBFS of 32767) the sample passes
 * through linearly. Above the knee a tanh curve compresses the excess so the
 * output asymptotically approaches ±32767 but never clips.
 */
const KNEE = 29204; // ~0.8913 × 32767 ≈ -1 dBFS

function softLimit(sample: number): number {
  if (sample >= -KNEE && sample <= KNEE) return sample;
  const sign = sample > 0 ? 1 : -1;
  const abs = Math.abs(sample);
  // Compress the excess above the knee using tanh.
  const excess = (abs - KNEE) / (32767 - KNEE);
  const compressed = KNEE + (32767 - KNEE) * Math.tanh(excess);
  return sign * compressed;
}

/**
 * Per-session duck ramp state. Create one per call and pass it into every
 * `mixFrame` call so the ramp is continuous across frames.
 */
export class DuckRamp {
  /** Current duck multiplier, 0..1 where 0 = full duck, 1 = no duck. */
  current = 1;
  /** Target duck multiplier. */
  target = 1;
  /** Per-sample step towards the target. */
  step = 0;

  /** Transition to a new ducking state. Only recalculates the ramp when the
   *  target actually changes — calling with the same state is a no-op so the
   *  linear ramp continues uninterrupted across frame boundaries. */
  setDucking(isDucked: boolean, duckLinear: number): void {
    // When ducked, the bed is attenuated by duckLinear (a value < 1).
    // When not ducked, the multiplier is 1 (no extra attenuation).
    const newTarget = isDucked ? duckLinear : 1;
    if (newTarget === this.target) return; // no change — let existing ramp run
    this.target = newTarget;
    if (this.target === this.current) {
      this.step = 0;
      return;
    }
    this.step = (this.target - this.current) / RAMP_SAMPLES;
  }

  /** Advance the ramp by one sample and return the current multiplier. */
  next(): number {
    if (this.step === 0) return this.current;
    this.current += this.step;
    // Clamp and snap when we arrive.
    if ((this.step > 0 && this.current >= this.target) || (this.step < 0 && this.current <= this.target)) {
      this.current = this.target;
      this.step = 0;
    }
    return this.current;
  }
}

/**
 * Mix one frame of voice + bed audio.
 *
 * @param voice     PCM16 voice samples (may be shorter than bed or empty).
 * @param bed       PCM16 bed samples (same length as the desired output).
 * @param gainDb    Bed volume relative to voice, e.g. -20 (default).
 * @param duckDb    Additional attenuation while `isSpeaking`, e.g. -3 (default).
 * @param isSpeaking Whether the AI voice is currently active (triggers ducking).
 * @param ramp      Per-session DuckRamp state (created once per call).
 * @returns         PCM16 mixed output, same length as `bed`.
 */
export function mixFrame(
  voice: Int16Array,
  bed: Int16Array,
  gainDb: number,
  duckDb: number,
  isSpeaking: boolean,
  ramp: DuckRamp,
): Int16Array {
  const len = bed.length;
  const out = new Int16Array(len);
  const bedGain = dbToLinear(gainDb);
  const duckLinear = dbToLinear(duckDb);

  // Update the ramp target for this frame.
  ramp.setDucking(isSpeaking, duckLinear);

  for (let i = 0; i < len; i++) {
    const v = i < voice.length ? voice[i] : 0;
    const duck = ramp.next();
    const b = bed[i] * bedGain * duck;
    out[i] = Math.round(softLimit(v + b));
  }

  return out;
}
