/**
 * Localized add-on catalog text (Luigi 2026-07-21).
 *
 * AddOn.name / AddOn.description in the DB are English (seed-addons.ts is
 * the source of truth — re-seeding overwrites them). Owner-facing and public
 * surfaces localize them through the `addOnCatalog.<slug>.{name,description}`
 * message keys (all 38 locales, parity-audited), falling back to the DB text
 * when a slug has no keys yet — so a brand-new add-on degrades to English
 * instead of leaking a raw key path (next-intl renders the literal dot-path
 * on a missing key; no onError/getMessageFallback is configured).
 *
 * Deliberately NOT localized (keep reading the DB text): superadmin surfaces,
 * the reseller area (English-only today), staff notification emails, and the
 * Stripe-hosted checkout/portal (platform Stripe products are single-language).
 *
 * Callers pass a translator scoped to the "addOnCatalog" namespace:
 *   const tCatalog = useTranslations("addOnCatalog");        // client
 *   const tCatalog = await getTranslations("addOnCatalog");  // server
 */

/** Minimal structural type satisfied by both useTranslations() and
 *  getTranslations() results — call + .has() is all we need. */
export type AddOnCatalogTranslator = {
  (key: string): string;
  has(key: string): boolean;
};

export function localizedAddOnName(
  t: AddOnCatalogTranslator,
  slug: string,
  dbName: string,
): string {
  const key = `${slug}.name`;
  return t.has(key) ? t(key) : dbName;
}

export function localizedAddOnDescription(
  t: AddOnCatalogTranslator,
  slug: string,
  dbDescription: string | null,
): string | null {
  const key = `${slug}.description`;
  return t.has(key) ? t(key) : dbDescription;
}
