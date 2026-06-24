import type { PoweredByCredit as Credit } from "@/lib/white-label";

/**
 * Clickable "Powered by Fee Free Ordering" credit linking to www.feefreeordering.com.
 * Free marketing + an SEO backlink from every restaurant storefront. Render it on customer
 * surfaces UNLESS the restaurant is a reseller white-label account — gate at the call site
 * with `!isResellerDebranded(restaurant.resellerProfile)` (src/lib/white-label.ts).
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

/**
 * Customer-page credit resolved per restaurant (resolvePoweredByCredit in src/lib/white-label.ts):
 *  - feefree  → "Powered by Fee Free Ordering" (direct restaurants — SEO backlink)
 *  - reseller → "Powered by {name}" (de-branded reseller, credit ON), linking to their site when set
 *  - none     → nothing (de-branded reseller who opted out)
 * Plain text on purpose — same reasoning as PoweredByFeeFree above.
 */
export function PoweredByCredit({
  credit,
  className,
  color,
}: {
  credit: Credit;
  className?: string;
  color?: string;
}) {
  if (credit.kind === "feefree") return <PoweredByFeeFree className={className} color={color} />;
  if (credit.kind === "none") return null;
  const cls = className ?? "block text-center text-xs text-gray-400";
  const inner = (
    <>
      Powered by{" "}
      <span className="font-semibold" style={color ? { color } : undefined}>
        {credit.name}
      </span>
    </>
  );
  return credit.url ? (
    <a
      href={credit.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`${cls} hover:text-gray-600 transition-colors`}
    >
      {inner}
    </a>
  ) : (
    <div className={cls}>{inner}</div>
  );
}
