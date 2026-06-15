import { describe, it, expect, beforeAll } from "vitest";
import { encrypt, decrypt } from "@/lib/encrypt";

// Guards the credential-at-rest encryption (Stripe/ShipDay keys). A 32-byte
// key is required; we set a deterministic test-only one.
describe("encrypt / decrypt — AES-256-GCM round trip", () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = "0".repeat(64); // 32 bytes as hex
  });

  it("decrypts back to the original plaintext", () => {
    const secret = "sk_live_supersecret_provider_key";
    const { enc, iv, tag } = encrypt(secret);
    expect(decrypt(enc, iv, tag)).toBe(secret);
  });

  it("uses a fresh random IV each time (ciphertext differs)", () => {
    const a = encrypt("same");
    const b = encrypt("same");
    expect(a.iv !== b.iv || a.enc !== b.enc).toBe(true);
  });

  it("rejects a tampered auth tag (GCM integrity)", () => {
    const { enc, iv } = encrypt("data");
    const wrongTag = Buffer.from("0".repeat(16)).toString("base64");
    expect(() => decrypt(enc, iv, wrongTag)).toThrow();
  });
});
