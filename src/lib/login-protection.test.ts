/**
 * Blocker #9 — login brute-force protection.
 *
 * No shared store configured in tests → the counters exercise the local
 * fallback path (same semantics per isolate). The DB lockout layer is
 * driven against an in-memory User row.
 */
import { describe, it, expect, vi } from "vitest";

const h = vi.hoisted(() => ({ user: { id: "u1", failedLoginCount: 0, lockedUntil: null as Date | null } }));

vi.mock("@/lib/db", () => ({
  default: {
    user: {
      update: async ({ where, data }: any) => {
        if (where.id !== h.user.id) throw new Error("not found");
        if (data.failedLoginCount?.increment) h.user.failedLoginCount += data.failedLoginCount.increment;
        else if (data.failedLoginCount !== undefined) h.user.failedLoginCount = data.failedLoginCount;
        if (data.lockedUntil !== undefined) h.user.lockedUntil = data.lockedUntil;
        return { ...h.user };
      },
    },
  },
}));

import {
  loginAttemptAllowed, recordLoginFailure, userNotLocked,
  registerUserLoginFailure, clearUserLoginFailures, ipFromHeaderBag,
} from "./login-protection";

describe("failure-count limiting (per-isolate fallback)", () => {
  it("allows attempts until ~10 failures, then blocks the ip+email pair", async () => {
    const args = { scope: "admin", ip: "1.2.3.4", email: "owner@x.com" };
    expect(await loginAttemptAllowed(args)).toBe(true);
    for (let i = 0; i < 10; i++) await recordLoginFailure(args);
    expect(await loginAttemptAllowed(args)).toBe(false);
    // Same email from a different IP is also blocked (email counter).
    expect(await loginAttemptAllowed({ ...args, ip: "5.6.7.8" })).toBe(false);
    // A different email from the blocked IP is also blocked (IP counter).
    expect(await loginAttemptAllowed({ ...args, email: "other@x.com" })).toBe(false);
  });

  it("scopes are independent — a customer-login flood doesn't lock the admin surface", async () => {
    const ip = "9.9.9.9";
    for (let i = 0; i < 10; i++) await recordLoginFailure({ scope: "customer", ip, email: "c@x.com" });
    expect(await loginAttemptAllowed({ scope: "customer", ip, email: "c@x.com" })).toBe(false);
    expect(await loginAttemptAllowed({ scope: "admin", ip, email: "c@x.com" })).toBe(true);
  });

  it("raw attempt flood (successes included) is capped", async () => {
    const args = { scope: "restcust", ip: "2.2.2.2", email: "flood@x.com" };
    let blocked = false;
    for (let i = 0; i < 40; i++) {
      if (!(await loginAttemptAllowed(args))) { blocked = true; break; }
    }
    expect(blocked).toBe(true);
  });
});

describe("DB lockout on the User row", () => {
  it("locks after the threshold of wrong passwords and clears on success", async () => {
    h.user.failedLoginCount = 0;
    h.user.lockedUntil = null;
    expect(userNotLocked(h.user)).toBe(true);

    for (let i = 0; i < 10; i++) await registerUserLoginFailure("u1");
    expect(h.user.lockedUntil).not.toBeNull();
    expect(h.user.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
    expect(userNotLocked(h.user)).toBe(false);
    expect(h.user.failedLoginCount).toBe(0); // reset when the lock stamps

    // Lock expires → allowed again.
    h.user.lockedUntil = new Date(Date.now() - 1000);
    expect(userNotLocked(h.user)).toBe(true);

    // Successful login wipes any residue.
    h.user.failedLoginCount = 3;
    await clearUserLoginFailures(h.user);
    expect(h.user.failedLoginCount).toBe(0);
    expect(h.user.lockedUntil).toBeNull();
  });
});

describe("ipFromHeaderBag", () => {
  it("reads x-forwarded-for from both plain objects and Headers", () => {
    expect(ipFromHeaderBag({ "x-forwarded-for": "1.1.1.1, 10.0.0.1" })).toBe("1.1.1.1");
    expect(ipFromHeaderBag(new Headers({ "x-real-ip": "2.2.2.2" }))).toBe("2.2.2.2");
    expect(ipFromHeaderBag(undefined)).toBe("unknown");
  });
});
