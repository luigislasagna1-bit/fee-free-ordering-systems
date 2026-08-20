/**
 * G.711 mu-law encode/decode — ITU-T standard tables for 8-bit companded audio.
 *
 * Twilio Media Streams sends and expects mu-law (audio/x-mulaw, 8 kHz mono).
 * The mixer works in PCM16 internally and converts at the boundaries: decode
 * inbound frames from Twilio, encode outbound frames back to mu-law.
 *
 * Lookup-table driven — one table read per sample, no per-sample math. The
 * tables are built at module load from the reference G.711 algorithm (the same
 * C code in every telephony library since the 1980s).
 */

// ── Reference algorithm (used once at boot to build the tables) ─────────────

const BIAS = 0x84; // 132
const CLIP = 32635;

/**
 * Exponent lookup for encode: index = (biased_sample >> 7) & 0xFF,
 * value = segment number 0..7. Standard table from the ITU-T G.711 spec.
 */
const EXP_LUT = new Uint8Array([
  0, 0, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3,
  4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4,
  5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
  5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
  6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6,
  6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6,
  6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6,
  6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6,
  7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
  7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
  7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
  7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
  7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
  7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
  7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
  7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
]);

/** Reference encode: signed PCM16 → mu-law byte. */
function refEncode(sample: number): number {
  const sign = (sample >> 8) & 0x80;
  if (sign !== 0) sample = -sample;
  if (sample > CLIP) sample = CLIP;
  sample += BIAS;
  const exponent = EXP_LUT[(sample >> 7) & 0xff];
  const mantissa = (sample >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

/** Reference decode: mu-law byte → signed PCM16. */
function refDecode(mulaw: number): number {
  const v = ~mulaw & 0xff;
  let t = ((v & 0x0f) << 3) + BIAS;
  t <<= (v >> 4) & 0x07;
  return v & 0x80 ? BIAS - t : t - BIAS;
}

// ── Decode table: mu-law byte → PCM16 sample ────────────────────────────────

/** 256-entry expansion table: index = mu-law byte, value = signed PCM16 sample. */
export const MULAW_DECODE_TABLE: Int16Array = /* @__PURE__ */ (() => {
  const t = new Int16Array(256);
  for (let i = 0; i < 256; i++) t[i] = refDecode(i);
  return t;
})();

// ── Encode table: PCM16 (unsigned 16-bit index) → mu-law byte ───────────────

/**
 * 65536-entry compression table: index = unsigned representation of a signed
 * PCM16 sample (sample + 32768), value = mu-law byte.
 *
 * Building the full 64K table costs ~128 KB of memory once; it makes encoding
 * a single array read with zero branching — critical when we encode 8000
 * samples/second per active call.
 */
export const MULAW_ENCODE_TABLE: Uint8Array = /* @__PURE__ */ (() => {
  const t = new Uint8Array(65536);
  for (let i = 0; i < 65536; i++) {
    // Convert unsigned index back to signed PCM16: index 0 = -32768, 32768 = 0, 65535 = +32767.
    const sample = i - 32768;
    t[i] = refEncode(sample);
  }
  return t;
})();

/**
 * Decode mu-law bytes to signed PCM16 samples.
 * One table read per sample — no math.
 */
export function mulawDecode(mulaw: Uint8Array): Int16Array {
  const out = new Int16Array(mulaw.length);
  for (let i = 0; i < mulaw.length; i++) {
    out[i] = MULAW_DECODE_TABLE[mulaw[i]];
  }
  return out;
}

/**
 * Encode signed PCM16 samples to mu-law bytes.
 * One table read per sample — no math.
 */
export function mulawEncode(pcm16: Int16Array): Uint8Array {
  const out = new Uint8Array(pcm16.length);
  for (let i = 0; i < pcm16.length; i++) {
    // Shift signed sample to unsigned index: sample + 32768.
    out[i] = MULAW_ENCODE_TABLE[(pcm16[i] + 32768) & 0xffff];
  }
  return out;
}
