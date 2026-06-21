/**
 * Customer-facing service labels (Pickup / Delivery / Dine-In / …).
 *
 * Restaurants CAN rename a service in admin → Services (a "Display Name" field),
 * but the seeded defaults are hardcoded ENGLISH ("Pickup", "Delivery", …) and the
 * Services save always persists `{ ...DEFAULT_SETTINGS, ...settings }`. So every
 * restaurant that has ever saved its Services page ends up with an English
 * displayName for each service — and naively doing `displayName || t(...)` then
 * shows those English names to customers in EVERY language, breaking i18n.
 *
 * Rule here: show the localized canonical label by default, and only honor the
 * owner's displayName when it's a GENUINE rename — i.e. non-empty AND different
 * from the seeded English default. A French customer then sees "Livraison", an
 * English one "Delivery", while an owner who truly branded it "Express Pickup"
 * still gets their custom name (untranslated, as a single owner-chosen string).
 */

/** The English defaults seeded by the Services admin (keep in sync with
 *  src/app/api/admin/services/route.ts DEFAULT_SETTINGS). A stored displayName
 *  equal to one of these means the owner never customized it. */
const DEFAULT_SERVICE_NAMES: Record<string, string> = {
  pickup: "Pickup",
  delivery: "Delivery",
  dineIn: "Dine-In",
  catering: "Catering",
  takeOut: "Take Out",
  reservations: "Table Reservations",
};

/** serviceSettings key → canonical i18n key in the "ordering" namespace. */
const CANONICAL_ORDERING_KEY: Record<string, string> = {
  pickup: "pickup",
  delivery: "delivery",
  dineIn: "dineIn",
  catering: "catering",
  takeOut: "takeOut",
  reservations: "tableReservation",
};

type SvcSettings = Record<string, { displayName?: string } | undefined> | null | undefined;

/**
 * The label to show a CUSTOMER for a service.
 * @param serviceKey  serviceSettings key: pickup | delivery | dineIn | catering | takeOut | reservations
 * @param svcSettings parsed restaurant.serviceSettings (may be null/empty)
 * @param tOrdering   a next-intl translator bound to the "ordering" namespace
 */
export function serviceLabel(
  serviceKey: string,
  svcSettings: SvcSettings,
  tOrdering: (key: string) => string,
): string {
  const custom = svcSettings?.[serviceKey]?.displayName?.trim();
  const def = DEFAULT_SERVICE_NAMES[serviceKey];
  const canonicalKey = CANONICAL_ORDERING_KEY[serviceKey] ?? serviceKey;
  // Genuine owner rename → use it; otherwise the localized canonical label.
  if (custom && custom !== def) return custom;
  return tOrdering(canonicalKey);
}
