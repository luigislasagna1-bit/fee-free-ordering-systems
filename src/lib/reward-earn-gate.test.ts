/**
 * Guest orders must not earn reward credit (Luigi 2026-07-09).
 *
 * A brand-new account surfaced $3.46 earned on a GUEST order placed 10 days
 * before signup — guest checkouts create a passwordHash-null Customer row, the
 * completion hooks granted earn into its silent wallet, and signing up handed
 * the balance over retroactively. The gate: an order earns ONLY when the
 * customer had already signed up (Customer.signedUpAt, or the linked
 * marketplace CustomerAccount's createdAt) when the order was PLACED
 * (order.createdAt — not completedAt, or a mid-flight signup would earn).
 *
 * These tests drive orderEligibleToEarn / earnSignupDateFor plus the full
 * awardForOrder path over an in-memory prisma: guest completion writes no
 * ledger row, member completion writes exactly one.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => {
  const state = {
    customers: [] as any[],
    orders: [] as any[],
    accounts: [] as any[],
    ledger: [] as any[],
    nextId: 1,
    failCustomerLookup: false,
  };
  return { state };
});

vi.mock("@/lib/db", () => {
  const s = h.state;
  const prisma: any = {
    customer: {
      findUnique: async ({ where }: any) => {
        if (s.failCustomerLookup) throw new Error("db down");
        return s.customers.find((c) => c.id === where.id) ?? null;
      },
    },
    order: {
      findUnique: async ({ where }: any) => s.orders.find((o) => o.id === where.id) ?? null,
      count: async () => 0,
    },
    menuItem: {
      findMany: async () => [],
    },
    rewardAccount: {
      upsert: async ({ where, create }: any) => {
        let a = s.accounts.find(
          (x) => x.restaurantId === where.restaurantId_customerId.restaurantId && x.customerId === where.restaurantId_customerId.customerId,
        );
        if (!a) {
          a = { id: `acct${s.nextId++}`, balance: 0, lifetimeEarned: 0, ...create };
          s.accounts.push(a);
        }
        return { id: a.id, balance: a.balance };
      },
      update: async ({ where, data }: any) => {
        const a = s.accounts.find((x) => x.id === where.id);
        if (data.balance?.increment !== undefined) a.balance += data.balance.increment;
        else if (typeof data.balance === "number") a.balance = data.balance;
        if (data.lifetimeEarned?.increment !== undefined) a.lifetimeEarned += data.lifetimeEarned.increment;
        return { balance: a.balance };
      },
      findFirst: async ({ where }: any) => s.accounts.find((x) => x.restaurantId === where.restaurantId && x.customerId === where.customerId) ?? null,
    },
    rewardLedger: {
      findUnique: async ({ where }: any) => {
        const k = where.accountId_orderId_reason;
        return s.ledger.find((r) => r.accountId === k.accountId && r.orderId === k.orderId && r.reason === k.reason) ?? null;
      },
      create: async ({ data }: any) => {
        const row = { id: `led${s.nextId++}`, ...data };
        s.ledger.push(row);
        return row;
      },
    },
    $transaction: async (fn: any) => fn(prisma),
  };
  return { default: prisma };
});

import { orderEligibleToEarn, earnSignupDateFor, awardForOrder } from "@/lib/reward-ledger";

const D = (iso: string) => new Date(iso);

beforeEach(() => {
  h.state.customers = [];
  h.state.orders = [];
  h.state.accounts = [];
  h.state.ledger = [];
  h.state.nextId = 1;
  h.state.failCustomerLookup = false;
});

describe("earnSignupDateFor / orderEligibleToEarn", () => {
  it("guest (no signedUpAt, no marketplace account) never earns", async () => {
    h.state.customers.push({ id: "c1", signedUpAt: null, customerAccount: null });
    expect(await earnSignupDateFor("c1")).toBeNull();
    expect(await orderEligibleToEarn("c1", D("2026-07-09T00:00:00Z"))).toBe(false);
  });

  it("member earns on orders placed AFTER signup", async () => {
    h.state.customers.push({ id: "c1", signedUpAt: D("2026-07-01T00:00:00Z"), customerAccount: null });
    expect(await orderEligibleToEarn("c1", D("2026-07-09T00:00:00Z"))).toBe(true);
  });

  it("order placed BEFORE signup never earns, even completed after (the Sameem case)", async () => {
    // Guest order placed 6/28; signup 7/9; completion would run after signup.
    h.state.customers.push({ id: "c1", signedUpAt: D("2026-07-09T20:00:00Z"), customerAccount: null });
    expect(await orderEligibleToEarn("c1", D("2026-06-28T04:45:33Z"))).toBe(false);
  });

  it("marketplace CustomerAccount counts as signup (its createdAt)", async () => {
    h.state.customers.push({ id: "c1", signedUpAt: null, customerAccount: { createdAt: D("2026-07-01T00:00:00Z") } });
    expect(await orderEligibleToEarn("c1", D("2026-07-02T00:00:00Z"))).toBe(true);
    expect(await orderEligibleToEarn("c1", D("2026-06-30T00:00:00Z"))).toBe(false);
  });

  it("fails CLOSED: db error or missing customer → no earn", async () => {
    expect(await orderEligibleToEarn(null, D("2026-07-09T00:00:00Z"))).toBe(false);
    expect(await orderEligibleToEarn("nope", D("2026-07-09T00:00:00Z"))).toBe(false);
    h.state.customers.push({ id: "c1", signedUpAt: D("2026-07-01T00:00:00Z"), customerAccount: null });
    h.state.failCustomerLookup = true;
    expect(await orderEligibleToEarn("c1", D("2026-07-09T00:00:00Z"))).toBe(false);
  });
});

describe("awardForOrder gate", () => {
  const restaurant = { rewardsEnabled: true, rewardEarnEnabled: true, rewardEarnMode: "percent", rewardEarnPercent: 5, rewardEarnPerDollar: 0 };
  const baseOrder = { restaurantId: "r1", subtotal: 69.2, couponDiscount: 0, promoDiscount: 0, items: [], restaurant };

  it("guest order completes → NO earn ledger row", async () => {
    h.state.customers.push({ id: "guest", signedUpAt: null, customerAccount: null });
    h.state.orders.push({ id: "o1", customerId: "guest", createdAt: D("2026-06-28T00:00:00Z"), ...baseOrder });
    await awardForOrder({ orderId: "o1" });
    expect(h.state.ledger).toHaveLength(0);
  });

  it("member order (placed after signup) completes → exactly one earn row", async () => {
    h.state.customers.push({ id: "m1", signedUpAt: D("2026-07-01T00:00:00Z"), customerAccount: null });
    h.state.orders.push({ id: "o2", customerId: "m1", createdAt: D("2026-07-09T00:00:00Z"), ...baseOrder });
    await awardForOrder({ orderId: "o2" });
    expect(h.state.ledger).toHaveLength(1);
    expect(h.state.ledger[0].reason).toBe("earn");
    expect(h.state.ledger[0].amount).toBeCloseTo(3.46, 2);
    // Idempotent on re-fire (cron + PATCH both completing).
    await awardForOrder({ orderId: "o2" });
    expect(h.state.ledger).toHaveLength(1);
  });

  it("order placed pre-signup by a now-member → NO earn row", async () => {
    h.state.customers.push({ id: "m2", signedUpAt: D("2026-07-09T20:00:00Z"), customerAccount: null });
    h.state.orders.push({ id: "o3", customerId: "m2", createdAt: D("2026-06-28T00:00:00Z"), ...baseOrder });
    await awardForOrder({ orderId: "o3" });
    expect(h.state.ledger).toHaveLength(0);
  });
});
