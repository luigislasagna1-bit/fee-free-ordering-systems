/**
 * Ambient audio bed — a seamless loop of restaurant ambience shared across all
 * concurrent calls, each starting at a random offset so they don't sound cloned.
 *
 * The bed file is raw PCM16 signed little-endian, 8 kHz mono — no headers, no
 * container. `loadBed` reads it once into a shared Int16Array; `BedReader` gives
 * each call its own read cursor that wraps at the end.
 *
 * Memory: a 60 s bed at 8 kHz × 2 bytes = 960 KB; 120 s = 1.92 MB. One copy
 * per process, regardless of how many calls are active.
 */

import { readFileSync } from "node:fs";

/** Shared bed buffer — loaded once at boot, read by every call. */
let sharedBed: Int16Array | null = null;

/**
 * Load a raw PCM16 8 kHz mono file into the shared bed buffer and return it.
 * Subsequent calls with the same path are a no-op (the buffer is immutable).
 * A different path replaces the buffer (useful for tests; in production the
 * bed is loaded once).
 */
export function loadBed(filePath: string): Int16Array {
  const raw = readFileSync(filePath);
  if (raw.byteLength < 2 || raw.byteLength % 2 !== 0) {
    throw new Error(`Bed file must be non-empty raw PCM16 (even byte count); got ${raw.byteLength} bytes`);
  }
  // Wrap the underlying ArrayBuffer as Int16Array (LE is Node's native order).
  sharedBed = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2);
  return sharedBed;
}

/**
 * Directly set the shared bed buffer from an Int16Array (test seam — avoids
 * needing a file on disk).
 */
export function setBed(buf: Int16Array): void {
  if (buf.length === 0) throw new Error("Bed buffer must be non-empty");
  sharedBed = buf;
}

/** Get the current shared bed buffer (null if not loaded). */
export function getBed(): Int16Array | null {
  return sharedBed;
}

/** Clear the shared bed buffer (test seam — not used in production). */
export function clearBed(): void {
  sharedBed = null;
}

/**
 * Per-call reader that wraps around the shared bed buffer.
 *
 * Each call creates one BedReader at construction time with a random starting
 * offset so concurrent calls hear the loop at different phases.
 */
export class BedReader {
  private offset: number;
  private readonly buf: Int16Array;

  constructor(bed?: Int16Array) {
    const b = bed ?? sharedBed;
    if (!b) throw new Error("No bed loaded — call loadBed() or setBed() first");
    this.buf = b;
    // Random starting offset within the buffer.
    this.offset = Math.floor(Math.random() * b.length);
  }

  /** Read the next `frames` samples, wrapping at the end of the buffer. */
  read(frames: number): Int16Array {
    const out = new Int16Array(frames);
    const len = this.buf.length;
    let pos = this.offset;

    for (let i = 0; i < frames; i++) {
      out[i] = this.buf[pos];
      pos++;
      if (pos >= len) pos = 0;
    }

    this.offset = pos;
    return out;
  }
}
