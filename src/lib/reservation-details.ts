// ── Reservation "smart buttons" details (Fabrizio cmsajnvkm, 2026-08-01) ────
// Client-safe (no prisma import). One module owns the shape, the server-side
// normalization, and the render entries so the customer form, all three
// create paths, admin, kitchen, both emails and both receipt builders agree.
//
// Storage: Reservation.adultsCount / childrenCount (typed, dense) +
// Reservation.details (Json, sparse) — the Order.deliveryAddressData pattern.
// partySize is ALWAYS the server-computed sum when the split is used; every
// existing partySize reader keeps its meaning.

// Mirrors the Restoo reference list Fabrizio attached (anniversary, birthday,
// romantic date, meeting friends, meeting family, business, other) plus a
// generic celebration. Codes are stored; every surface renders them ×38 via
// the `reservationDetails.occasion*` keys.
export const OCCASION_CODES = [
  "birthday",
  "anniversary",
  "date",
  "friends",
  "family",
  "business",
  "celebration",
  "other",
] as const;
export type OccasionCode = (typeof OCCASION_CODES)[number];

export type ReservationChildSeating = { highChairs?: number; strollers?: number };

export type ReservationDetails = {
  childSeating?: ReservationChildSeating;
  allergies?: string;
  occasion?: OccasionCode;
  occasionOther?: string;
  accessibility?: string;
};

/** The slice of ReservationSettings the parser cares about. */
export type SmartButtonSettings = {
  splitAdultsChildren: boolean;
  askChildSeating: boolean;
  askAllergies: boolean;
  askOccasion: boolean;
  askAccessibility: boolean;
  minGuests: number;
  maxGuests: number;
};

const TEXT_CAP = 500;
const OTHER_CAP = 200;
/** Seating counters clamp to the children count (a high chair per child is
 *  the realistic ceiling) with a hard belt of 20. */
const SEAT_HARD_CAP = 20;

const toInt = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : null;
};
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const capText = (v: unknown, cap: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, cap);
  return t.length ? t : null;
};

/**
 * Server-side normalizer used by ALL create paths (public reservations route,
 * orders route's linked reservation, admin walk-in). Never trusts the client:
 * sections whose ask* toggle is OFF are dropped even when sent, occasion codes
 * are whitelisted, strings capped, counters clamped. Returns nulls for the
 * classic (non-split) path so legacy behavior is byte-identical.
 */
export function parseReservationDetails(
  raw: { adults?: unknown; children?: unknown; details?: unknown },
  settings: SmartButtonSettings,
): { adultsCount: number | null; childrenCount: number | null; details: ReservationDetails | null } {
  let adultsCount: number | null = null;
  let childrenCount: number | null = null;

  if (settings.splitAdultsChildren) {
    const a = toInt(raw.adults);
    if (a != null) {
      adultsCount = clamp(a, 1, settings.maxGuests); // at least one adult
      childrenCount = clamp(toInt(raw.children) ?? 0, 0, settings.maxGuests);
    }
  }

  const src = (raw.details && typeof raw.details === "object" ? raw.details : {}) as Record<string, unknown>;
  const out: ReservationDetails = {};

  if (settings.askChildSeating && childrenCount != null && childrenCount > 0) {
    const seat = (src.childSeating && typeof src.childSeating === "object" ? src.childSeating : {}) as Record<string, unknown>;
    const cap = Math.min(childrenCount, SEAT_HARD_CAP);
    const highChairs = clamp(toInt(seat.highChairs) ?? 0, 0, cap);
    const strollers = clamp(toInt(seat.strollers) ?? 0, 0, cap);
    if (highChairs > 0 || strollers > 0) {
      out.childSeating = {
        ...(highChairs > 0 ? { highChairs } : {}),
        ...(strollers > 0 ? { strollers } : {}),
      };
    }
  }

  if (settings.askAllergies) {
    const t = capText(src.allergies, TEXT_CAP);
    if (t) out.allergies = t;
  }

  if (settings.askOccasion) {
    const code = typeof src.occasion === "string" ? (src.occasion as string) : null;
    if (code && (OCCASION_CODES as readonly string[]).includes(code)) {
      out.occasion = code as OccasionCode;
      if (code === "other") {
        const t = capText(src.occasionOther, OTHER_CAP);
        if (t) out.occasionOther = t;
      }
    }
  }

  if (settings.askAccessibility) {
    const t = capText(src.accessibility, TEXT_CAP);
    if (t) out.accessibility = t;
  }

  return { adultsCount, childrenCount, details: Object.keys(out).length ? out : null };
}

