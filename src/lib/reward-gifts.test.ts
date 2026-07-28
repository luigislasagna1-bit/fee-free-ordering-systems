import { describe, it, expect, vi, beforeEach } from "vitest";

const { prismaMock, grantMock } = vi.hoisted(() => ({
  prismaMock: {
    pendingRewardGrant: { findMany: vi.fn(), updateMany: vi.fn() },
  },
  grantMock: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ default: prismaMock }));
vi.mock("@/lib/reward-ledger", () => ({ grant: grantMock }));

import { claimPendingGiftsFor, isAccountCustomer } from "./reward-gifts";

beforeEach(() => {
  vi.clearAllMocks();
  grantMock.mockResolvedValue({ ok: true, balanceAfter: 10 });
  prismaMock.pendingRewardGrant.updateMany.mockResolvedValue({ count: 1 });
});

describe("claimPendingGiftsFor", () => {
  it("claims each pending gift atomically and credits with the gift:<id> ledger key", async () => {
    prismaMock.pendingRewardGrant.findMany.mockResolvedValue([
      { id: "g1", amount: 10, note: "welcome!" },
      { id: "g2", amount: 5, note: null },
    ]);

    const res = await claimPendingGiftsFor({ restaurantId: "r1", customerId: "c1", email: "Erik@Example.com" });

    expect(res).toEqual({ claimed: 2, totalAmount: 15 });
    // Email lowercased for the lookup.
    expect(prismaMock.pendingRewardGrant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { restaurantId: "r1", email: "erik@example.com", status: "pending" } }),
    );
    // Atomic pending→claimed flip per gift.
    expect(prismaMock.pendingRewardGrant.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "g1", status: "pending" } }),
    );
    // Wallet credit carries the synthetic idempotency key + reason "grant"
    // (outside the refund clawback filter).
    expect(grantMock).toHaveBeenCalledWith(
      expect.objectContaining({ restaurantId: "r1", customerId: "c1", amount: 10, reason: "grant", orderId: "gift:g1" }),
    );
    expect(grantMock).toHaveBeenCalledWith(expect.objectContaining({ amount: 5, orderId: "gift:g2" }));
  });

  it("skips a gift a concurrent claim already won (count=0) without crediting", async () => {
    prismaMock.pendingRewardGrant.findMany.mockResolvedValue([{ id: "g1", amount: 10, note: null }]);
    prismaMock.pendingRewardGrant.updateMany.mockResolvedValue({ count: 0 });

    const res = await claimPendingGiftsFor({ restaurantId: "r1", customerId: "c1", email: "a@b.co" });

    expect(res).toEqual({ claimed: 0, totalAmount: 0 });
    expect(grantMock).not.toHaveBeenCalled();
  });

  it("reverts the gift to pending when the wallet credit fails (never loses money)", async () => {
    prismaMock.pendingRewardGrant.findMany.mockResolvedValue([{ id: "g1", amount: 10, note: null }]);
    grantMock.mockResolvedValue({ ok: false, balanceAfter: 0 });

    const res = await claimPendingGiftsFor({ restaurantId: "r1", customerId: "c1", email: "a@b.co" });

    expect(res).toEqual({ claimed: 0, totalAmount: 0 });
    // Second updateMany = the revert claimed→pending.
    expect(prismaMock.pendingRewardGrant.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "g1", status: "claimed" },
        data: expect.objectContaining({ status: "pending" }),
      }),
    );
  });

  it("never throws — a DB failure returns zero claims", async () => {
    prismaMock.pendingRewardGrant.findMany.mockRejectedValue(new Error("db down"));
    const res = await claimPendingGiftsFor({ restaurantId: "r1", customerId: "c1", email: "a@b.co" });
    expect(res).toEqual({ claimed: 0, totalAmount: 0 });
  });
});

describe("isAccountCustomer", () => {
  it("true for any of: signedUpAt, passwordHash, linked marketplace account", () => {
    expect(isAccountCustomer({ signedUpAt: new Date(), passwordHash: null, customerAccountId: null })).toBe(true);
    expect(isAccountCustomer({ signedUpAt: null, passwordHash: "x", customerAccountId: null })).toBe(true);
    expect(isAccountCustomer({ signedUpAt: null, passwordHash: null, customerAccountId: "ca1" })).toBe(true);
  });
  it("false for a pure guest CRM row", () => {
    expect(isAccountCustomer({ signedUpAt: null, passwordHash: null, customerAccountId: null })).toBe(false);
  });
});
