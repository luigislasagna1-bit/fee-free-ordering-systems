/**
 * Blocker #6 — signed one-click unsubscribe.
 * Tokens must round-trip, reject tampering, and applyUnsubscribe must flip
 * the right rows (all duplicate customer rows / all lists with the email).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  customers: [] as any[],
  prospects: [] as any[],
}));

vi.mock("@/lib/db", () => ({
  default: {
    customer: {
      updateMany: async ({ where, data }: any) => {
        const rows = h.customers.filter((c) => c.restaurantId === where.restaurantId && c.email === where.email);
        for (const r of rows) Object.assign(r, data);
        return { count: rows.length };
      },
    },
    prospect: {
      updateMany: async ({ where, data }: any) => {
        const rows = h.prospects.filter((p) =>
          where.id ? p.id === where.id : p.email === where.email && (where.unsubscribedAt !== null || true) && (where.unsubscribedAt === undefined || p.unsubscribedAt === null),
        );
        for (const r of rows) Object.assign(r, data);
        return { count: rows.length };
      },
    },
  },
}));

process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || "test-secret-unsub";
process.env.NEXT_PUBLIC_APP_URL = "https://feefreeordering.com";

import {
  signUnsubscribeToken, verifyUnsubscribeToken, applyUnsubscribe,
  customerUnsubscribeUrl, prospectUnsubscribeUrl,
} from "./unsubscribe";

beforeEach(() => {
  h.customers = [
    { id: "c1", restaurantId: "r1", email: "a@x.com", marketingConsent: true },
    { id: "c2", restaurantId: "r1", email: "a@x.com", marketingConsent: true }, // duplicate guest row
    { id: "c3", restaurantId: "r2", email: "a@x.com", marketingConsent: true }, // other restaurant — untouched
  ];
  h.prospects = [
    { id: "p1", email: "b@x.com", unsubscribedAt: null },
    { id: "p2", email: "b@x.com", unsubscribedAt: null }, // same person, second import
    { id: "p3", email: "other@x.com", unsubscribedAt: null },
  ];
});

describe("unsubscribe tokens", () => {
  it("round-trips and rejects tampering", () => {
    const t = signUnsubscribeToken({ k: "customer", r: "r1", e: "a@x.com" });
    expect(verifyUnsubscribeToken(t)).toEqual({ k: "customer", r: "r1", e: "a@x.com" });
    expect(verifyUnsubscribeToken(t.slice(0, -3) + "xyz")).toBeNull();
    expect(verifyUnsubscribeToken("garbage")).toBeNull();
  });

  it("builds absolute /api/public/unsubscribe URLs", () => {
    expect(customerUnsubscribeUrl({ restaurantId: "r1", email: "A@X.com" }))
      .toMatch(/^https:\/\/feefreeordering\.com\/api\/public\/unsubscribe\?token=/);
    expect(prospectUnsubscribeUrl({ prospectId: "p1", email: "b@x.com" }))
      .toMatch(/^https:\/\/feefreeordering\.com\/api\/public\/unsubscribe\?token=/);
  });
});

describe("applyUnsubscribe", () => {
  it("customer: flips marketingConsent for EVERY row of that email at that restaurant only", async () => {
    const res = await applyUnsubscribe({ k: "customer", r: "r1", e: "a@x.com" });
    expect(res.ok).toBe(true);
    expect(h.customers[0].marketingConsent).toBe(false);
    expect(h.customers[1].marketingConsent).toBe(false); // duplicate row flipped too
    expect(h.customers[2].marketingConsent).toBe(true); // other restaurant untouched
  });

  it("prospect: stamps unsubscribedAt on the prospect AND every other list with that email", async () => {
    const res = await applyUnsubscribe({ k: "prospect", p: "p1", e: "b@x.com" });
    expect(res.ok).toBe(true);
    expect(h.prospects[0].unsubscribedAt).toBeInstanceOf(Date);
    expect(h.prospects[1].unsubscribedAt).toBeInstanceOf(Date);
    expect(h.prospects[2].unsubscribedAt).toBeNull();
  });

  it("is idempotent", async () => {
    await applyUnsubscribe({ k: "customer", r: "r1", e: "a@x.com" });
    const res = await applyUnsubscribe({ k: "customer", r: "r1", e: "a@x.com" });
    expect(res.ok).toBe(true);
    expect(h.customers[0].marketingConsent).toBe(false);
  });
});
