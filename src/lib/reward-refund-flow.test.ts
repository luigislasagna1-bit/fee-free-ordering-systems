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

/**
 * Gift Wallet Pass (2026-08-03): a pass-funded order spends from the
 * guest-twin Customer's RewardAccount exactly like any other spend —
 * releaseForOrder / refundForOrder are agnostic to WHY a Customer row
 * exists, only to the accountId named on the ledger rows they're undoing.
 * These tests re-run the release/refund lifecycle against an account that
 * stands in for a Gift Wallet Pass guest twin (no signedUpAt, no
 * passwordHash — same shape resolveGiftPassSpender's wallet holder has) to
 * close the design spec's explicit ask that this path be exercised for a
 * pass-funded order, not just inferred from the generic case above.
 */
describe("release/refund after a Gift-Wallet-Pass-funded spend", () => {
  const ORDER_G = "order_giftpass";

  function seedGiftPassSpend() {
    // A guest-twin wallet (earned nothing — it never can) that spent $8 of a
    // gifted $20 balance on ORDER_G, and — because tips are excluded from a
    // pass spend's redeemable base — there is no earn row at all: guest
    // twins never earn (orderEligibleToEarn fails closed with no
    // signedUpAt).
    h.state.accounts = [{ id: "acct_giftpass", restaurantId: R, customerId: "cust_guest_twin", balance: 12, lifetimeEarned: 0, lifetimeRedeemed: 8 }];
    h.state.ledger = [
      { id: "led_spend_g", accountId: "acct_giftpass", orderId: ORDER_G, reason: "spend", status: "applied", amount: -8, balanceAfter: 12 },
    ];
    h.state.nextId = 200;
  }

  it("releaseForOrder returns the full spend to the guest-twin wallet on a missed/rejected order", async () => {
    seedGiftPassSpend();
    await releaseForOrder(ORDER_G);
    expect(h.state.accounts[0].balance).toBe(20);
    expect(h.state.ledger.find((r) => r.id === "led_spend_g")!.status).toBe("released");
  });

  it("refundForOrder returns the spend on a captured-then-refunded pass order, with no earn to claw back", async () => {
    seedGiftPassSpend();
    // Completed: spend flips applied → redeemed (mirrors redeemForOrder).
    h.state.ledger.find((r) => r.id === "led_spend_g")!.status = "redeemed";
    await refundForOrder(ORDER_G);
    expect(h.state.accounts[0].balance).toBe(20); // 12 + 8 back, nothing to claw back
    expect(h.state.ledger.find((r) => r.id === "led_spend_g")!.status).toBe("refunded");
    expect(h.state.ledger.some((r) => r.reason === "reverse" && r.orderId === ORDER_G)).toBe(false);
  });

  it("is idempotent on a double-fire (webhook retry) for a pass-funded refund", async () => {
    seedGiftPassSpend();
    h.state.ledger.find((r) => r.id === "led_spend_g")!.status = "redeemed";
    await refundForOrder(ORDER_G);
    const after = h.state.accounts[0].balance;
    await refundForOrder(ORDER_G);
    expect(h.state.accounts[0].balance).toBe(after);
  });
});

/**
 * SPLIT-IDENTITY orders (Luigi 2026-07-31, found from his own checkout
 * screenshots). /api/orders resolves the Order's Customer row from the TYPED
 * email, while the wallet spend comes from the SIGNED-IN session — so one
 * order's ledger rows can sit on two different accounts: A paid, B earned.
 *
 * refundForOrder used to read ONE arbitrary `rows[0].accountId` (findMany has
 * no orderBy, so not even deterministic) and apply BOTH the spend refund and
 * the earn clawback to it. Depending on row order that either refunded a
 * stranger or docked the payer for credit somebody else earned.
 *
 * Each write must now land on the account named by the row it is undoing.
 */
describe("refundForOrder on a split-identity order (A paid, B earned)", () => {
  const ORDER_S = "order_split";
  const acct = (id: string) => h.state.accounts.find((a) => a.id === id)!;

  function seedSplit(rowsNewestFirst: boolean) {
    // A spent $5 of a $11.50 wallet. B earned $1.50 on the same order.
    h.state.accounts = [
      { id: "acct_A", restaurantId: R, customerId: "cust_A", balance: 6.5, lifetimeEarned: 11.5, lifetimeRedeemed: 5 },
      { id: "acct_B", restaurantId: R, customerId: "cust_B", balance: 1.5, lifetimeEarned: 1.5, lifetimeRedeemed: 0 },
    ];
    const spendRow = { id: "led_spend_A", accountId: "acct_A", orderId: ORDER_S, reason: "spend", status: "redeemed", amount: -5, balanceAfter: 6.5 };
    const earnRow = { id: "led_earn_B", accountId: "acct_B", orderId: ORDER_S, reason: "earn", status: null, amount: 1.5, balanceAfter: 1.5 };
    // Row order is NOT guaranteed by the query — prove the outcome is identical
    // either way, which is precisely what the rows[0] bug got wrong.
    h.state.ledger = rowsNewestFirst ? [earnRow, spendRow] : [spendRow, earnRow];
    h.state.nextId = 100;
  }

  it("returns the spend to the account that PAID and claws the earn back from the account that EARNED", async () => {
    seedSplit(false);
    await refundForOrder(ORDER_S);

    expect(acct("acct_A").balance).toBe(11.5); // 6.5 + 5 returned — nothing clawed back here
    expect(acct("acct_B").balance).toBe(0);    // 1.5 − 1.5 earn reversed

    expect(h.state.ledger.find((r) => r.reason === "refund" && r.orderId === ORDER_S)!.accountId).toBe("acct_A");
    expect(h.state.ledger.find((r) => r.reason === "reverse" && r.orderId === ORDER_S)!.accountId).toBe("acct_B");
  });

  it("is unaffected by ledger row ORDER — the earn row arriving first must not redirect the refund", async () => {
    seedSplit(true); // earn row first: the old code refunded acct_B, a stranger
    await refundForOrder(ORDER_S);

    expect(acct("acct_A").balance).toBe(11.5);
    expect(acct("acct_B").balance).toBe(0);
    // The payer's own refund row never lands on the other wallet.
    expect(h.state.ledger.some((r) => r.reason === "refund" && r.accountId === "acct_B")).toBe(false);
  });

  it("stays idempotent per account when fired twice", async () => {
    seedSplit(false);
    await refundForOrder(ORDER_S);
    const a = acct("acct_A").balance;
    const b = acct("acct_B").balance;
    const rows = h.state.ledger.length;

    await refundForOrder(ORDER_S);
    expect(acct("acct_A").balance).toBe(a);
    expect(acct("acct_B").balance).toBe(b);
    expect(h.state.ledger.length).toBe(rows);
  });

  it("claws back from EVERY earning account when an order earned on more than one", async () => {
    seedSplit(false);
    h.state.accounts.push({ id: "acct_C", restaurantId: R, customerId: "cust_C", balance: 2, lifetimeEarned: 2, lifetimeRedeemed: 0 });
    h.state.ledger.push({ id: "led_earn_C", accountId: "acct_C", orderId: ORDER_S, reason: "promo:p1", status: null, amount: 2, balanceAfter: 2 });

    await refundForOrder(ORDER_S);

    expect(acct("acct_A").balance).toBe(11.5);
    expect(acct("acct_B").balance).toBe(0);
    expect(acct("acct_C").balance).toBe(0); // promo:<id> earns are in the clawback filter too
  });
});
