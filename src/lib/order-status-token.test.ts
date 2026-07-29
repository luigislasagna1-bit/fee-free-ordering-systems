import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { signActionToken, verifyActionToken } from "./order-status-token";

const ORDER = "cmorder123abc";
const OTHER = "cmorder999zzz";

let savedKey: string | undefined;
let savedNextAuth: string | undefined;
beforeEach(() => {
  savedKey = process.env.ORDER_STATUS_SIGNING_KEY;
  savedNextAuth = process.env.NEXTAUTH_SECRET;
  process.env.ORDER_STATUS_SIGNING_KEY = "test-secret-key-for-tokens";
});
afterEach(() => {
  if (savedKey === undefined) delete process.env.ORDER_STATUS_SIGNING_KEY;
  else process.env.ORDER_STATUS_SIGNING_KEY = savedKey;
  if (savedNextAuth === undefined) delete process.env.NEXTAUTH_SECRET;
  else process.env.NEXTAUTH_SECRET = savedNextAuth;
});

describe("signActionToken / verifyActionToken", () => {
  it("round-trips for each purpose", () => {
    for (const p of ["order-status", "order-cancel", "reservation-cancel"] as const) {
      const t = signActionToken(p, ORDER);
      expect(verifyActionToken(p, ORDER, t)).toBe(true);
    }
  });

  it("PURPOSE SCOPING: a status token can never authorize a cancel (and vice versa)", () => {
    const statusToken = signActionToken("order-status", ORDER);
    const cancelToken = signActionToken("order-cancel", ORDER);
    expect(verifyActionToken("order-cancel", ORDER, statusToken)).toBe(false);
    expect(verifyActionToken("order-status", ORDER, cancelToken)).toBe(false);
    expect(verifyActionToken("reservation-cancel", ORDER, cancelToken)).toBe(false);
  });

  it("SUBJECT SCOPING: order A's token never works on order B", () => {
    const t = signActionToken("order-cancel", ORDER);
    expect(verifyActionToken("order-cancel", OTHER, t)).toBe(false);
  });

  it("rejects tampered, truncated, empty, and null tokens", () => {
    const t = signActionToken("order-cancel", ORDER);
    const tampered = (t[0] === "A" ? "B" : "A") + t.slice(1);
    expect(verifyActionToken("order-cancel", ORDER, tampered)).toBe(false);
    expect(verifyActionToken("order-cancel", ORDER, t.slice(0, -2))).toBe(false); // length mismatch path
    expect(verifyActionToken("order-cancel", ORDER, "")).toBe(false);
    expect(verifyActionToken("order-cancel", ORDER, null)).toBe(false);
    expect(verifyActionToken("order-cancel", ORDER, undefined)).toBe(false);
  });

  it("rejects an empty subject id", () => {
    expect(verifyActionToken("order-cancel", "", "anything")).toBe(false);
  });

  it("tokens are URL-safe base64 (no +, /, =)", () => {
    const t = signActionToken("order-cancel", ORDER);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("throws loudly when no secret is configured", () => {
    delete process.env.ORDER_STATUS_SIGNING_KEY;
    delete process.env.NEXTAUTH_SECRET;
    expect(() => signActionToken("order-cancel", ORDER)).toThrow(/required/);
  });
});
