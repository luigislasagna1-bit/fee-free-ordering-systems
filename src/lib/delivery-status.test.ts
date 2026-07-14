import { describe, it, expect, vi } from "vitest";
// delivery-status.ts imports prisma + the ledger hooks at module load; the pure
// translateDriverEvent under test doesn't touch them, so mock them away.
vi.mock("@/lib/db", () => ({ default: {} }));
vi.mock("@/lib/coupon-ledger", () => ({ redeemCouponsForOrder: vi.fn() }));
vi.mock("@/lib/reward-ledger", () => ({ redeemForOrder: vi.fn(), awardForOrder: vi.fn() }));
vi.mock("@/lib/reward-earn", () => ({ awardEarnRulesForOrder: vi.fn(), awardPromoCreditsForOrder: vi.fn() }));
import { translateDriverEvent, DELIVERY_TERMINAL } from "./delivery-status";

describe("translateDriverEvent (in-house driver status → Order.status)", () => {
  it("picked_up / out_for_delivery → ready", () => {
    expect(translateDriverEvent("picked_up").orderStatus).toBe("ready");
    expect(translateDriverEvent("out_for_delivery").orderStatus).toBe("ready");
  });
  it("delivered → completed", () => {
    expect(translateDriverEvent("delivered").orderStatus).toBe("completed");
  });
  it("assignment-only statuses never move the order", () => {
    for (const s of ["queued", "assigned", "accepted", "started", "returned", "failed", "cancelled"]) {
      expect(translateDriverEvent(s).orderStatus).toBeNull();
    }
  });
  it("DELIVERY_TERMINAL matches the ShipDay forward-only set", () => {
    expect([...DELIVERY_TERMINAL].sort()).toEqual(["cancelled", "completed", "rejected"]);
  });
});
