/**
 * mu-law encode/decode tests — round-trip fidelity, known vectors, table
 * symmetry, and the silence byte.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mulawEncode, mulawDecode, MULAW_DECODE_TABLE, MULAW_ENCODE_TABLE } from "../mulaw";

describe("mulaw", () => {
  describe("tables", () => {
    it("decode table has 256 entries", () => {
      assert.equal(MULAW_DECODE_TABLE.length, 256);
    });

    it("encode table has 65536 entries", () => {
      assert.equal(MULAW_ENCODE_TABLE.length, 65536);
    });

    it("silence byte 0xFF decodes to 0", () => {
      // mu-law silence is 0xFF (the complement of the zero-amplitude code).
      assert.equal(MULAW_DECODE_TABLE[0xff], 0);
    });

    it("silence byte 0x7F decodes to 0 (negative zero)", () => {
      // 0x7F is the negative-sign zero — same magnitude.
      assert.equal(MULAW_DECODE_TABLE[0x7f], 0);
    });

    it("0x80 decodes to max positive (32124)", () => {
      assert.equal(MULAW_DECODE_TABLE[0x80], 32124);
    });

    it("0x00 decodes to max negative (-32124)", () => {
      assert.equal(MULAW_DECODE_TABLE[0x00], -32124);
    });
  });

  describe("round-trip fidelity", () => {
    it("encode then decode recovers near-original samples", () => {
      // mu-law is lossy (8-bit companded from 16-bit), so we test that the
      // round-trip error is within the expected quantization range.
      // Near zero: quantization step ~16; near full scale: ~1024.
      const testCases: Array<{ sample: number; maxError: number }> = [
        { sample: 0, maxError: 0 },
        { sample: 100, maxError: 16 },
        { sample: -100, maxError: 16 },
        { sample: 1000, maxError: 64 },
        { sample: -1000, maxError: 64 },
        { sample: 10000, maxError: 512 },
        { sample: -10000, maxError: 512 },
        { sample: 30000, maxError: 2048 },
        { sample: -30000, maxError: 2048 },
      ];

      for (const { sample, maxError } of testCases) {
        const encoded = mulawEncode(new Int16Array([sample]));
        const decoded = mulawDecode(encoded);
        const error = Math.abs(sample - decoded[0]);
        assert.ok(
          error <= maxError,
          `Sample ${sample} → ${decoded[0]}, error ${error} exceeds max ${maxError}`,
        );
      }
    });

    it("zero encodes to 0xFF (the standard silence byte)", () => {
      const silence = new Int16Array([0]);
      const encoded = mulawEncode(silence);
      assert.equal(encoded[0], 0xff);
    });

    it("round-trips a full frame of 160 samples", () => {
      // Simulate a real 20 ms frame at 8 kHz.
      const frame = new Int16Array(160);
      for (let i = 0; i < 160; i++) {
        // 1 kHz sine wave at ~75% amplitude.
        frame[i] = Math.round(24000 * Math.sin((2 * Math.PI * 1000 * i) / 8000));
      }
      const encoded = mulawEncode(frame);
      assert.equal(encoded.length, 160);
      const decoded = mulawDecode(encoded);
      assert.equal(decoded.length, 160);

      // Check overall shape is preserved (sign and rough magnitude).
      for (let i = 0; i < 160; i++) {
        if (Math.abs(frame[i]) > 200) {
          assert.equal(
            Math.sign(frame[i]),
            Math.sign(decoded[i]),
            `Sign mismatch at sample ${i}: ${frame[i]} vs ${decoded[i]}`,
          );
        }
      }
    });
  });

  describe("encode/decode are inverses for every table entry", () => {
    it("every decoded sample re-encodes to the same mu-law byte (except negative zero)", () => {
      // For each of the 256 mu-law codes, decode to PCM16 and re-encode.
      // The result must be the same code — EXCEPT for 0x7F (negative zero):
      // both 0x7F and 0xFF decode to 0, and the encoder always picks the
      // canonical 0xFF. This is standard G.711 behavior.
      for (let code = 0; code < 256; code++) {
        const pcm = MULAW_DECODE_TABLE[code];
        const reEncoded = MULAW_ENCODE_TABLE[(pcm + 32768) & 0xffff];
        if (code === 0x7f) {
          // Negative zero → encodes to positive zero (0xFF).
          assert.equal(reEncoded, 0xff, `negative zero 0x7F should re-encode to 0xFF`);
        } else {
          assert.equal(
            reEncoded,
            code,
            `mu-law code ${code} decoded to ${pcm}, re-encoded to ${reEncoded}`,
          );
        }
      }
    });
  });

  describe("edge cases", () => {
    it("handles empty input", () => {
      const encoded = mulawEncode(new Int16Array(0));
      assert.equal(encoded.length, 0);
      const decoded = mulawDecode(new Uint8Array(0));
      assert.equal(decoded.length, 0);
    });

    it("positive clipping region converges", () => {
      // Samples near +32767 should all encode and decode to the max positive value.
      const high = new Int16Array([32000, 32500, 32767]);
      const encoded = mulawEncode(high);
      assert.equal(encoded.length, 3);
      const decoded = mulawDecode(encoded);
      for (let i = 0; i < 3; i++) {
        // Max mu-law positive is 32124 — anything above clips to it.
        assert.ok(decoded[i] >= 31100, `Expected high positive, got ${decoded[i]}`);
      }
    });

    it("negative clipping region converges", () => {
      const low = new Int16Array([-32000, -32500, -32768]);
      const encoded = mulawEncode(low);
      const decoded = mulawDecode(encoded);
      for (let i = 0; i < 3; i++) {
        assert.ok(decoded[i] <= -31100, `Expected high negative, got ${decoded[i]}`);
      }
    });
  });
});
