/**
 * Promo wizard field normalisers. Shared between
 * /api/restaurants/promotions (POST) and /api/restaurants/promotions/[id]
 * (PATCH) so both endpoints sanitise identical shapes.
 *
 * Anything written to the DB by the wizard goes through one of these
 * functions FIRST. They:
 *   - Coerce string ↔ array as needed for JSON-stringified columns.
 *   - Clamp numeric ranges (minutes 0-1440, percentages 0-100, etc).
 *   - Enforce length limits to prevent storage abuse.
 *   - Default to safe fallback values instead of throwing — the wizard's
 *     own validation surfaces user-facing errors; the API trusts but
 *     verifies and just keeps moving on garbage.
 */

/** Minutes-since-midnight: 0..1440, integer. Null on empty/invalid. */
export function clampMin(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(1440, Math.floor(n)));
}

/** Coerce + length-bound a free-text JSON-stringified array. Null on
 *  empty/invalid. Used for paymentMethodSlugs + deliveryZoneIds. */
export function normalizeJsonStringList(v: unknown, maxItems = 32): string | null {
  if (v === null || v === undefined || v === "") return null;
  let arr: unknown;
  if (Array.isArray(v)) arr = v;
  else if (typeof v === "string") {
    try {
      arr = JSON.parse(v);
    } catch {
      return null;
    }
  } else {
    return null;
  }
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const slugs = arr
    .filter((x) => typeof x === "string" && x.length > 0 && x.length <= 64)
    .slice(0, maxItems);
  if (slugs.length === 0) return null;
  return JSON.stringify(slugs);
}

const VALID_ORDER_TYPES = new Set([
  "pickup",
  "delivery",
  "dine_in",
  "catering",
  "takeout",
]);

/** Coerce a JSON-stringified order-type array OR a single-value scalar
 *  into a normalised storage string. Returns "both" / "pickup" / etc.
 *  for single values, or a JSON-stringified array for multi-select. */
export function normalizeOrderType(v: unknown): string {
  if (typeof v === "string") {
    if (v === "both" || VALID_ORDER_TYPES.has(v)) return v;
    if (v.startsWith("[")) {
      try {
        const parsed = JSON.parse(v);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const valid = Array.from(new Set(parsed.filter((x) =>
            typeof x === "string" && VALID_ORDER_TYPES.has(x)
          )));
          if (valid.length === 0) return "both";
          if (valid.length === 1) return valid[0];
          // Sort to ensure equivalent multi-selects stringify identically
          // ("[\"delivery\",\"pickup\"]" never both forms in the DB).
          valid.sort();
          return JSON.stringify(valid);
        }
      } catch { /* fall through */ }
    }
  }
  if (Array.isArray(v)) {
    return normalizeOrderType(JSON.stringify(v));
  }
  return "both";
}

export function normalizeCustomerType(v: unknown): string {
  const allowed = ["any", "new", "returning", "member"];
  if (typeof v === "string" && allowed.includes(v)) return v;
  return "any";
}

export function normalizeStackingRule(v: unknown): string {
  const allowed = ["standard", "exclusive", "master"];
  if (typeof v === "string" && allowed.includes(v)) return v;
  return "standard";
}

export function normalizeDisplayMode(v: unknown): string {
  const allowed = ["menu_visible", "hidden_coupon_only", "popup"];
  if (typeof v === "string" && allowed.includes(v)) return v;
  return "menu_visible";
}

/** Round-trip a Json-typed payload to a parsed object/array suitable for
 *  Prisma's Json column. Garbage in → {} out. */
export function normalizeRuleConfig(v: unknown): unknown {
  if (v === null || v === undefined) return {};
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch {
      return {};
    }
  }
  if (typeof v === "object") return v;
  return {};
}

/** Sanitise Limited Showtime schedules. Each row = { dayOfWeek 0-6,
 *  hourStart/hourEnd 0-1440 (minutes since midnight) }. Max 14 entries
 *  (2 windows × 7 days is the realistic upper bound). */
export function normalizeLimitedShowtime(v: unknown): unknown {
  if (v === null || v === undefined || v === "") return [];
  let arr: unknown;
  if (Array.isArray(v)) arr = v;
  else if (typeof v === "string") {
    try { arr = JSON.parse(v); } catch { return []; }
  } else if (typeof v === "object") {
    arr = v;
  } else {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, 14).map((row) => {
    const r = row as { dayOfWeek?: unknown; hourStart?: unknown; hourEnd?: unknown };
    return {
      dayOfWeek: Math.max(0, Math.min(6, Math.floor(Number(r.dayOfWeek ?? 0)))),
      hourStart: clampMin(r.hourStart) ?? 0,
      hourEnd: clampMin(r.hourEnd) ?? 1440,
    };
  });
}

/** Sanitise a single image URL field. Caps at 512 chars; null on empty. */
export function normalizeImageUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 512);
}

/** Sanitise a banner headline. Caps at 80 chars; null on empty. */
export function normalizeBannerHeadline(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 80);
}

/** Sanitise a non-negative float. Null on empty/invalid. */
export function normalizeNonNegativeFloat(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}
