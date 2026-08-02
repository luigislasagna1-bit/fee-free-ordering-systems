import { describe, expect, it } from "vitest";
import {
  computePartySize,
  occasionKey,
  parseReservationDetails,
  readReservationDetails,
  reservationDetailEntries,
  type SmartButtonSettings,
} from "./reservation-details";

const ALL_ON: SmartButtonSettings = {
  splitAdultsChildren: true,
  askChildSeating: true,
  askAllergies: true,
  askOccasion: true,
  askAccessibility: true,
  minGuests: 1,
  maxGuests: 20,
};
const ALL_OFF: SmartButtonSettings = {
  ...ALL_ON,
  splitAdultsChildren: false,
  askChildSeating: false,
  askAllergies: false,
  askOccasion: false,
  askAccessibility: false,
};

describe("parseReservationDetails", () => {
  it("legacy payload (toggles off) → all nulls, classic behavior untouched", () => {
    const r = parseReservationDetails(
      { adults: 2, children: 1, details: { allergies: "peanuts" } },
      ALL_OFF,
    );
    expect(r).toEqual({ adultsCount: null, childrenCount: null, details: null });
  });

  it("split mode computes counts, clamps to maxGuests, forces at least one adult", () => {
    const r = parseReservationDetails({ adults: 0, children: 99 }, ALL_ON);
    expect(r.adultsCount).toBe(1);
    expect(r.childrenCount).toBe(20);
  });

  it("split ON but client sent no adults → classic nulls (old client compat)", () => {
    const r = parseReservationDetails({}, ALL_ON);
    expect(r.adultsCount).toBeNull();
    expect(r.childrenCount).toBeNull();
  });

  it("sections whose toggle is OFF are dropped even when sent", () => {
    const r = parseReservationDetails(
      { adults: 2, children: 1, details: { allergies: "peanuts", accessibility: "ramp" } },
      { ...ALL_ON, askAllergies: false },
    );
    expect(r.details).toEqual({ accessibility: "ramp" });
  });

  it("child seating requires children > 0, clamps counters to children, drops zero-only", () => {
    const none = parseReservationDetails(
      { adults: 2, children: 0, details: { childSeating: { highChairs: 2 } } },
      ALL_ON,
    );
    expect(none.details).toBeNull();

    const clamped = parseReservationDetails(
      { adults: 2, children: 2, details: { childSeating: { highChairs: 9, strollers: 0 } } },
      ALL_ON,
    );
    expect(clamped.details).toEqual({ childSeating: { highChairs: 2 } });
  });

  it("occasion is whitelisted; bad codes dropped; other keeps capped text", () => {
    const bad = parseReservationDetails(
      { adults: 2, details: { occasion: "hacky<script>" } },
      ALL_ON,
    );
    expect(bad.details).toBeNull();

    const other = parseReservationDetails(
      { adults: 2, details: { occasion: "other", occasionOther: "x".repeat(999) } },
      ALL_ON,
    );
    expect(other.details?.occasion).toBe("other");
    expect(other.details?.occasionOther).toHaveLength(200);
  });

  it("occasionOther is ignored unless occasion === other", () => {
    const r = parseReservationDetails(
      { adults: 2, details: { occasion: "birthday", occasionOther: "sneaky" } },
      ALL_ON,
    );
    expect(r.details).toEqual({ occasion: "birthday" });
  });

  it("free text is trimmed and capped at 500", () => {
    const r = parseReservationDetails(
      { adults: 2, details: { allergies: `  ${"a".repeat(999)}  ` } },
      ALL_ON,
    );
    expect(r.details?.allergies).toHaveLength(500);
  });
});

describe("computePartySize", () => {
  it("split sum wins; classic falls back", () => {
    expect(computePartySize(2, 3, 99)).toBe(5);
    expect(computePartySize(2, null, 99)).toBe(2);
    expect(computePartySize(null, null, 4)).toBe(4);
  });
});

describe("readReservationDetails", () => {
  it("round-trips a stored blob and rejects junk", () => {
    const stored = { childSeating: { highChairs: 1, strollers: 2 }, occasion: "birthday" };
    expect(readReservationDetails(stored)).toEqual(stored);
    expect(readReservationDetails(null)).toBeNull();
    expect(readReservationDetails("junk")).toBeNull();
    expect(readReservationDetails({ occasion: "not-a-code", junkKey: 1 })).toBeNull();
  });
});

describe("reservationDetailEntries / occasionKey", () => {
  it("renders sections in a stable order with the right keys", () => {
    const entries = reservationDetailEntries({
      accessibility: "step-free",
      childSeating: { highChairs: 1 },
      occasion: "other",
      occasionOther: "graduation",
      allergies: "shellfish",
    });
    expect(entries.map((e) => e.kind)).toEqual(["childSeating", "allergies", "occasion", "accessibility"]);
    expect(occasionKey("birthday")).toBe("occasionBirthday");
    expect(occasionKey("other")).toBe("occasionOther");
  });

  it("legacy null renders nothing", () => {
    expect(reservationDetailEntries(null)).toEqual([]);
    expect(reservationDetailEntries(undefined)).toEqual([]);
  });
});
