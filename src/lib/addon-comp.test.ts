import { describe, it, expect } from "vitest";
import { isComplimentaryAddOnRow, complimentaryTrialCarryOverSec } from "./addon-comp";

const HOUR = 60 * 60 * 1000;
const NOW = new Date("2026-07-11T12:00:00.000Z");

function compRow(trialEndsAt: Date | null) {
  return { status: "trialing", stripeSubscriptionId: null, trialEndsAt };
}

describe("isComplimentaryAddOnRow", () => {
  it("matches a trialing row with no Stripe subscription (free partner period)", () => {
    expect(isComplimentaryAddOnRow(compRow(new Date()))).toBe(true);
  });

  it("does NOT match a Stripe-billed trial (sub id present)", () => {
    expect(
      isComplimentaryAddOnRow({ status: "trialing", stripeSubscriptionId: "sub_123" }),
    ).toBe(false);
  });

  it("does NOT match permanent superadmin comps (status active, no sub)", () => {
    expect(isComplimentaryAddOnRow({ status: "active", stripeSubscriptionId: null })).toBe(false);
  });

  it("does NOT match cancelled/past_due rows or missing rows", () => {
    expect(isComplimentaryAddOnRow({ status: "cancelled", stripeSubscriptionId: null })).toBe(false);
    expect(isComplimentaryAddOnRow({ status: "past_due", stripeSubscriptionId: null })).toBe(false);
    expect(isComplimentaryAddOnRow(null)).toBe(false);
    expect(isComplimentaryAddOnRow(undefined)).toBe(false);
  });
});

describe("complimentaryTrialCarryOverSec", () => {
  it("carries the remaining free days as a unix trial_end when far enough out", () => {
    const end = new Date(NOW.getTime() + 6 * 24 * HOUR); // e.g. Jul 17 from Jul 11
    expect(complimentaryTrialCarryOverSec(compRow(end), NOW)).toBe(
      Math.floor(end.getTime() / 1000),
    );
  });

  it("clamps UP to now+49h inside the Stripe 48h minimum — never bills before the promised end", () => {
    // 48h out: Stripe would reject trial_end=trialEndsAt, so the timestamp is
    // clamped forward (platform grants ~1h extra free) instead of billing NOW
    // during promised-free days.
    expect(complimentaryTrialCarryOverSec(compRow(new Date(NOW.getTime() + 48 * HOUR)), NOW)).toBe(
      Math.floor((NOW.getTime() + 49 * HOUR) / 1000),
    );
    // 1h out: still clamped to now+49h, still never an early charge.
    expect(complimentaryTrialCarryOverSec(compRow(new Date(NOW.getTime() + HOUR)), NOW)).toBe(
      Math.floor((NOW.getTime() + 49 * HOUR) / 1000),
    );
    // Beyond the margin the real end date wins untouched.
    expect(
      complimentaryTrialCarryOverSec(compRow(new Date(NOW.getTime() + 50 * HOUR)), NOW),
    ).toBe(Math.floor((NOW.getTime() + 50 * HOUR) / 1000));
  });

  it("returns null for an already-expired or missing trialEndsAt (free period over → bill now)", () => {
    expect(complimentaryTrialCarryOverSec(compRow(new Date(NOW.getTime() - HOUR)), NOW)).toBeNull();
    expect(complimentaryTrialCarryOverSec(compRow(NOW), NOW)).toBeNull();
    expect(complimentaryTrialCarryOverSec(compRow(null), NOW)).toBeNull();
  });

  it("returns null for non-complimentary rows regardless of dates", () => {
    const end = new Date(NOW.getTime() + 6 * 24 * HOUR);
    expect(
      complimentaryTrialCarryOverSec(
        { status: "trialing", stripeSubscriptionId: "sub_123", trialEndsAt: end },
        NOW,
      ),
    ).toBeNull();
    expect(
      complimentaryTrialCarryOverSec(
        { status: "active", stripeSubscriptionId: null, trialEndsAt: end },
        NOW,
      ),
    ).toBeNull();
    expect(complimentaryTrialCarryOverSec(null, NOW)).toBeNull();
  });
});
