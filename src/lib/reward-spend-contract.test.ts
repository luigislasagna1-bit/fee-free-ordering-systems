/**
 * LR-DB-02 / H-2 — the reward "spend" ledger row is now written ATOMICALLY
 * inside the order-create transaction (orders route), replacing a standalone
 * post-create write that could crash and leave the wallet debited with no row.
 *
 * The atomic commit/rollback itself is a Prisma/Postgres guarantee. What THIS
 * test locks is the row-shape CONTRACT: buildSpendLedgerData (used by both the
 * atomic write and recordSpendForOrder) must produce exactly the row that
 * releaseForOrder / refundForOrder query on — reason:"spend", status:"applied",
 * a negative amount — or a refund/cancel would silently fail to return credit.
 */
import { describe, it, expect, vi } from "vitest";

// buildSpendLedgerData is pure; @/lib/reward-ledger imports the prisma singleton
// at module load, which throws without DATABASE_URL. Mock it away.
vi.mock("@/lib/db", () => ({ default: {} }));

import { buildSpendLedgerData } from "@/lib/reward-ledger";

describe("buildSpendLedgerData — spend row contract (H-2)", () => {
  it("produces the exact row release/refund query for", () => {
    const row = buildSpendLedgerData({ accountId: "acct1", applied: 12.34, balance: 5.66, orderId: "o1" });
    expect(row.reason).toBe("spend");     // releaseForOrder/refundForOrder filter on this
    expect(row.status).toBe("applied");   // ...and this
    expect(row.orderId).toBe("o1");
    expect(row.accountId).toBe("acct1");
    expect(row.amount).toBe(-12.34);      // NEGATIVE — a spend
    expect(row.balanceAfter).toBe(5.66);
  });

  it("rounds to cents (no float dust in the ledger)", () => {
    const row = buildSpendLedgerData({ accountId: "a", applied: 0.1 + 0.2, balance: 9.999, orderId: "o" });
    expect(row.amount).toBe(-0.3);
    expect(row.balanceAfter).toBe(10);
  });

  it("reason/status are the literal strings the release query uses (regression lock)", () => {
    // If someone renames "spend"/"applied" here, refunds break silently — this
    // asserts the two ends can't drift independently.
    const row = buildSpendLedgerData({ accountId: "a", applied: 1, balance: 0, orderId: "o" });
    expect({ reason: row.reason, status: row.status }).toEqual({ reason: "spend", status: "applied" });
  });
});
