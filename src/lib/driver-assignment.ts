/**
 * DeliveryAssignment lifecycle helpers (2026-07-13) — the forward-only progress
 * ladder a driver walks in the /driver app, kept in one place so the status
 * endpoint and its tests agree. Order.status changes are handled separately by
 * translateDriverEvent + applyDeliveryStatus; this module governs the
 * ASSIGNMENT row only.
 */

/** Progress ranks — a driver may only advance to a LATER stage. */
export const ASSIGNMENT_STAGES = [
  "queued",
  "accepted",
  "started",
  "picked_up",
  "out_for_delivery",
  "delivered",
] as const;

export type AssignmentStage = (typeof ASSIGNMENT_STAGES)[number];

/** A terminal assignment never advances again. */
export const ASSIGNMENT_TERMINAL = new Set(["delivered", "failed", "returned", "cancelled"]);

/** Statuses a driver may set from the app. "failed" is a bail-out from any
 *  active stage; the rest are forward steps. */
export const DRIVER_SETTABLE = new Set([
  "accepted",
  "started",
  "picked_up",
  "out_for_delivery",
  "delivered",
  "failed",
]);

/** The timestamp column stamped when the assignment enters each status. */
export const STAGE_TIMESTAMP: Record<string, string> = {
  accepted: "acceptedAt",
  started: "startedAt",
  picked_up: "pickedUpAt",
  out_for_delivery: "pickedUpAt", // shares the pickup stamp (on-the-way follows pickup)
  delivered: "deliveredAt",
  failed: "failedAt",
  returned: "returnedAt",
};

/** Grace window past the promised time before a delivery counts as late. */
export const LATE_GRACE_MS = 10 * 60 * 1000;

/**
 * The promised-time / late rule, in ONE place so the delivered-counter bump
 * (status route) and the History "Late" badge can never drift: the promised
 * time is `scheduledFor` (customer picked a slot) falling back to
 * `estimatedReady` (kitchen estimate); the delivery is LATE when it lands more
 * than LATE_GRACE_MS after that. No promised time → never late.
 */
export function isDeliveryLate(
  order: { scheduledFor: Date | string | null; estimatedReady: Date | string | null },
  completedAtMs: number = Date.now(),
): boolean {
  const promisedTs = order.scheduledFor
    ? new Date(order.scheduledFor).getTime()
    : order.estimatedReady
      ? new Date(order.estimatedReady).getTime()
      : null;
  return promisedTs != null && completedAtMs > promisedTs + LATE_GRACE_MS;
}

function rank(status: string): number {
  const i = ASSIGNMENT_STAGES.indexOf(status as AssignmentStage);
  return i === -1 ? -1 : i;
}

export type TransitionCheck =
  | { ok: true }
  | { ok: false; code: "not_settable" | "terminal" | "not_forward" | "not_owner" | "claim_conflict" };

/**
 * May this driver move the assignment `current → next`?
 * - `next` must be a driver-settable status.
 * - A terminal assignment can't move.
 * - Non-"failed" moves must be strictly forward on the ladder.
 * - Claiming (current="queued"): allowed only when unowned OR already mine.
 * - Advancing an owned assignment: must be mine.
 */
export function checkDriverTransition(opts: {
  current: string;
  next: string;
  assignmentDriverId: string | null;
  driverId: string;
}): TransitionCheck {
  const { current, next, assignmentDriverId, driverId } = opts;
  if (!DRIVER_SETTABLE.has(next)) return { ok: false, code: "not_settable" };
  if (ASSIGNMENT_TERMINAL.has(current)) return { ok: false, code: "terminal" };

  // Ownership: a queued assignment is claimable by anyone; once owned it's
  // exclusive to that driver (no stealing another driver's active job).
  if (assignmentDriverId && assignmentDriverId !== driverId) {
    return { ok: false, code: assignmentDriverId ? "not_owner" : "claim_conflict" };
  }

  if (next === "failed") return { ok: true };
  if (rank(next) <= rank(current)) return { ok: false, code: "not_forward" };
  return { ok: true };
}
