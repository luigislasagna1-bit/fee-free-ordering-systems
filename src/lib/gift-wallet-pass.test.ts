/**
 * Gift Wallet Pass — credential issuance, hashing/verification, single-use/
 * revocation, expiry, and the exchange (claim) path. Drives an in-memory
 * fake Prisma (same pattern as reward-refund-flow.test.ts) so the real
 * claimPendingGiftsFor / grant / getBalance code runs against it — this is
 * as close to an integration test as a unit test can get for this feature.
 *
 * See DESIGN-gift-wallet-pass.md §11 for the required-coverage list this
 * file is built against.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── In-memory fake Prisma ───────────────────────────────────────────────────
const h = vi.hoisted(() => {
  const state = {
    giftWalletPasses: [] as any[],
    grants: [] as any[],
    customers: [] as any[],
    rewardAccounts: [] as any[],
    rewardLedger: [] as any[],
    nextId: 1,
  };
  return { state };
});

vi.mock("@/lib/db", () => {
  const s = h.state;
  const nid = (prefix: string) => `${prefix}_${h.state.nextId++}`;

  function matchCustomerEmail(where: any, c: any): boolean {
    if (where.restaurantId !== undefined && c.restaurantId !== where.restaurantId) return false;
    if (where.email !== undefined) {
      const w = where.email;
      if (typeof w === "string") { if (c.email !== w) return false; }
      else if (w && typeof w === "object" && "equals" in w) {
        const mode = w.mode === "insensitive";
        if (mode ? String(c.email).toLowerCase() !== String(w.equals).toLowerCase() : c.email !== w.equals) return false;
      }
    }
    return true;
  }
  // Deterministic ordering mirror of CUSTOMER_ROW_ORDER: account rows
  // (passwordHash set) first, then oldest createdAt, then id.
  function pickCanonical(rows: any[]): any | null {
    if (!rows.length) return null;
    const sorted = [...rows].sort((a, b) => {
      const ah = a.passwordHash != null ? 0 : 1;
      const bh = b.passwordHash != null ? 0 : 1;
      if (ah !== bh) return ah - bh;
      if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
      return String(a.id).localeCompare(String(b.id));
    });
    return sorted[0];
  }

  const client = {
    giftWalletPass: {
      findUnique: async ({ where }: any) => {
        if (where.codeHash !== undefined) return s.giftWalletPasses.find((p) => p.codeHash === where.codeHash) ?? null;
        if (where.sessionHash !== undefined) return s.giftWalletPasses.find((p) => p.sessionHash === where.sessionHash) ?? null;
        if (where.grantId !== undefined) return s.giftWalletPasses.find((p) => p.grantId === where.grantId) ?? null;
        if (where.id !== undefined) return s.giftWalletPasses.find((p) => p.id === where.id) ?? null;
        return null;
      },
      upsert: async ({ where, create, update }: any) => {
        const existing = s.giftWalletPasses.find((p) => p.grantId === where.grantId);
        if (existing) { Object.assign(existing, update); return { ...existing }; }
        const row = {
          id: nid("pass"), customerId: null, sessionHash: null, sessionExpiresAt: null,
          sessionAbsoluteExpiresAt: null, revokedAt: null, revokedReason: null,
          exchangeCount: 0, failedAttempts: 0, resendCount: 0, lastResendAt: null,
          lastExchangeAt: null, lastIpHash: null, ...create,
        };
        s.giftWalletPasses.push(row);
        return { ...row };
      },
      update: async ({ where, data }: any) => {
        const p = s.giftWalletPasses.find((x) => x.id === where.id);
        if (!p) throw new Error("pass not found");
        for (const [k, v] of Object.entries(data)) {
          if (v && typeof v === "object" && "increment" in (v as any)) p[k] = (p[k] ?? 0) + (v as any).increment;
          else p[k] = v;
        }
        return { ...p };
      },
      updateMany: async ({ where, data }: any) => {
        const rows = s.giftWalletPasses.filter((p) => {
          if (where.grantId !== undefined && p.grantId !== where.grantId) return false;
          if (where.revokedAt === null && p.revokedAt !== null) return false;
          return true;
        });
        for (const p of rows) Object.assign(p, data);
        return { count: rows.length };
      },
    },
    pendingRewardGrant: {
      findUnique: async ({ where }: any) => s.grants.find((g) => g.id === where.id) ?? null,
      findFirst: async ({ where }: any) =>
        s.grants.find((g) => g.restaurantId === where.restaurantId && g.email === where.email && (!where.status || g.status === where.status)) ?? null,
      findMany: async ({ where }: any) =>
        s.grants
          .filter((g) => {
            if (where.restaurantId !== undefined && g.restaurantId !== where.restaurantId) return false;
            if (where.email !== undefined && g.email !== where.email) return false;
            if (where.status !== undefined && g.status !== where.status) return false;
            if (where.id?.in && !where.id.in.includes(g.id)) return false;
            return true;
          })
          .map((g) => ({ ...g })),
      updateMany: async ({ where, data }: any) => {
        const rows = s.grants.filter((g) => g.id === where.id && (!where.status || g.status === where.status));
        for (const g of rows) Object.assign(g, data);
        return { count: rows.length };
      },
      create: async ({ data }: any) => {
        const row = { id: nid("grant"), status: "pending", customerId: null, ...data };
        s.grants.push(row);
        return { ...row };
      },
    },
    customer: {
      findFirst: async ({ where }: any) => {
        const rows = s.customers.filter((c) => matchCustomerEmail(where, c));
        return pickCanonical(rows) ? { ...pickCanonical(rows) } : null;
      },
      findUnique: async ({ where }: any) => {
        if (where.id !== undefined) {
          const c = s.customers.find((x) => x.id === where.id);
          if (!c) return null;
          // emulate `select` shape (tests always select a superset, fine to
          // return the whole row) — include customerAccount relation as null
          return { ...c, customerAccount: c.customerAccountId ? { createdAt: c.customerAccountCreatedAt ?? new Date() } : null };
        }
        return null;
      },
      create: async ({ data }: any) => {
        const row = { id: nid("cust"), createdAt: new Date(), passwordHash: null, signedUpAt: null, customerAccountId: null, ...data };
        s.customers.push(row);
        return { ...row };
      },
    },
    rewardAccount: {
      upsert: async ({ where, create }: any) => {
        const { restaurantId, customerId } = where.restaurantId_customerId;
        let a = s.rewardAccounts.find((x) => x.restaurantId === restaurantId && x.customerId === customerId);
        if (!a) { a = { id: nid("acct"), restaurantId, customerId, balance: 0, lifetimeEarned: 0, lifetimeRedeemed: 0, ...create }; s.rewardAccounts.push(a); }
        return { id: a.id, balance: a.balance };
      },
      findUnique: async ({ where }: any) => {
        if (where.restaurantId_customerId) {
          const { restaurantId, customerId } = where.restaurantId_customerId;
          const a = s.rewardAccounts.find((x) => x.restaurantId === restaurantId && x.customerId === customerId);
          return a ? { ...a } : null;
        }
        if (where.id !== undefined) {
          const a = s.rewardAccounts.find((x) => x.id === where.id);
          return a ? { ...a } : null;
        }
        return null;
      },
      update: async ({ where, data }: any) => {
        const a = s.rewardAccounts.find((x) => x.id === where.id);
        if (!a) throw new Error("account not found");
        for (const key of ["balance", "lifetimeRedeemed", "lifetimeEarned"]) {
          if (data[key] === undefined) continue;
          if (typeof data[key] === "number") a[key] = data[key];
          else if (data[key].increment !== undefined) a[key] += data[key].increment;
          else if (data[key].decrement !== undefined) a[key] -= data[key].decrement;
        }
        return { ...a };
      },
    },
    rewardLedger: {
      findUnique: async ({ where }: any) => {
        const k = where.accountId_orderId_reason;
        if (!k) return null;
        return s.rewardLedger.find((r) => r.accountId === k.accountId && r.orderId === k.orderId && r.reason === k.reason) ?? null;
      },
      create: async ({ data }: any) => {
        if (data.orderId && s.rewardLedger.some((r) => r.accountId === data.accountId && r.orderId === data.orderId && r.reason === data.reason)) {
          const err: any = new Error("Unique constraint failed"); err.code = "P2002"; throw err;
        }
        const row = { id: nid("led"), ...data };
        s.rewardLedger.push(row);
        return { ...row };
      },
    },
    $transaction: async (cb: any) => cb(client),
  };
  return { default: client };
});

// The exchange path reads cookies only via readGiftPassSession (resolveGiftPassSpender
// / getGiftPassSession) — exchangePass itself never touches next/headers.
const cookieJar = h.state as any;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "ff_gift_pass" && cookieJar.__cookie !== undefined ? { value: cookieJar.__cookie } : undefined),
  }),
}));

import {
  generateCode, normalizeCode, hashCode, formatCode, mintPassForGrant, verifyCode, exchangePass,
  resolveGiftPassSpender, getGiftPassSession, revokeGiftWalletPassForGrant, GIFT_PASS_COOKIE_NAME,
} from "./gift-wallet-pass";
import { RESTAURANT_CUSTOMER_COOKIE_NAME } from "./restaurant-customer-session";
import { claimPendingGiftsFor } from "./reward-gifts";
import { getBalance, orderEligibleToEarn } from "./reward-ledger";

const R = "rest_1";
const R2 = "rest_2";

function seedGrant(overrides: Partial<any> = {}) {
  const grant = { id: `grant_${h.state.nextId++}`, restaurantId: R, email: "guest@example.com", name: "Guest", amount: 10, note: null, status: "pending", ...overrides };
  h.state.grants.push(grant);
  return grant;
}

beforeEach(() => {
  h.state.giftWalletPasses = [];
  h.state.grants = [];
  h.state.customers = [];
  h.state.rewardAccounts = [];
  h.state.rewardLedger = [];
  h.state.nextId = 1;
  (h.state as any).__cookie = undefined;
});

// ── Credential primitive ───────────────────────────────────────────────────
describe("code generation and normalization", () => {
  it("is exactly 16 chars from the Crockford alphabet — a shortening regression collapses the entire security model", () => {
    for (let i = 0; i < 25; i++) {
      const code = generateCode();
      expect(code).toHaveLength(16);
      expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{16}$/); // no I, L, O, U
    }
  });

  it("generates CSPRNG codes — 25 draws are all distinct", () => {
    const codes = new Set(Array.from({ length: 25 }, () => generateCode()));
    expect(codes.size).toBe(25);
  });

  it("normalizes case, dashes, and spacing", () => {
    const raw = generateCode();
    const grouped = formatCode(raw).toLowerCase();
    expect(normalizeCode(grouped)).toBe(raw);
    expect(normalizeCode(`  ${raw.toLowerCase()}  `.replace(/(.{4})/g, "$1 "))).toBe(raw);
  });

  it("maps visually-ambiguous letters I→1 L→1 O→0 U→V", () => {
    expect(normalizeCode("IIIIIIIIIIIIIIII")).toBe("1111111111111111");
    expect(normalizeCode("LLLLLLLLLLLLLLLL")).toBe("1111111111111111");
    expect(normalizeCode("OOOOOOOOOOOOOOOO")).toBe("0000000000000000");
    expect(normalizeCode("UUUUUUUUUUUUUUUU")).toBe("VVVVVVVVVVVVVVVV");
  });

  it("rejects malformed input instead of throwing", () => {
    expect(normalizeCode("")).toBeNull();
    expect(normalizeCode("TOOSHORT")).toBeNull();
    expect(normalizeCode(null)).toBeNull();
    expect(normalizeCode(12345 as any)).toBeNull();
  });

  it("hashCode is deterministic and has no server-secret coupling (pure sha256, no HMAC key)", () => {
    const code = generateCode();
    expect(hashCode(code)).toBe(hashCode(code));
    expect(hashCode(code)).not.toBe(code);
    expect(hashCode(code)).toHaveLength(64); // hex sha256
  });
});

// ── Mint ────────────────────────────────────────────────────────────────────
describe("mintPassForGrant", () => {
  it("mints a fresh code and never returns the same code twice, even on re-mint for the same grant", async () => {
    const grant = seedGrant();
    const first = await mintPassForGrant({ restaurantId: R, grantId: grant.id });
    const second = await mintPassForGrant({ restaurantId: R, grantId: grant.id });
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first!.code).not.toBe(second!.code);
    // Re-minting KILLS the old code — it must no longer verify.
    const oldResult = await verifyCode({ restaurantId: R, code: first!.code });
    expect(oldResult.ok).toBe(false);
    const newResult = await verifyCode({ restaurantId: R, code: second!.code });
    expect(newResult.ok).toBe(true);
  });

  it("upserts on grantId — exactly one pass row per grant regardless of remint count", async () => {
    const grant = seedGrant();
    await mintPassForGrant({ restaurantId: R, grantId: grant.id });
    await mintPassForGrant({ restaurantId: R, grantId: grant.id });
    await mintPassForGrant({ restaurantId: R, grantId: grant.id });
    expect(h.state.giftWalletPasses.filter((p) => p.grantId === grant.id)).toHaveLength(1);
  });

  it("stores only a hash — the raw code never appears anywhere in the persisted row", async () => {
    const grant = seedGrant();
    const minted = await mintPassForGrant({ restaurantId: R, grantId: grant.id });
    const row = h.state.giftWalletPasses.find((p) => p.grantId === grant.id)!;
    const rawNoDashes = minted!.code.replace(/-/g, "");
    expect(JSON.stringify(row)).not.toContain(rawNoDashes);
    expect(row.codeHint).toBe(rawNoDashes.slice(-4));
  });
});

// ── Verify (read-only) ─────────────────────────────────────────────────────
describe("verifyCode", () => {
  it("succeeds for a live pending gift at the right restaurant", async () => {
    const grant = seedGrant({ amount: 25 });
    const minted = await mintPassForGrant({ restaurantId: R, grantId: grant.id });
    const res = await verifyCode({ restaurantId: R, code: minted!.code });
    expect(res).toMatchObject({ ok: true, grantId: grant.id, amount: 25 });
  });

  it("a pass for restaurant A returns null (uniform invalid) for restaurant B — no chain hop", async () => {
    const grant = seedGrant({ restaurantId: R });
    const minted = await mintPassForGrant({ restaurantId: R, grantId: grant.id });
    const res = await verifyCode({ restaurantId: R2, code: minted!.code });
    expect(res).toEqual({ ok: false, reason: "invalid" });
  });

  it("never writes — failedAttempts / exchangeCount are untouched by a bad verify", async () => {
    const grant = seedGrant();
    const minted = await mintPassForGrant({ restaurantId: R, grantId: grant.id });
    await verifyCode({ restaurantId: R2, code: minted!.code }); // wrong restaurant
    await verifyCode({ restaurantId: R, code: "0000000000000000" }); // wrong code
    const row = h.state.giftWalletPasses.find((p) => p.grantId === grant.id)!;
    expect(row.failedAttempts).toBe(0);
    expect(row.exchangeCount).toBe(0);
  });

  it("returns a uniform refusal for a not-found code (not a status oracle)", async () => {
    const res = await verifyCode({ restaurantId: R, code: "ABCDEFGHJKMNPQRS" });
    expect(res).toEqual({ ok: false, reason: "invalid" });
  });

  it("refuses a revoked pass and an expired pass", async () => {
    const g1 = seedGrant();
    const m1 = await mintPassForGrant({ restaurantId: R, grantId: g1.id });
    await revokeGiftWalletPassForGrant(g1.id, "test");
    expect(await verifyCode({ restaurantId: R, code: m1!.code })).toEqual({ ok: false, reason: "invalid" });

    const g2 = seedGrant();
    const m2 = await mintPassForGrant({ restaurantId: R, grantId: g2.id });
    h.state.giftWalletPasses.find((p) => p.grantId === g2.id)!.expiresAt = new Date(Date.now() - 1000);
    expect(await verifyCode({ restaurantId: R, code: m2!.code })).toEqual({ ok: false, reason: "invalid" });
  });
});

// ── Exchange (the money-adjacent path) ─────────────────────────────────────
describe("exchangePass", () => {
  it("resolves-or-creates a guest-twin Customer, claims the grant, and mints a session secret", async () => {
    const grant = seedGrant({ email: "gift@example.com", amount: 25 });
    const minted = await mintPassForGrant({ restaurantId: R, grantId: grant.id });

    const res = await exchangePass({ restaurantId: R, restaurantSlug: "luigis", code: minted!.code, ipHash: "iphash" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.balance).toBe(25);
    expect(res.redirectTo).toBe("/order/luigis"); // relative, never the origin root
    expect(typeof res.sessionSecret).toBe("string");

    const customer = h.state.customers.find((c) => c.id === res.customerId)!;
    expect(customer.signedUpAt).toBeNull();
    expect(customer.passwordHash).toBeNull();
    expect(customer.customerAccountId).toBeNull();

    const grantAfter = h.state.grants.find((g) => g.id === grant.id)!;
    expect(grantAfter.status).toBe("claimed");
    expect(grantAfter.customerId).toBe(res.customerId);
  });

  it("scopes the claim to ONLY this pass's grant — a second unrelated pending gift for the same email is untouched", async () => {
    const grantA = seedGrant({ email: "multi@example.com", amount: 10 });
    const grantB = seedGrant({ email: "multi@example.com", amount: 40 });
    const mintedA = await mintPassForGrant({ restaurantId: R, grantId: grantA.id });

    const res = await exchangePass({ restaurantId: R, restaurantSlug: "luigis", code: mintedA!.code, ipHash: null });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.balance).toBe(10); // NOT 50 — grantB was never swept in
    expect(h.state.grants.find((g) => g.id === grantB.id)!.status).toBe("pending");
  });

  it("double exchange (double-click) credits the wallet exactly once and rotates the session, invalidating the first cookie", async () => {
    const grant = seedGrant({ email: "double@example.com", amount: 15 });
    const minted = await mintPassForGrant({ restaurantId: R, grantId: grant.id });

    const first = await exchangePass({ restaurantId: R, restaurantSlug: "luigis", code: minted!.code, ipHash: null });
    const second = await exchangePass({ restaurantId: R, restaurantSlug: "luigis", code: minted!.code, ipHash: null });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    // Same wallet, credited exactly once (claimPendingGiftsFor's guarded flip).
    expect(first.customerId).toBe(second.customerId);
    expect(h.state.rewardAccounts.filter((a) => a.customerId === first.customerId)).toHaveLength(1);
    expect(h.state.rewardAccounts.find((a) => a.customerId === first.customerId)!.balance).toBe(15);

    // The FIRST session secret no longer authenticates — only the SECOND does.
    (h.state as any).__cookie = first.sessionSecret;
    expect(await resolveGiftPassSpender({ expectedRestaurantId: R, typedEmail: "double@example.com" })).toBeNull();
    (h.state as any).__cookie = second.sessionSecret;
    expect(await resolveGiftPassSpender({ expectedRestaurantId: R, typedEmail: "double@example.com" })).toBe(second.customerId);
  });

  it("simulated concurrent double exchange (race) still credits exactly once", async () => {
    const grant = seedGrant({ email: "race@example.com", amount: 20 });
    const minted = await mintPassForGrant({ restaurantId: R, grantId: grant.id });

    const [a, b] = await Promise.all([
      exchangePass({ restaurantId: R, restaurantSlug: "luigis", code: minted!.code, ipHash: null }),
      exchangePass({ restaurantId: R, restaurantSlug: "luigis", code: minted!.code, ipHash: null }),
    ]);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.customerId).toBe(b.customerId); // converge on ONE canonical guest-twin row
    const accounts = h.state.rewardAccounts.filter((acct) => acct.customerId === a.customerId);
    expect(accounts).toHaveLength(1);
    expect(accounts[0].balance).toBe(20); // never 40 — claimed exactly once
  });

  it("refuses account_exists and never touches the wallet when the resolved row is already an account", async () => {
    const grant = seedGrant({ email: "member@example.com", amount: 30 });
    h.state.customers.push({ id: "cust_member", restaurantId: R, email: "member@example.com", passwordHash: "hash", signedUpAt: new Date(), customerAccountId: null, createdAt: new Date() });
    const minted = await mintPassForGrant({ restaurantId: R, grantId: grant.id });

    const res = await exchangePass({ restaurantId: R, restaurantSlug: "luigis", code: minted!.code, ipHash: null });
    expect(res).toEqual({ ok: false, reason: "account_exists" });
    expect(h.state.grants.find((g) => g.id === grant.id)!.status).toBe("pending"); // untouched
    expect(h.state.rewardAccounts).toHaveLength(0);
  });

  it("refuses uniformly (invalid) when tried at a different restaurant than it was issued for", async () => {
    const grant = seedGrant({ restaurantId: R });
    const minted = await mintPassForGrant({ restaurantId: R, grantId: grant.id });
    const res = await exchangePass({ restaurantId: R2, restaurantSlug: "other", code: minted!.code, ipHash: null });
    expect(res).toEqual({ ok: false, reason: "invalid" });
  });

  it("refuses revoked and expired passes with typed reasons", async () => {
    const g1 = seedGrant();
    const m1 = await mintPassForGrant({ restaurantId: R, grantId: g1.id });
    await revokeGiftWalletPassForGrant(g1.id, "gift_revoked");
    expect(await exchangePass({ restaurantId: R, restaurantSlug: "s", code: m1!.code, ipHash: null })).toEqual({ ok: false, reason: "revoked" });

    const g2 = seedGrant();
    const m2 = await mintPassForGrant({ restaurantId: R, grantId: g2.id });
    h.state.giftWalletPasses.find((p) => p.grantId === g2.id)!.expiresAt = new Date(Date.now() - 1000);
    expect(await exchangePass({ restaurantId: R, restaurantSlug: "s", code: m2!.code, ipHash: null })).toEqual({ ok: false, reason: "expired" });
  });

  it("refuses once exchangeCount / failedAttempts hit the DB-enforced cap (does not fail open)", async () => {
    const grant = seedGrant();
    const minted = await mintPassForGrant({ restaurantId: R, grantId: grant.id });
    const row = h.state.giftWalletPasses.find((p) => p.grantId === grant.id)!;
    row.exchangeCount = 25;
    expect(await exchangePass({ restaurantId: R, restaurantSlug: "s", code: minted!.code, ipHash: null })).toEqual({ ok: false, reason: "too_many_attempts" });
    row.exchangeCount = 0;
    row.failedAttempts = 25;
    expect(await exchangePass({ restaurantId: R, restaurantSlug: "s", code: minted!.code, ipHash: null })).toEqual({ ok: false, reason: "too_many_attempts" });
  });

  it("re-exchanging an already-claimed grant succeeds (NOT single-use) as long as it resolves to the SAME wallet", async () => {
    // Claimed via the exact same pass earlier (e.g. a previous exchange, or
    // the guest twin was hydrated by this pass before) — status is "claimed"
    // but customerId already points at the wallet this exchange will
    // resolve to again. Must succeed, not refuse — re-spending across
    // multiple orders/devices is the whole point of a non-single-use pass.
    const grant = seedGrant({ email: "already@example.com", status: "pending" });
    const minted = await mintPassForGrant({ restaurantId: R, grantId: grant.id });
    const first = await exchangePass({ restaurantId: R, restaurantSlug: "s", code: minted!.code, ipHash: null });
    expect(first.ok).toBe(true);

    const second = await exchangePass({ restaurantId: R, restaurantSlug: "s", code: minted!.code, ipHash: null });
    expect(second.ok).toBe(true);
  });

  it("refuses (superseded) when the grant was claimed onto a DIFFERENT customer than this exchange resolves to — a genuine conflict", async () => {
    const grant = seedGrant({ email: "conflict@example.com", status: "claimed", customerId: "some_other_customer_id" });
    // some_other_customer_id deliberately has NO row in h.state.customers, so
    // the canonical resolution for this email creates/finds a DIFFERENT row
    // — simulating an anomaly where the grant's recorded claimant diverges
    // from what deterministic resolution would pick today.
    const minted = await mintPassForGrant({ restaurantId: R, grantId: grant.id });
    expect(await exchangePass({ restaurantId: R, restaurantSlug: "s", code: minted!.code, ipHash: null })).toEqual({ ok: false, reason: "superseded" });
  });
});

// ── resolveGiftPassSpender — the money-path seam ───────────────────────────
describe("resolveGiftPassSpender", () => {
  async function exchange(email: string, amount: number) {
    const grant = seedGrant({ email, amount });
    const minted = await mintPassForGrant({ restaurantId: R, grantId: grant.id });
    const res = await exchangePass({ restaurantId: R, restaurantSlug: "s", code: minted!.code, ipHash: null });
    if (!res.ok) throw new Error("exchange failed");
    (h.state as any).__cookie = res.sessionSecret;
    return res;
  }

  it("returns the customerId when restaurant + typed email both match", async () => {
    const res = await exchange("match@example.com", 10);
    expect(await resolveGiftPassSpender({ expectedRestaurantId: R, typedEmail: "match@example.com" })).toBe(res.customerId);
  });

  it("returns null with NO chain walk when the restaurant differs — strict equality only", async () => {
    await exchange("chain@example.com", 10);
    expect(await resolveGiftPassSpender({ expectedRestaurantId: R2, typedEmail: "chain@example.com" })).toBeNull();
  });

  it("returns null when the typed email doesn't match the pass's stored email (the email-match guard)", async () => {
    await exchange("real@example.com", 10);
    expect(await resolveGiftPassSpender({ expectedRestaurantId: R, typedEmail: "someoneelse@example.com" })).toBeNull();
  });

  it("returns null when no typed email is present at all", async () => {
    await exchange("noemail@example.com", 10);
    expect(await resolveGiftPassSpender({ expectedRestaurantId: R, typedEmail: null })).toBeNull();
  });

  it("returns null with no cookie present (fails closed)", async () => {
    (h.state as any).__cookie = undefined;
    expect(await resolveGiftPassSpender({ expectedRestaurantId: R, typedEmail: "anyone@example.com" })).toBeNull();
  });

  it("self-retires (revokes) when the resolved Customer row became an account mid-session, and never resolves again", async () => {
    const res = await exchange("becomes-account@example.com", 10);
    const customer = h.state.customers.find((c) => c.id === res.customerId)!;
    customer.passwordHash = "newly-set-hash"; // they signed up in another tab
    customer.signedUpAt = new Date();

    expect(await resolveGiftPassSpender({ expectedRestaurantId: R, typedEmail: "becomes-account@example.com" })).toBeNull();
    const passRow = h.state.giftWalletPasses.find((p) => p.customerId === res.customerId)!;
    expect(passRow.revokedAt).not.toBeNull();

    // Still null on a later call — the pass stays revoked.
    expect(await resolveGiftPassSpender({ expectedRestaurantId: R, typedEmail: "becomes-account@example.com" })).toBeNull();
  });

  it("uses a DISTINCT cookie name from the per-restaurant login session — never confusable with ff_rest_account", () => {
    expect(GIFT_PASS_COOKIE_NAME).not.toBe(RESTAURANT_CUSTOMER_COOKIE_NAME);
    expect(GIFT_PASS_COOKIE_NAME).toBe("ff_gift_pass");
  });
});

// ── Earn eligibility (guest twin must never earn) ──────────────────────────
describe("guest-twin earn eligibility", () => {
  it("a guest twin with a positive balance and no signedUpAt is NOT earn-eligible (fails closed)", async () => {
    const grant = seedGrant({ email: "earner@example.com", amount: 50 });
    const minted = await mintPassForGrant({ restaurantId: R, grantId: grant.id });
    const res = await exchangePass({ restaurantId: R, restaurantSlug: "s", code: minted!.code, ipHash: null });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(await getBalance({ restaurantId: R, customerId: res.customerId })).toBe(50);
    expect(await orderEligibleToEarn(res.customerId, new Date())).toBe(false);
  });
});

// ── claimPendingGiftsFor grantIds scoping ──────────────────────────────────
describe("claimPendingGiftsFor with grantIds scoping", () => {
  it("claims ONLY the specified grant ids, leaving other pending gifts for the same email untouched", async () => {
    const g1 = seedGrant({ email: "scoped@example.com", amount: 5 });
    const g2 = seedGrant({ email: "scoped@example.com", amount: 7 });
    h.state.customers.push({ id: "cust_scoped", restaurantId: R, email: "scoped@example.com", passwordHash: null, signedUpAt: null, customerAccountId: null, createdAt: new Date() });

    const result = await claimPendingGiftsFor({ restaurantId: R, customerId: "cust_scoped", email: "scoped@example.com", grantIds: [g1.id] });
    expect(result).toEqual({ claimed: 1, totalAmount: 5 });
    expect(h.state.grants.find((g) => g.id === g1.id)!.status).toBe("claimed");
    expect(h.state.grants.find((g) => g.id === g2.id)!.status).toBe("pending");
  });

  it("absent grantIds claims every pending gift for the email — today's behaviour, unchanged", async () => {
    const g1 = seedGrant({ email: "all@example.com", amount: 5 });
    const g2 = seedGrant({ email: "all@example.com", amount: 7 });
    h.state.customers.push({ id: "cust_all", restaurantId: R, email: "all@example.com", passwordHash: null, signedUpAt: null, customerAccountId: null, createdAt: new Date() });

    const result = await claimPendingGiftsFor({ restaurantId: R, customerId: "cust_all", email: "all@example.com" });
    expect(result).toEqual({ claimed: 2, totalAmount: 12 });
    expect(h.state.grants.find((g) => g.id === g1.id)!.status).toBe("claimed");
    expect(h.state.grants.find((g) => g.id === g2.id)!.status).toBe("claimed");
  });
});

// ── Revocation ──────────────────────────────────────────────────────────────
describe("revokeGiftWalletPassForGrant", () => {
  it("is guarded — calling it twice is safe and the reason from the FIRST call sticks", async () => {
    const grant = seedGrant();
    await mintPassForGrant({ restaurantId: R, grantId: grant.id });
    await revokeGiftWalletPassForGrant(grant.id, "gift_revoked");
    await revokeGiftWalletPassForGrant(grant.id, "became_account"); // no-op — already revoked
    const row = h.state.giftWalletPasses.find((p) => p.grantId === grant.id)!;
    expect(row.revokedReason).toBe("gift_revoked");
  });
});
