// ── Reserve-then-order draft persistence ────────────────────────────────────
// The booking a customer made on /order/[slug]/reservation before tapping
// "Add food to your booking" has to survive everything they might do while
// building the order — most importantly SIGNING IN, which is a full page
// navigation that destroys React state (Luigi, 2026-08-02: he tapped Sign in
// to spend Reward Dollars mid-booking, came back, and his table silently
// vanished — the order went through as a plain order).
//
// So the draft lives in sessionStorage for the whole ordering session and is
// cleared only when the customer leaves reservation mode on purpose or the
// order is placed. sessionStorage (not localStorage) keeps it tab-scoped and
// self-cleaning when the tab closes.

export const RESERVATION_DRAFT_KEY = "ff_reservation_draft";

export type ReservationDraft = {
  date: string;
  time: string;
  partySize: number;
  name?: string;
  phone?: string;
  email?: string;
  notes?: string;
  /** Smart buttons (cmsajnvkm) — must round-trip too. */
  adults?: number | null;
  children?: number | null;
  details?: unknown;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** A draft is only usable if it still carries a bookable date/time/party. */
export function isValidReservationDraft(d: unknown): d is ReservationDraft {
  if (!d || typeof d !== "object") return false;
  const r = d as Record<string, unknown>;
  return typeof r.date === "string" && r.date.length > 0
    && typeof r.time === "string" && r.time.length > 0
    && Number.isFinite(Number(r.partySize)) && Number(r.partySize) > 0;
}

/** Read the stored draft. Never throws (private mode, quota, malformed JSON). */
export function readReservationDraft(storage: StorageLike | undefined | null): ReservationDraft | null {
  if (!storage) return null;
  let raw: string | null = null;
  try { raw = storage.getItem(RESERVATION_DRAFT_KEY); } catch { return null; }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return isValidReservationDraft(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Persist the draft, or clear it when null. Never throws. */
export function writeReservationDraft(
  storage: StorageLike | undefined | null,
  draft: ReservationDraft | null,
): void {
  if (!storage) return;
  try {
    if (draft) storage.setItem(RESERVATION_DRAFT_KEY, JSON.stringify(draft));
    else storage.removeItem(RESERVATION_DRAFT_KEY);
  } catch { /* private mode / quota — in-memory state still drives the order */ }
}
