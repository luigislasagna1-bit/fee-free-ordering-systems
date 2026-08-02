import { describe, expect, it } from "vitest";
import {
  RESERVATION_DRAFT_KEY,
  isValidReservationDraft,
  readReservationDraft,
  writeReservationDraft,
  type ReservationDraft,
} from "./reservation-draft-storage";

/** Minimal in-memory Storage stand-in. */
function fakeStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
    has: (k: string) => map.has(k),
  };
}

const DRAFT: ReservationDraft = {
  date: "2026-08-08",
  time: "19:00",
  partySize: 5,
  name: "Luigi Nabil",
  phone: "9055550100",
  email: "luigi@example.com",
  notes: "Booth please",
  adults: 3,
  children: 2,
  details: { allergies: "Shellfish", occasion: "birthday" },
};

describe("reserve-then-order draft survives a navigation", () => {
  // THE regression: sign in mid-booking (a full page navigation), come back,
  // and the table must still be attached to the order.
  it("round-trips through storage — the sign-in trip that lost Luigi's table", () => {
    const s = fakeStorage();
    writeReservationDraft(s, DRAFT);
    // …customer navigates to /account/login and back; a fresh page reads it.
    expect(readReservationDraft(s)).toEqual(DRAFT);
  });

  it("keeps the smart-button answers across the trip", () => {
    const s = fakeStorage();
    writeReservationDraft(s, DRAFT);
    const back = readReservationDraft(s);
    expect(back?.adults).toBe(3);
    expect(back?.children).toBe(2);
    expect(back?.details).toEqual({ allergies: "Shellfish", occasion: "birthday" });
  });

  it("clears only when reservation mode is left on purpose", () => {
    const s = fakeStorage();
    writeReservationDraft(s, DRAFT);
    writeReservationDraft(s, null); // order placed, or banner dismissed
    expect(s.has(RESERVATION_DRAFT_KEY)).toBe(false);
    expect(readReservationDraft(s)).toBeNull();
  });
});

describe("readReservationDraft is defensive", () => {
  it("returns null for an empty store", () => {
    expect(readReservationDraft(fakeStorage())).toBeNull();
  });

  it("returns null for malformed JSON instead of throwing", () => {
    expect(readReservationDraft(fakeStorage({ [RESERVATION_DRAFT_KEY]: "{not json" }))).toBeNull();
  });

  it("rejects a draft that lost its booking fields", () => {
    const s = fakeStorage({ [RESERVATION_DRAFT_KEY]: JSON.stringify({ name: "Guest" }) });
    expect(readReservationDraft(s)).toBeNull();
  });

  it("survives a storage that throws (private mode)", () => {
    const throwing = {
      getItem: () => { throw new Error("denied"); },
      setItem: () => { throw new Error("denied"); },
      removeItem: () => { throw new Error("denied"); },
    };
    expect(readReservationDraft(throwing)).toBeNull();
    expect(() => writeReservationDraft(throwing, DRAFT)).not.toThrow();
  });

  it("tolerates no storage at all (SSR)", () => {
    expect(readReservationDraft(undefined)).toBeNull();
    expect(() => writeReservationDraft(undefined, DRAFT)).not.toThrow();
  });
});

describe("isValidReservationDraft", () => {
  it("accepts a real draft and rejects the near-misses", () => {
    expect(isValidReservationDraft(DRAFT)).toBe(true);
    expect(isValidReservationDraft({ ...DRAFT, date: "" })).toBe(false);
    expect(isValidReservationDraft({ ...DRAFT, time: undefined })).toBe(false);
    expect(isValidReservationDraft({ ...DRAFT, partySize: 0 })).toBe(false);
    expect(isValidReservationDraft({ ...DRAFT, partySize: "abc" })).toBe(false);
    expect(isValidReservationDraft(null)).toBe(false);
    expect(isValidReservationDraft("string")).toBe(false);
  });
});
