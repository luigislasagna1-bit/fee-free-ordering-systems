import { describe, it, expect } from "vitest";
import { checkDriverTransition } from "./driver-assignment";

const D = "driver-1";
const OTHER = "driver-2";

describe("checkDriverTransition", () => {
  it("lets a driver claim a queued (unowned) assignment", () => {
    expect(checkDriverTransition({ current: "queued", next: "accepted", assignmentDriverId: null, driverId: D })).toEqual({ ok: true });
  });
  it("advances forward through the ladder for the owner", () => {
    for (const [current, next] of [["accepted", "started"], ["started", "picked_up"], ["picked_up", "delivered"]] as const) {
      expect(checkDriverTransition({ current, next, assignmentDriverId: D, driverId: D })).toEqual({ ok: true });
    }
  });
  it("rejects moving backward or staying put", () => {
    expect(checkDriverTransition({ current: "picked_up", next: "accepted", assignmentDriverId: D, driverId: D })).toEqual({ ok: false, code: "not_forward" });
    expect(checkDriverTransition({ current: "started", next: "started", assignmentDriverId: D, driverId: D })).toEqual({ ok: false, code: "not_forward" });
  });
  it("rejects advancing another driver's active assignment (no stealing)", () => {
    expect(checkDriverTransition({ current: "accepted", next: "picked_up", assignmentDriverId: OTHER, driverId: D })).toEqual({ ok: false, code: "not_owner" });
  });
  it("rejects any move on a terminal assignment", () => {
    for (const current of ["delivered", "failed", "cancelled", "returned"]) {
      expect(checkDriverTransition({ current, next: "delivered", assignmentDriverId: D, driverId: D }).ok).toBe(false);
    }
  });
  it("rejects a non-settable target status", () => {
    expect(checkDriverTransition({ current: "accepted", next: "queued", assignmentDriverId: D, driverId: D })).toEqual({ ok: false, code: "not_settable" });
  });
  it("allows failing out from any active stage (owner)", () => {
    expect(checkDriverTransition({ current: "picked_up", next: "failed", assignmentDriverId: D, driverId: D })).toEqual({ ok: true });
  });
});
