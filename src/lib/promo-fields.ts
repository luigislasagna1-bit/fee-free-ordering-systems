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
  "take_out",
  "catering",
  "takeout", // legacy spelling — kept so old promos still validate
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
          // Selecting EVERY channel = no restriction → store "both" so the promo
          // stays unrestricted (and a future 6th channel auto-applies too).
          // Without this, "all checked" saved a fixed N-channel array that
          // silently excluded any later-added channel. Luigi 2026-06-27.
          const canon = (x: string) => (x === "takeout" ? "take_out" : x === "dinein" ? "dine_in" : x);
          const canonSet = new Set(valid.map(canon));
          const FULL = ["pickup", "delivery", "dine_in", "take_out", "catering"];
          if (FULL.every((t) => canonSet.has(t))) return "both";
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

/** Two display modes only (Luigi 2026-06-26):
 *   - "menu_visible"        = VISIBLE: shows on the menu (+ optional banner).
 *   - "hidden_coupon_only"  = HIDDEN: shows nowhere; redeemable by code only.
 *  The old "popup" value had no customer-side consumer and is retired → any
 *  unknown value (incl. "popup") collapses to VISIBLE. */
export function normalizeDisplayMode(v: unknown): string {
  const allowed = ["menu_visible", "hidden_coupon_only"];
  if (typeof v === "string" && allowed.includes(v)) return v;
  return "menu_visible";
}

/**
 * Cross-field invariant for the VISIBLE/HIDDEN model, applied once in BOTH the
 * POST and PATCH promotion routes so they can never disagree (Luigi 2026-06-26):
 *   - HIDDEN (`hidden_coupon_only`) ⇒ `autoApply=false` + `showOnBanner=false`
 *     (a hidden promo can never auto-apply or appear on the banner).
 *   - Whenever `autoApply` is false (hidden, OR visible-but-code-required) a
 *     `couponCode` is REQUIRED — returns `error` so the route can 400.
 * Returns the coerced display fields; `error` set ⇒ the caller must reject.
 */
export function resolveDisplayFields(input: {
  displayMode?: unknown;
  autoApply?: unknown;
  showOnBanner?: unknown;
  couponCode?: unknown;
}): { displayMode: string; autoApply: boolean; showOnBanner: boolean; error?: string } {
  const displayMode = normalizeDisplayMode(input.displayMode);
  const hidden = displayMode === "hidden_coupon_only";
  const autoApply = hidden ? false : input.autoApply === undefined ? true : !!input.autoApply;
  const showOnBanner = hidden ? false : input.showOnBanner === undefined ? true : !!input.showOnBanner;
  const code = typeof input.couponCode === "string" ? input.couponCode.trim() : "";
  const error = !autoApply && !code ? "code_required" : undefined;
  return { displayMode, autoApply, showOnBanner, error };
}

/** Acquisition channel a promo applies to: website (default) | marketplace |
 *  both. Default "website" so the marketplace is opt-in. Luigi 2026-06-09. */
export function normalizeChannel(v: unknown): string {
  const allowed = ["website", "marketplace", "both"];
  if (typeof v === "string" && allowed.includes(v)) return v;
  return "website";
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
