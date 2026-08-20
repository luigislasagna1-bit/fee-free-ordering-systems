/**
 * BedReader tests — wrapping, random offset, shared buffer.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { BedReader, setBed, clearBed } from "../bed";

describe("BedReader", () => {
  const BED_LENGTH = 800; // 100 ms at 8 kHz — short for testing.

  beforeEach(() => {
    // Set up a known bed: samples 0, 1, 2, ..., 799.
    const buf = new Int16Array(BED_LENGTH);
    for (let i = 0; i < BED_LENGTH; i++) buf[i] = i;
    setBed(buf);
  });

  it("reads samples from the buffer", () => {
    const reader = new BedReader();
    const chunk = reader.read(10);
    assert.equal(chunk.length, 10);
    // All samples should be within the buffer's value range.
    for (let i = 0; i < 10; i++) {
      assert.ok(chunk[i] >= 0 && chunk[i] < BED_LENGTH, `Sample ${chunk[i]} out of range`);
    }
  });

  it("wraps around at the end of the buffer", () => {
    // Force a known starting offset near the end.
    const buf = new Int16Array(BED_LENGTH);
    for (let i = 0; i < BED_LENGTH; i++) buf[i] = i;
    const reader = new BedReader(buf);
    // We don't know the random offset, but if we read the entire buffer
    // twice, every sample should appear and we should wrap correctly.
    const all = reader.read(BED_LENGTH * 2);
    assert.equal(all.length, BED_LENGTH * 2);
    // The second half should be a repeat of the first half (same buffer, wrapped).
    for (let i = 0; i < BED_LENGTH; i++) {
      assert.equal(all[i], all[i + BED_LENGTH], `Wrap mismatch at offset ${i}`);
    }
  });

  it("consecutive reads are continuous", () => {
    const buf = new Int16Array(BED_LENGTH);
    for (let i = 0; i < BED_LENGTH; i++) buf[i] = i;
    const reader = new BedReader(buf);

    // Read in two chunks.
    const a = reader.read(100);
    const b = reader.read(100);

    // The first sample of b should follow the last sample of a (modulo wrap).
    const expectedNext = (a[99] + 1) % BED_LENGTH;
    assert.equal(b[0], expectedNext, `Expected ${expectedNext}, got ${b[0]}`);
  });

  it("different readers start at different offsets (usually)", () => {
    // Probabilistic: with 800 possible offsets, two readers matching is 1/800.
    // Run a few pairs and check that at least one pair differs.
    let anyDifference = false;
    for (let trial = 0; trial < 20; trial++) {
      const r1 = new BedReader();
      const r2 = new BedReader();
      const s1 = r1.read(1);
      const s2 = r2.read(1);
      if (s1[0] !== s2[0]) {
        anyDifference = true;
        break;
      }
    }
    assert.ok(anyDifference, "20 reader pairs all started at the same offset — random offset is likely broken");
  });

  it("throws on empty bed", () => {
    assert.throws(() => setBed(new Int16Array(0)), /non-empty/);
  });

  it("throws when no bed is loaded", () => {
    // Clear the shared bed and confirm the constructor throws.
    clearBed();
    assert.throws(() => new BedReader(), { message: /No bed loaded/ });
  });

  it("reads across the wrap boundary correctly", () => {
    // Small buffer of 10 samples.
    const buf = new Int16Array([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    // We need a deterministic offset, so we'll read enough to find the pattern.
    const reader = new BedReader(buf);
    // Read one full loop plus a bit — 15 samples.
    const chunk = reader.read(15);
    // The last 5 samples should equal the first 5 (the buffer has wrapped).
    for (let i = 0; i < 5; i++) {
      assert.equal(chunk[10 + i], chunk[i], `Wrap check failed at position ${i}`);
    }
  });
});
