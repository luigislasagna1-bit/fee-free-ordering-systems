/**
 * Blocker #8 — reward store-credit must survive a captured-order refund.
 *
 * The kill paths (manual cancel/reject + auto-reject) call releaseForOrder,
 * which is a NO-OP once the spend was `redeemed` at order completion — so a
 * customer who paid partly in Reward Dollars and was then refunded lost that
 * credit permanently. Both captured-refund paths now ALSO call
 * refundForOrder(). These tests drive the ledger lifecycle over an in-memory
 * prisma and assert the wallet is made whole EXACTLY once:
 *
 *   complete → cancel → refund   restores the spend + claws back the earn
 *   double-fire                  second refundForOrder changes nothing
 *   release-then-refund          an already-released spend is never
 *                                returned twice (auto-reject then refund)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => {
  const state = {
    accounts: [] as any[],
    ledger: [] as any[],
    nextId: 1,
  };
  return { state };
});

vi.mock("@/lib/db", () => {
  const s = h.state;
  const matchLedger = (r: any, where: any): boolean => {
    if (where.id !== undefined && r.id !== where.id) return false;
    if (where.orderId !== undefined && r.orderId !== where.orderId) return false;
    if (where.reason !== undefined && r.reason !== where.reason) return false;
    if (where.status !== undefined && r.status !== where.status) return false;
    return true;
  };
  const applyAccountUpdate = (a: any, data: any) => {
    for (const key of ["balance", "lifetimeRedeemed", "lifetimeEarned"]) {
      if (data[key] === undefined) continue;
      if (typeof data[key] === "number") a[key] = data[key];
      else if (data[key].increment !== undefined) a[key] += data[key].increment;
      else if (data[key].decrement !== undefined) a[key] -= data[key].decrement;
    }
  };
  const client = {
    rewardAccount: {
      findUnique: async ({ where }: any) => {
        if (where.id) return s.accounts.find((a) => a.id === where.id) ?? null;
        if (where.restaurantId_customerId) {
          const { restaurantId, customerId } = where.restaurantId_customerId;
          return s.accounts.find((a) => a.restaurantId === restaurantId && a.customerId === customerId) ?? null;
        }
        return null;
      },
      update: async ({ where, data }: any) => {
        const a = s.accounts.find((x) => x.id === where.id);
        if (!a) throw new Error("account not found");
        applyAccountUpdate(a, data);
        return { ...a };
      },
    },
    rewardLedger: {
      findFirst: async ({ where }: any) => s.ledger.find((r) => matchLedger(r, where)) ?? null,
      findMany: async ({ where }: any) => s.ledger.filter((r) => matchLedger(r, where)).map((r) => ({ ...r })),
      findUnique: async ({ where }: any) => {
        const k = where.accountId_orderId_reason;
        if (!k) return s.ledger.find((r) => r.id === where.id) ?? null;
        return s.ledger.find((r) => r.accountId === k.accountId && r.orderId === k.orderId && r.reason === k.reason) ?? null;
      },
      update: async ({ where, data }: any) => {
        const r = s.ledger.find((x) => x.id === where.id);
        if (!r) throw new Error("ledger row not found");
        Object.assign(r, data);
        return { ...r };
      },
      updateMany: async ({ where, data }: any) => {
        const rows = s.ledger.filter((r) => matchLedger(r, where));
        for (const r of rows) Object.assign(r, data);
        return { count: rows.length };
      },
      create: async ({ data }: any) => {
        // Mirror @@unique([accountId, orderId, reason]) — the idempotency
        // backstop refundForOrder relies on under concurrent double-fire.
        if (
          data.orderId &&
          s.ledger.some((r) => r.accountId === data.accountId && r.orderId === data.orderId && r.reason === data.reason)
        ) {
          const err: any = new Error("Unique constraint failed");
          err.code = "P2002";
          throw err;
        }
        const row = { id: `led_${h.state.nextId++}`, status: null, orderId: null, ...data };
        s.ledger.push(row);
        return { ...row };
      },
    },
    $transaction: async (cb: any) => cb(client),
  };
  return { default: client };
});

import { redeemForOrder, releaseForOrder, refundForOrder } from "./reward-ledger";

const R = "rest_1";
const C = "cust_1";
const ORDER = "order_1";

function seedCompletedOrderWithCredit() {
  // Wallet had $10; customer spent $5 of it on ORDER (balance decremented at
  // claim time by reserveCredit) and earned $1.50 back when it completed.
  h.state.accounts = [{ id: "acct_1", restaurantId: R, customerId: C, balance: 6.5, lifetimeEarned: 11.5, lifetimeRedeemed: 5 }];
  h.state.ledger = [
    { id: "led_spend", accountId: "acct_1", orderId: ORDER, reason: "spend", status: "applied", amount: -5, balanceAfter: 5 },
    { id: "led_earn", accountId: "acct_1", orderId: ORDER, reason: "earn", status: null, amount: 1.5, balanceAfter: 6.5 },
  ];
  h.state.nextId = 1;
}

const balance = () => h.state.accounts[0].balance;

beforeEach(() => seedCompletedOrderWithCredit());

describe("reward wallet on captured-order refund (Blocker #8)", () => {
  it("complete → cancel → refund restores the spend and claws back the earn, exactly once", async () => {
    await redeemForOrder(ORDER); // completion: spend applied → redeemed
    expect(h.state.ledger.find((r) => r.id === "led_spend")!.status).toBe("redeemed");

    // Cancel/refund path: release first (the kill flow always runs it)…
    await releaseForOrder(ORDER);
    expect(balance()).toBe(6.5); // no-op — the spend is redeemed, this was the OLD bug

    // …then the new refundForOrder call makes the wallet whole.
    await refundForOrder(ORDER);
    expect(balance()).toBe(10); // 6.5 + 5 (spend back) − 1.5 (earn clawed back)
    expect(h.state.ledger.find((r) => r.id === "led_spend")!.status).toBe("refunded");
    expect(h.state.ledger.some((r) => r.reason === "refund" && r.orderId === ORDER)).toBe(true);
    expect(h.state.ledger.some((r) => r.reason === "reverse" && r.orderId === ORDER)).toBe(true);
  });

  it("double-fire is idempotent: a second refundForOrder changes nothing", async () => {
    await redeemForOrder(ORDER);
    await refundForOrder(ORDER);
    const after = balance();
    const rows = h.state.ledger.length;

    await refundForOrder(ORDER); // webhook retry / double PATCH
    expect(balance()).toBe(after);
    expect(h.state.ledger.length).toBe(rows);
  });

  it("a spend already released (auto-reject) is never returned twice by a later refund", async () => {
    // Order never completed: spend still "applied" → auto-reject releases it.
    await releaseForOrder(ORDER);
    expect(balance()).toBe(11.5); // 6.5 + 5 back (earn row seeded for simplicity, not yet reversed)

    await refundForOrder(ORDER); // captured-branch belt-and-suspenders call
    // Spend is "released" → skipped. Earned credit tied to the order is
    // clawed back once. No double-credit of the spend.
    expect(balance()).toBe(10);
    expect(h.state.ledger.filter((r) => r.reason === "refund")).toHaveLength(0);
  });

  it("earn clawback clamps the balance at zero if the credit was already spent elsewhere", async () => {
    await redeemForOrder(ORDER);
    // Customer drained the wallet before the refund landed.
    h.state.accounts[0].balance = 0;
    await refundForOrder(ORDER);
    // 0 + 5 (spend back) − 1.5 (earn clawback) = 3.5 — never negative.
    expect(balance()).toBe(3.5);
    expect(balance()).toBeGreaterThanOrEqual(0);
  });
});
