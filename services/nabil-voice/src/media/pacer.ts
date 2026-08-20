/**
 * Frame pacer — emits one 160-sample mu-law frame every 20 ms for real-time
 * audio output to Twilio Media Streams.
 *
 * 8 kHz × 20 ms = 160 samples per frame. The pacer uses `process.hrtime.bigint()`
 * for drift-corrected timing: it tracks how many frames SHOULD have been emitted
 * since start and catches up if a tick runs late, but never runs more than
 * 200 ms (10 frames) ahead of real time.
 *
 * Voice audio is enqueued as mu-law bytes; when no voice is available the pacer
 * emits bed-only frames (via the mixer). This ensures the caller always hears
 * the ambient bed, even during tool hops and model thinking time.
 */

import { mulawEncode, mulawDecode } from "./mulaw";
import { type DuckRamp, mixFrame } from "./mixer";
import { type BedReader } from "./bed";

/** Samples per frame: 8 kHz × 20 ms. */
export const FRAME_SAMPLES = 160;

/** Frame interval in nanoseconds: 20 ms. */
const FRAME_NS = BigInt(20_000_000);

/** Maximum frames of lead over real time (200 ms = 10 frames). */
const MAX_LEAD_FRAMES = 10;

/** Interval for the timer tick in ms — run frequently to stay close to 20 ms. */
const TICK_INTERVAL_MS = 5;

export type PacerOptions = {
  /** Bed reader for this call (null = no ambient bed). */
  bedReader: BedReader | null;
  /** Bed gain in dB (default -20). */
  gainDb?: number;
  /** Duck attenuation in dB (default -3). */
  duckDb?: number;
  /** Duck ramp state — created once per call. */
  duckRamp: DuckRamp;
  /** Clock function override for testing (returns bigint nanoseconds). */
  clock?: () => bigint;
};

export class FramePacer {
  private readonly bedReader: BedReader | null;
  private readonly gainDb: number;
  private readonly duckDb: number;
  private readonly duckRamp: DuckRamp;
  private readonly clock: () => bigint;

  /** Queue of mu-law voice frames (each exactly FRAME_SAMPLES bytes). */
  private voiceQueue: Uint8Array[] = [];
  /** Whether the AI is currently speaking (affects ducking). */
  private speaking = false;

  private callback: ((frame: Uint8Array) => void) | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private startTime: bigint = 0n;
  private framesEmitted = 0;
  private destroyed = false;

  constructor(opts: PacerOptions) {
    this.bedReader = opts.bedReader;
    this.gainDb = opts.gainDb ?? -20;
    this.duckDb = opts.duckDb ?? -3;
    this.duckRamp = opts.duckRamp;
    this.clock = opts.clock ?? (() => process.hrtime.bigint());
  }

  /**
   * Register the frame callback and start the timer. Each call delivers one
   * 160-byte mu-law frame. Only one callback is supported.
   */
  onFrame(callback: (frame: Uint8Array) => void): void {
    this.callback = callback;
    this.startTime = this.clock();
    this.framesEmitted = 0;
    this.timer = setInterval(() => this.tick(), TICK_INTERVAL_MS);
    // Unref so the timer doesn't keep the process alive during shutdown.
    if (this.timer && typeof this.timer === "object" && "unref" in this.timer) {
      (this.timer as NodeJS.Timeout).unref();
    }
  }

  /**
   * Enqueue voice audio (mu-law encoded, must be a multiple of FRAME_SAMPLES).
   * Frames are consumed in FIFO order by the pacer.
   */
  enqueueVoice(frames: Uint8Array): void {
    if (frames.length === 0) return;
    // Split into individual frames if a bulk buffer was provided.
    for (let offset = 0; offset + FRAME_SAMPLES <= frames.length; offset += FRAME_SAMPLES) {
      this.voiceQueue.push(frames.subarray(offset, offset + FRAME_SAMPLES));
    }
    this.speaking = true;
  }

  /** Signal that no more voice is coming for this utterance. */
  clearVoice(): void {
    this.voiceQueue.length = 0;
    this.speaking = false;
  }

  /** How many voice frames are queued. */
  get voiceQueueLength(): number {
    return this.voiceQueue.length;
  }

  /** Whether voice frames are queued (affects ducking). */
  get isSpeaking(): boolean {
    return this.speaking;
  }

  /** Clean up the timer. Safe to call multiple times. */
  destroy(): void {
    this.destroyed = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.voiceQueue.length = 0;
    this.callback = null;
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private tick(): void {
    if (this.destroyed || !this.callback) return;

    const now = this.clock();
    const elapsed = now - this.startTime;
    // How many frames are due by now (real-time position).
    const dueNow = Number(elapsed / FRAME_NS);
    // Allow up to MAX_LEAD_FRAMES ahead of real time (200 ms of pre-fill for
    // Twilio's buffer), but never more than that.
    const emitUntil = dueNow + MAX_LEAD_FRAMES;

    while (this.framesEmitted < emitUntil) {
      const frame = this.buildFrame();
      this.callback(frame);
      this.framesEmitted++;
    }

    // Update speaking state after consuming frames.
    if (this.voiceQueue.length === 0 && this.speaking) {
      this.speaking = false;
    }
  }

  /** Build one output frame: mix voice (if available) with bed. */
  private buildFrame(): Uint8Array {
    const voiceMulaw = this.voiceQueue.shift() ?? null;

    // Decode voice to PCM16 for mixing (empty if no voice).
    const voicePcm = voiceMulaw ? mulawDecode(voiceMulaw) : new Int16Array(FRAME_SAMPLES);

    if (!this.bedReader) {
      // No bed — return voice-only (or silence).
      return voiceMulaw ?? mulawEncode(voicePcm);
    }

    const bedPcm = this.bedReader.read(FRAME_SAMPLES);
    const mixed = mixFrame(voicePcm, bedPcm, this.gainDb, this.duckDb, this.speaking, this.duckRamp);
    return mulawEncode(mixed);
  }
}
