/**
 * The off-site backup cron ENCRYPTS with encryptBackup; the restore tooling
 * DECRYPTS with decryptBackup/loadBackupPayload. A mismatch would make every
 * cloud backup unrecoverable (review 2026-07-10 flagged exactly this gap), so
 * this test pins the round-trip: encrypt → decrypt → identical bytes, and the
 * full loadBackupPayload path (gzip + encrypt) round-trips to the same JSON.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { gzipSync } from "node:zlib";

vi.mock("@/lib/db", () => ({ default: {} }));

// A throwaway 32-byte key for the test (NOT the real ENCRYPTION_KEY).
beforeAll(() => {
  process.env.ENCRYPTION_KEY = "0".repeat(64); // 32 bytes hex
});

import { encryptBackup, decryptBackup, loadBackupPayload } from "@/lib/db-backup";

describe("backup encryption round-trip (C-2 recoverability)", () => {
  it("encryptBackup → decryptBackup returns identical bytes", () => {
    const plain = Buffer.from("the quick brown fox — backup payload with ünïcode 🍕", "utf8");
    const enc = decryptBackup(encryptBackup(plain));
    expect(enc.equals(plain)).toBe(true);
  });

  it("envelope is [iv(12)][tag(16)][ciphertext] and tampering fails the auth tag", () => {
    const env = encryptBackup(Buffer.from("secret"));
    expect(env.length).toBeGreaterThan(28); // 12 iv + 16 tag + ≥1 ct
    const tampered = Buffer.from(env);
    tampered[tampered.length - 1] ^= 0xff; // flip a ciphertext byte
    expect(() => decryptBackup(tampered)).toThrow(); // GCM auth failure
  });

  it("loadBackupPayload restores an encrypted gzipped JSON payload", () => {
    const payload = { format: "ffo-logical-backup/v1", tables: { Order: [{ id: "o1" }] }, counts: { Order: 1 } };
    const gz = gzipSync(Buffer.from(JSON.stringify(payload), "utf8"));
    const encrypted = encryptBackup(gz);
    const restored = loadBackupPayload(encrypted, true);
    expect(restored).toEqual(payload);
  });

  it("loadBackupPayload reads a plaintext (non-encrypted) gzip too", () => {
    const payload = { tables: { Customer: [] }, counts: {} };
    const gz = gzipSync(Buffer.from(JSON.stringify(payload), "utf8"));
    expect(loadBackupPayload(gz, false)).toEqual(payload);
  });
});
