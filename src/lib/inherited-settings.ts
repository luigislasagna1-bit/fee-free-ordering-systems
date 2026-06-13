/**
 * LIVE per-option location inheritance (Luigi's multi-location spec, 2026-06-13).
 *
 * Distinct from src/lib/location-inheritance.ts, which COPIES the brand's config
 * onto a new child ONCE at creation. This module is the LIVE link: a CHILD
 * location (parentRestaurantId != null) can, from its own account, decide for
 * EACH setting independently whether the PARENT brand controls it (the child
 * reads the parent's CURRENT value on every load) or the child sets it locally —
 * or flip "everything from parent" at once.
 *
 * Storage:
 *   • menu          → the dedicated Restaurant.useBrandMenu boolean (pre-existing
 *                     LIVE menu inheritance — see src/lib/brand.ts; kept as-is so
 *                     we don't regress it).
 *   • hours/zones/  → Restaurant.inheritedSettings, a sparse JSON map
 *     availability    { key: true } where true = "inherit from parent". A missing
 *                     key (or null column) = NOT inheriting, so every existing
 *                     location keeps operating independently.
 *
 * Pure (no DB) — callers pass the restaurant row's relevant fields. Read paths
 * use resolveSettingSourceId() to choose whose data to load, exactly like
 * resolveMenuRestaurantId() already does for the menu.
 */

/** Settings a child can inherit. Extend this list to add more (Luigi's "etc"). */
export const INHERITABLE_SETTINGS = ["menu", "hours", "zones", "availability"] as const;
export type InheritableSetting = (typeof INHERITABLE_SETTINGS)[number];

/** Settings stored in the JSON map (everything except menu, which has its own
 *  boolean column). */
export const JSON_INHERITABLE_SETTINGS = INHERITABLE_SETTINGS.filter(
  (s): s is Exclude<InheritableSetting, "menu"> => s !== "menu",
);

export type InheritanceShape = {
  parentRestaurantId: string | null;
  useBrandMenu?: boolean | null;
  inheritedSettings?: unknown;
};

/** Normalise the raw JSON column into a clean { key: boolean } map, dropping
 *  junk and unknown keys. */
export function parseInheritedSettings(
  raw: unknown,
): Partial<Record<Exclude<InheritableSetting, "menu">, boolean>> {
  const out: Partial<Record<Exclude<InheritableSetting, "menu">, boolean>> = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    for (const key of JSON_INHERITABLE_SETTINGS) {
      if (typeof obj[key] === "boolean") out[key] = obj[key] as boolean;
    }
  }
  return out;
}

/** Is this restaurant currently INHERITING `setting` from its parent brand?
 *  Only a child (parentRestaurantId != null) can inherit. Menu reads the
 *  dedicated useBrandMenu flag; everything else reads inheritedSettings (a
 *  missing key ⇒ NOT inheriting → existing locations are unchanged). */
export function isInheriting(restaurant: InheritanceShape, setting: InheritableSetting): boolean {
  if (!restaurant.parentRestaurantId) return false;
  if (setting === "menu") return restaurant.useBrandMenu === true;
  return parseInheritedSettings(restaurant.inheritedSettings)[setting] === true;
}

/** The restaurant id whose `setting` data should be USED — the parent when
 *  inheriting, else the location itself. Mirrors resolveMenuRestaurantId(). */
export function resolveSettingSourceId(
  restaurant: InheritanceShape & { id: string },
  setting: InheritableSetting,
): string {
  return isInheriting(restaurant, setting) && restaurant.parentRestaurantId
    ? restaurant.parentRestaurantId
    : restaurant.id;
}

/** The full inheritance state for the admin UI: one boolean per setting, plus
 *  whether the child is inheriting EVERYTHING (drives the master toggle). */
export function inheritanceState(
  restaurant: InheritanceShape,
): { perSetting: Record<InheritableSetting, boolean>; all: boolean; isChild: boolean } {
  const perSetting = Object.fromEntries(
    INHERITABLE_SETTINGS.map((s) => [s, isInheriting(restaurant, s)]),
  ) as Record<InheritableSetting, boolean>;
  return {
    perSetting,
    all: INHERITABLE_SETTINGS.every((s) => perSetting[s]),
    isChild: !!restaurant.parentRestaurantId,
  };
}

/** Build the sparse JSON column value (hours/zones/availability) from a desired
 *  per-setting map — used by the update API. Only stores `true` keys so the
 *  column stays sparse; menu is handled separately via useBrandMenu. */
export function buildInheritedSettingsJson(
  desired: Partial<Record<InheritableSetting, boolean>>,
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const key of JSON_INHERITABLE_SETTINGS) {
    if (desired[key] === true) out[key] = true;
  }
  return out;
}
