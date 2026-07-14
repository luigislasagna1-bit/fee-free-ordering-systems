import { describe, it, expect } from "vitest";
import { scoreDriver, rankDrivers, pickBestDriver, pickNextDriver, DEFAULT_WEIGHTS, type DriverCandidate } from "./driver-dispatch";

function d(over: Partial<DriverCandidate>): DriverCandidate {
  return { driverId: over.driverId ?? "x", name: over.name ?? "X", distanceKm: 3, activeJobs: 0, ratingAvg: 5, ratingCount: 10, restaurantDeliveries: 10, ...over };
}

describe("driver-dispatch ranking", () => {
  it("all-else-equal, the NEAREST driver wins", () => {
    const near = d({ driverId: "near", distanceKm: 1 });
    const far = d({ driverId: "far", distanceKm: 12 });
    expect(pickBestDriver([far, near])!.driverId).toBe("near");
  });

  it("same distance → the LEAST-BUSY driver wins", () => {
    const busy = d({ driverId: "busy", distanceKm: 4, activeJobs: 4 });
    const free = d({ driverId: "free", distanceKm: 4, activeJobs: 0 });
    expect(pickBestDriver([busy, free])!.driverId).toBe("free");
  });

  it("factors in rating and restaurant history", () => {
    const proven = d({ driverId: "proven", distanceKm: 5, ratingAvg: 5, ratingCount: 50, restaurantDeliveries: 20 });
    const rookie = d({ driverId: "rookie", distanceKm: 5, ratingAvg: 3, ratingCount: 50, restaurantDeliveries: 0 });
    expect(pickBestDriver([rookie, proven])!.driverId).toBe("proven");
  });

  it("a driver with no fresh GPS scores worst on distance (never dispatched over a located one)", () => {
    const located = d({ driverId: "located", distanceKm: 10 });
    const noGps = d({ driverId: "nogps", distanceKm: null });
    expect(pickBestDriver([noGps, located])!.driverId).toBe("located");
  });

  it("an unrated brand-new driver isn't punished to zero (neutral 0.6)", () => {
    const unrated = d({ driverId: "new", ratingAvg: null, ratingCount: 0 });
    // unrated but otherwise identical to a 3-star driver → unrated (0.6) beats 3/5 (0.6)… tie; make the 3-star worse
    const twoStar = d({ driverId: "twostar", ratingAvg: 2, ratingCount: 20 });
    expect(pickBestDriver([twoStar, unrated])!.driverId).toBe("new");
  });

  it("scores stay within 0..1", () => {
    const best = d({ distanceKm: 0, activeJobs: 0, ratingAvg: 5, ratingCount: 99, restaurantDeliveries: 99 });
    const worst = d({ distanceKm: 100, activeJobs: 99, ratingAvg: 0, ratingCount: 1, restaurantDeliveries: 0 });
    expect(scoreDriver(best)).toBeGreaterThan(0.95);
    expect(scoreDriver(worst)).toBeGreaterThanOrEqual(0);
    expect(scoreDriver(worst)).toBeLessThan(0.05);
  });

  it("weights are tunable — cranking 'load' flips the winner toward the idle driver", () => {
    const nearBusy = d({ driverId: "nearBusy", distanceKm: 2, activeJobs: 2 });
    const farIdle = d({ driverId: "farIdle", distanceKm: 6, activeJobs: 0 });
    // default (distance-heavy) → the closer driver; load-heavy → the idle one
    expect(pickBestDriver([nearBusy, farIdle])!.driverId).toBe("nearBusy");
    const loadHeavy = { ...DEFAULT_WEIGHTS, distance: 0.1, load: 0.8 };
    expect(pickBestDriver([nearBusy, farIdle], loadHeavy)!.driverId).toBe("farIdle");
  });

  it("re-offer skips drivers who already declined/were offered", () => {
    const a = d({ driverId: "a", distanceKm: 1 });
    const b = d({ driverId: "b", distanceKm: 2 });
    const c = d({ driverId: "c", distanceKm: 3 });
    expect(pickNextDriver([a, b, c], ["a"])!.driverId).toBe("b");
    expect(pickNextDriver([a, b, c], ["a", "b"])!.driverId).toBe("c");
    expect(pickNextDriver([a, b, c], ["a", "b", "c"])).toBeNull();
  });

  it("rankDrivers returns a deterministic best-first order", () => {
    const ranked = rankDrivers([d({ driverId: "far", distanceKm: 10 }), d({ driverId: "near", distanceKm: 1 }), d({ driverId: "mid", distanceKm: 5 })]);
    expect(ranked.map((r) => r.driverId)).toEqual(["near", "mid", "far"]);
  });
});
