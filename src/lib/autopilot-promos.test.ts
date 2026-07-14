import { describe, it, expect, vi } from "vitest";
// activationPatch is pure, but the module imports the prisma client at top level.
vi.mock("@/lib/db", () => ({ default: {} }));
import { activationPatch, OFFER_GRACE_MS } from "./autopilot-promos";

const NOW = new Date("2026-07-14T00:00:00.000Z");

describe("activationPatch — honor delivered offer codes (CARTBACK bug)", () => {
  it("enabling makes the code fully live + open-ended (clears any grace end)", () => {
    expect(activationPatch(true, null, NOW)).toEqual({ isActive: true, endsAt: null });
    expect(activationPatch(true, new Date("2026-08-01"), NOW)).toEqual({ isActive: true, endsAt: null });
  });

  it("disabling an open code stamps a grace end but keeps it redeemable (isActive stays true)", () => {
    const patch = activationPatch(false, null, NOW);
    expect(patch.isActive).toBe(true); // NOT deactivated — inbox codes must still work
    expect(patch.endsAt).toEqual(new Date(NOW.getTime() + OFFER_GRACE_MS));
  });

  it("disabling a code already in its grace window is a no-op (doesn't keep pushing the end out)", () => {
    const existingEnd = new Date("2026-07-20T00:00:00.000Z");
    expect(activationPatch(false, existingEnd, NOW)).toEqual({});
  });

  it("grace window is 30 days", () => {
    expect(OFFER_GRACE_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });
});