/** partySize = the split sum when present, else whatever the classic picker sent. */
export function computePartySize(
  adultsCount: number | null,
  childrenCount: number | null,
  fallbackPartySize: number,
): number {
  return adultsCount != null ? adultsCount + (childrenCount ?? 0) : fallbackPartySize;
}

/** Safe reader for the untyped Json column on render surfaces. */
export function readReservationDetails(json: unknown): ReservationDetails | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const src = json as Record<string, unknown>;
  const out: ReservationDetails = {};
  const seat = (src.childSeating && typeof src.childSeating === "object" ? src.childSeating : null) as Record<string, unknown> | null;
  if (seat) {
    const highChairs = toInt(seat.highChairs);
    const strollers = toInt(seat.strollers);
    const cs: ReservationChildSeating = {
      ...(highChairs && highChairs > 0 ? { highChairs } : {}),
      ...(strollers && strollers > 0 ? { strollers } : {}),
    };
    if (Object.keys(cs).length) out.childSeating = cs;
  }
  const allergies = capText(src.allergies, TEXT_CAP);
  if (allergies) out.allergies = allergies;
  if (typeof src.occasion === "string" && (OCCASION_CODES as readonly string[]).includes(src.occasion)) {
    out.occasion = src.occasion as OccasionCode;
    const other = capText(src.occasionOther, OTHER_CAP);
    if (other) out.occasionOther = other;
  }
  const accessibility = capText(src.accessibility, TEXT_CAP);
  if (accessibility) out.accessibility = accessibility;
  return Object.keys(out).length ? out : null;
}

/** Uniform render order for every surface (admin, kitchen, emails, receipts). */
export type ReservationDetailEntry =
  | { kind: "childSeating"; highChairs: number; strollers: number }
  | { kind: "allergies"; text: string }
  | { kind: "occasion"; code: OccasionCode; otherText: string | null }
  | { kind: "accessibility"; text: string };

export function reservationDetailEntries(details: ReservationDetails | null | undefined): ReservationDetailEntry[] {
  if (!details) return [];
  const entries: ReservationDetailEntry[] = [];
  if (details.childSeating) {
    entries.push({
      kind: "childSeating",
      highChairs: details.childSeating.highChairs ?? 0,
      strollers: details.childSeating.strollers ?? 0,
    });
  }
  if (details.allergies) entries.push({ kind: "allergies", text: details.allergies });
  if (details.occasion) entries.push({ kind: "occasion", code: details.occasion, otherText: details.occasionOther ?? null });
  if (details.accessibility) entries.push({ kind: "accessibility", text: details.accessibility });
  return entries;
}

/** i18n key (in the shared `reservationDetails` namespace) for an occasion code. */
export function occasionKey(code: OccasionCode): string {
  return `occasion${code.charAt(0).toUpperCase()}${code.slice(1)}`;
}

/**
 * Single-resolution renderer: every surface (admin, kitchen, both emails,
 * receipts) turns details into the SAME label/value rows through this.
 * `tr` takes FULL dotted keys (getDict, or next-intl's root useTranslations());
 * `ns` is the surface's namespace carrying the section labels
 * (`${ns}.labelChildSeating|labelAllergies|labelOccasion|labelAccessibility`).
 * Value phrases (occasion names, high chair / stroller) come from the shared
 * `reservationDetails.*` namespace so they're translated exactly once.
 */
export function formatDetailRows(
  details: ReservationDetails | null | undefined,
  tr: (key: string, values?: Record<string, string | number>) => string,
  ns: string,
): { label: string; value: string }[] {
  return reservationDetailEntries(details).map((e) => {
    switch (e.kind) {
      case "childSeating": {
        const parts: string[] = [];
        if (e.highChairs > 0) parts.push(`${tr("reservationDetails.highChair")} ×${e.highChairs}`);
        if (e.strollers > 0) parts.push(`${tr("reservationDetails.stroller")} ×${e.strollers}`);
        return { label: tr(`${ns}.labelChildSeating`), value: parts.join(" · ") };
      }
      case "allergies":
        return { label: tr(`${ns}.labelAllergies`), value: e.text };
      case "occasion": {
        const name = tr(`reservationDetails.${occasionKey(e.code)}`);
        return { label: tr(`${ns}.labelOccasion`), value: e.otherText ? `${name} — ${e.otherText}` : name };
      }
      case "accessibility":
        return { label: tr(`${ns}.labelAccessibility`), value: e.text };
    }
  });
}
