import { describe, expect, it } from "vitest";
import {
  BRANDED_APP_STATUSES,
  canTransition,
  isBrandedAppPlatform,
  isBrandedAppStatus,
  legalTargets,
  notificationsFor,
  ownerOfNextAction,
  statusLabelKey,
  type BrandedAppStatus,
} from "./status";

describe("ownerOfNextAction is total and 1:1 with the product promise", () => {
  it("maps every state to exactly one owner", () => {
    const expected: Record<BrandedAppStatus, string> = {
      draft: "restaurant",
      submitted: "platform",
      needs_owner: "restaurant",
      building: "platform",
      in_store_review: "store",
      live: "none",
      suspended: "platform",
    };
    for (const s of BRANDED_APP_STATUSES) {
      expect(ownerOfNextAction(s)).toBe(expected[s]);
    }
  });
});

describe("transition machine", () => {
  const LEGAL: Array<[BrandedAppStatus, BrandedAppStatus]> = [
    ["draft", "submitted"],
    ["submitted", "building"],
    ["submitted", "needs_owner"],
    ["needs_owner", "submitted"],
    ["building", "in_store_review"],
    ["building", "needs_owner"],
    ["in_store_review", "live"],
    ["in_store_review", "building"],
    ["in_store_review", "needs_owner"],
    ["live", "building"],
    ["live", "suspended"],
    ["suspended", "building"],
    ["suspended", "live"],
    // billing-lapse mid-flight
    ["draft", "suspended"],
    ["submitted", "suspended"],
    ["needs_owner", "suspended"],
    ["building", "suspended"],
    ["in_store_review", "suspended"],
  ];

  it("allows exactly the documented transitions", () => {
    for (const [from, to] of LEGAL) {
      expect(canTransition(from, to), `${from} → ${to} should be legal`).toBe(true);
    }
  });

  it("refuses everything else (exhaustive sweep)", () => {
    const legalSet = new Set(LEGAL.map(([f, t]) => `${f}→${t}`));
    for (const from of BRANDED_APP_STATUSES) {
      for (const to of BRANDED_APP_STATUSES) {
        const shouldBeLegal = legalSet.has(`${from}→${to}`);
        expect(canTransition(from, to), `${from} → ${to}`).toBe(shouldBeLegal);
      }
    }
  });

  it("never allows a self-transition and legalTargets matches canTransition", () => {
    for (const from of BRANDED_APP_STATUSES) {
      expect(canTransition(from, from)).toBe(false);
      for (const to of legalTargets(from)) {
        expect(canTransition(from, to)).toBe(true);
      }
    }
  });

  it("skipping the review states is impossible: draft can never jump to live", () => {
    expect(canTransition("draft", "live")).toBe(false);
    expect(canTransition("draft", "in_store_review")).toBe(false);
    expect(canTransition("submitted", "live")).toBe(false);
    // building must pass through the store — a build cannot go straight live.
    expect(canTransition("building", "live")).toBe(false);
  });
});

describe("guards and labels", () => {
  it("type guards accept the unions and reject junk", () => {
    for (const s of BRANDED_APP_STATUSES) expect(isBrandedAppStatus(s)).toBe(true);
    for (const junk of ["published", "", null, undefined, 3, "DRAFT"]) {
      expect(isBrandedAppStatus(junk)).toBe(false);
    }
    expect(isBrandedAppPlatform("android")).toBe(true);
    expect(isBrandedAppPlatform("ios")).toBe(true);
    expect(isBrandedAppPlatform("web")).toBe(false);
  });

  it("statusLabelKey produces stable camelCase i18n keys for every state", () => {
    expect(statusLabelKey("in_store_review")).toBe("statusInStoreReview");
    expect(statusLabelKey("needs_owner")).toBe("statusNeedsOwner");
    for (const s of BRANDED_APP_STATUSES) {
      expect(statusLabelKey(s)).toMatch(/^status[A-Z][A-Za-z]+$/);
    }
  });
});

describe("notification matrix", () => {
  it("owner-facing transitions email the restaurant; approval pings superadmin", () => {
    expect(notificationsFor("submitted")).toEqual({ restaurant: false, superadmin: true });
    for (const s of ["needs_owner", "building", "in_store_review", "live", "suspended"] as const) {
      expect(notificationsFor(s)).toEqual({ restaurant: true, superadmin: false });
    }
    expect(notificationsFor("draft")).toEqual({ restaurant: false, superadmin: false });
  });

  it("is total over every state", () => {
    for (const s of BRANDED_APP_STATUSES) {
      const n = notificationsFor(s);
      expect(typeof n.restaurant).toBe("boolean");
      expect(typeof n.superadmin).toBe("boolean");
    }
  });
});
