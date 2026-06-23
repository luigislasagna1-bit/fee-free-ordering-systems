"use client";
import { useTranslations } from "next-intl";

/**
 * Clickable "Powered by Fee Free Ordering" credit linking to www.feefreeordering.com.
 * Free marketing + an SEO backlink from every restaurant storefront. Render it on customer
 * surfaces UNLESS the restaurant is a reseller white-label account — gate at the call site
 * with `!isResellerWhiteLabel(restaurant.resellerProfile)` (src/lib/white-label.ts).
 *
 * Uses the existing `info.poweredBy` key (translated in all 38 locales) and renders its
 * <brand> tag inside the link. REQUIRES a next-intl provider in scope (the /order client
 * tree has one); on routes without it, use a plain inline <a> instead. Luigi 2026-06-22.
 */
export function PoweredByFeeFree({ className, color }: { className?: string; color?: string }) {
  const t = useTranslations("info");
  return (
    <a
      href="https://www.feefreeordering.com"
      target="_blank"
      rel="noopener"
      className={className ?? "block text-center text-xs text-gray-400 hover:text-gray-600 transition-colors"}
    >
      {t.rich("poweredBy", {
        brand: (chunks) => (
          <span className="font-semibold" style={color ? { color } : undefined}>
            {chunks}
          </span>
        ),
      })}
    </a>
  );
}
