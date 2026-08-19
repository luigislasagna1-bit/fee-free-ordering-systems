/**
 * Generate a synthetic test bed — 60 seconds of low-level noise that
 * approximates restaurant ambiance. NOT for production — Luigi will
 * source a real recording; this is for pipeline testing only.
 *
 * Output: test-bed.pcm (raw PCM16 LE, 8 kHz mono, ~960 KB)
 *
 * Usage: npx tsx assets/ambience/generate-test-bed.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const SAMPLE_RATE = 8000;
const DURATION_S = 60;
const TOTAL_SAMPLES = SAMPLE_RATE * DURATION_S;

const buf = new Int16Array(TOTAL_SAMPLES);

// Layer 1: brownian noise (low-frequency murmur)
let brown = 0;
for (let i = 0; i < TOTAL_SAMPLES; i++) {
  brown += (Math.random() * 2 - 1) * 200;
  brown *= 0.995; // gentle decay
  buf[i] = Math.round(brown * 0.3);
}

// Layer 2: random tonal fragments (distant chatter simulation)
for (let event = 0; event < 40; event++) {
  const start = Math.floor(Math.random() * (TOTAL_SAMPLES - 8000));
  const len = 800 + Math.floor(Math.random() * 2400); // 100-400ms
  const freq = 150 + Math.random() * 300; // 150-450 Hz
  const amp = 100 + Math.random() * 200;
  for (let i = 0; i < len && start + i < TOTAL_SAMPLES; i++) {
    const env = Math.sin((Math.PI * i) / len); // fade in/out
    buf[start + i] += Math.round(Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE) * amp * env);
  }
}

// Layer 3: occasional clicks/clinks (plates, cutlery)
for (let click = 0; click < 25; click++) {
  const pos = Math.floor(Math.random() * (TOTAL_SAMPLES - 200));
  const amp = 300 + Math.random() * 500;
  for (let i = 0; i < 120; i++) {
    const decay = Math.exp(-i * 0.08);
    buf[pos + i] += Math.round(Math.sin(2 * Math.PI * (800 + Math.random() * 1200) * i / SAMPLE_RATE) * amp * decay);
  }
}

// Normalize to ~-40 dBFS RMS (quiet background)
let sumSq = 0;
for (let i = 0; i < TOTAL_SAMPLES; i++) sumSq += buf[i] * buf[i];
const rms = Math.sqrt(sumSq / TOTAL_SAMPLES);
const targetRms = 327; // ~-40 dBFS relative to 32767
const scale = targetRms / (rms || 1);
for (let i = 0; i < TOTAL_SAMPLES; i++) {
  buf[i] = Math.round(Math.max(-32768, Math.min(32767, buf[i] * scale)));
}

// Cross-fade the last 1s with the first 1s for seamless looping
const fadeLen = SAMPLE_RATE; // 1 second
for (let i = 0; i < fadeLen; i++) {
  const t = i / fadeLen;
  const tail = TOTAL_SAMPLES - fadeLen + i;
  buf[tail] = Math.round(buf[tail] * (1 - t) + buf[i] * t);
}

const out = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
const outPath = join(import.meta.dirname!, "test-bed.pcm");
writeFileSync(outPath, out);
console.log(`Wrote ${outPath} (${out.length} bytes, ${DURATION_S}s @ ${SAMPLE_RATE} Hz)`);
