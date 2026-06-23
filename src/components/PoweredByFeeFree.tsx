/**
 * Clickable "Powered by Fee Free Ordering" credit linking to www.feefreeordering.com.
 * Free marketing + an SEO backlink from every restaurant storefront. Render it on customer
 * surfaces UNLESS the restaurant is a reseller white-label account — gate at the call site
 * with `!isResellerWhiteLabel(restaurant.resellerProfile)` (src/lib/white-label.ts).
 *
 * PLAIN text on purpose (no useTranslations): the i18n-hook version rendered the raw key
 * "info.poweredBy" on the menu page because the `info` namespace isn't resolvable in every
 * route's next-intl provider. "Fee Free Ordering" is a brand name (never translated) and the
 * /site footer already uses plain English for this same credit, so plain text is consistent
 * AND can never fall back to a raw key. No hooks → safe in both server and client trees.
 * Luigi 2026-06-22.
 */
export function PoweredByFeeFree({ className, color }: { className?: string; color?: string }) {
  return (
    <a
      href="https://www.feefreeordering.com"
      target="_blank"
      rel="noopener"
      className={className ?? "block text-center text-xs text-gray-400 hover:text-gray-600 transition-colors"}
    >
      Powered by{" "}
      <span className="font-semibold" style={color ? { color } : undefined}>
        Fee Free Ordering
      </span>
    </a>
  );
}
