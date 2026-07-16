import { describe, it, expect } from "vitest";
import { computeRatingPct } from "./driver-rating";

// Formula: 40% reliability + 30% on-time + 30% feedback, with a smoothing prior
// of K=4 clean/on-time deliveries on the reliability & on-time components.
describe("computeRatingPct", () => {
  it("is 100 for a brand-new driver (no data)", () => {
    expect(computeRatingPct({ deliveredCount: 0, cancelledCount: 0, lateCount: 0, feedbackAvgStars: null, feedbackCount: 0 })).toBe(100);
  });

  it("stays 100 for a perfect record", () => {
    expect(computeRatingPct({ deliveredCount: 20, cancelledCount: 0, lateCount: 0, feedbackAvgStars: 5, feedbackCount: 10 })).toBe(100);
  });

  it("dips on cancellations (reliability, smoothed)", () => {
    // reliability (8+4)/(8+2+4)=0.857 → 0.4*0.857 + 0.3 + 0.3 = 0.9429 → 94
    expect(computeRatingPct({ deliveredCount: 8, cancelledCount: 2, lateCount: 0, feedbackAvgStars: null, feedbackCount: 0 })).toBe(94);
  });

  it("dips on late deliveries (on-time, smoothed)", () => {
    // onTime (5+4)/(10+4)=0.643 → 0.4 + 0.3*0.643 + 0.3 = 0.8929 → 89
    expect(computeRatingPct({ deliveredCount: 10, cancelledCount: 0, lateCount: 5, feedbackAvgStars: null, feedbackCount: 0 })).toBe(89);
  });

  it("dips on poor feedback (feedback, not smoothed)", () => {
    // feedback 3/5=0.6 → 0.4 + 0.3 + 0.3*0.6 = 0.88 → 88
    expect(computeRatingPct({ deliveredCount: 10, cancelledCount: 0, lateCount: 0, feedbackAvgStars: 3, feedbackCount: 4 })).toBe(88);
  });

  it("a single cancellation on a new driver is a gentle nudge, not a cliff", () => {
    // reliability (0+4)/(0+1+4)=0.8 → 0.4*0.8 + 0.3 + 0.3 = 0.92 → 92 (not 60)
    expect(computeRatingPct({ deliveredCount: 0, cancelledCount: 1, lateCount: 0, feedbackAvgStars: null, feedbackCount: 0 })).toBe(92);
  });

  it("combines all three components", () => {
    // reliability 13/14=0.9286, onTime 12/13=0.9231, feedback 0.8
    // 0.4*0.9286 + 0.3*0.9231 + 0.3*0.8 = 0.8884 → 89
    expect(computeRatingPct({ deliveredCount: 9, cancelledCount: 1, lateCount: 1, feedbackAvgStars: 4, feedbackCount: 6 })).toBe(89);
  });

  it("never goes below 0 or above 100", () => {
    const worst = computeRatingPct({ deliveredCount: 0, cancelledCount: 50, lateCount: 0, feedbackAvgStars: 1, feedbackCount: 50 });
    expect(worst).toBeGreaterThanOrEqual(0);
    expect(worst).toBeLessThanOrEqual(100);
  });
});
