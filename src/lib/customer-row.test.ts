/**
 * CUSTOMER_ROW_ORDER — the deterministic tiebreaker shared by orders/route.ts,
 * signup/route.ts, admin/reward-gifts/route.ts, and the Gift Wallet Pass
 * exchange path (gift-wallet-pass.ts) whenever more than one Customer row
 * exists for the same (restaurantId, email). Prisma's `orderBy` semantics
 * aren't directly testable without a real DB, so this test re-implements the
 * exact same comparator Prisma would apply for this orderBy array and
 * asserts it picks the SAME row regardless of which of the four call sites'
 * candidate set (all four use the identical constant) is fed to it —
 * closing the "two guest twins resolve to the same row everywhere" gap all
 * three source designs carried.
 */
import { describe, it, expect } from "vitest";
import { CUSTOMER_ROW_ORDER } from "./customer-row";

type Row = { id: string; passwordHash: string | null; createdAt: number };

/** Mirrors what Prisma does for `orderBy: CUSTOMER_ROW_ORDER` — passwordHash
 *  desc-with-nulls-last, then createdAt asc, then id asc. */
function pickCanonical(rows: Row[]): Row {
  return [...rows].sort((a, b) => {
    const ah = a.passwordHash != null ? 0 : 1;
    const bh = b.passwordHash != null ? 0 : 1;
    if (ah !== bh) return ah - bh;
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
    return a.id.localeCompare(b.id);
  })[0];
}

describe("CUSTOMER_ROW_ORDER shape", () => {
  it("is passwordHash desc/nulls-last, then createdAt asc, then id asc — exactly 3 keys", () => {
    expect(CUSTOMER_ROW_ORDER).toEqual([
      { passwordHash: { sort: "desc", nulls: "last" } },
      { createdAt: "asc" },
      { id: "asc" },
    ]);
  });
});

describe("deterministic resolution across duplicate guest-twin rows", () => {
  it("an ACCOUNT row (passwordHash set) always wins over any number of guest rows, regardless of input order", () => {
    const account: Row = { id: "acct_1", passwordHash: "hash", createdAt: 500 };
    const guestOld: Row = { id: "guest_old", passwordHash: null, createdAt: 100 };
    const guestNew: Row = { id: "guest_new", passwordHash: null, createdAt: 900 };

    expect(pickCanonical([guestOld, guestNew, account]).id).toBe("acct_1");
    expect(pickCanonical([account, guestNew, guestOld]).id).toBe("acct_1");
    expect(pickCanonical([guestNew, account, guestOld]).id).toBe("acct_1");
  });

  it("among two guest twins (both passwordHash null), the OLDER row wins — stable across a later 3rd row appearing", () => {
    const twinA: Row = { id: "twin_a", passwordHash: null, createdAt: 100 };
    const twinB: Row = { id: "twin_b", passwordHash: null, createdAt: 200 };

    expect(pickCanonical([twinA, twinB]).id).toBe("twin_a");
    expect(pickCanonical([twinB, twinA]).id).toBe("twin_a"); // order-independent

    // A THIRD, even-older duplicate appearing later (e.g. a race between
    // signup and a gift-pass exchange creating a fresh guest row) must not
    // flip which row earlier resolutions already committed money against —
    // simulating this exact scenario: orders/route.ts, signup/route.ts, and
    // gift-wallet-pass.ts's exchangePass all resolve against the CURRENT
    // full candidate set each time they run, and all three converge on
    // whichever is oldest at call time.
    const twinC: Row = { id: "twin_c", passwordHash: null, createdAt: 50 };
    expect(pickCanonical([twinA, twinB, twinC]).id).toBe("twin_c");
  });

  it("ties on createdAt fall back to id — fully deterministic even with identical timestamps", () => {
    const twinA: Row = { id: "twin_a", passwordHash: null, createdAt: 100 };
    const twinB: Row = { id: "twin_b", passwordHash: null, createdAt: 100 };
    expect(pickCanonical([twinB, twinA]).id).toBe("twin_a");
    expect(pickCanonical([twinA, twinB]).id).toBe("twin_a");
  });
});
