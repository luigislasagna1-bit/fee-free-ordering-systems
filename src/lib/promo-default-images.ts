/**
 * Stock promo card backgrounds restaurants can pick from instead of
 * uploading their own. SVG files in /public/promo-defaults/ so they're
 * served fast (no DB or storage hit) and look crisp at any zoom.
 *
 * Used by:
 *   - The admin wizard (Step 3 → Promo card image) shows these as a
 *     pickable gallery alongside the upload widget.
 *   - The customer-facing banner card falls back to the first entry
 *     when a promo has no imageUrl set.
 *
 * To add a 4th: drop a 576×288 SVG in /public/promo-defaults/ and
 * append a row here.
 */

export type PromoDefaultImage = {
  /** URL path served by Next.js's static asset pipeline. */
  url: string;
  /** Short label shown under the thumbnail in the picker. */
  label: string;
  /** Longer description for screen readers + tooltips. */
  description: string;
};

export const PROMO_DEFAULT_IMAGES: ReadonlyArray<PromoDefaultImage> = [
  {
    url: "/promo-defaults/sale-burst.svg",
    label: "Special Offer",
    description: "Bold orange-to-red gradient with a SALE starburst — high-energy, attention-grabbing.",
  },
  {
    url: "/promo-defaults/percent-tag.svg",
    label: "Save Big",
    description: "Cool emerald green with a giant percentage outline — best for % off promos.",
  },
  {
    url: "/promo-defaults/food-deal.svg",
    label: "Tasty Deal",
    description: "Warm browns with a stylised pizza on a plate — food-themed and friendly.",
  },
] as const;

/** Default image when a promo has no imageUrl set at all. The customer-
 *  facing banner card falls back to this so every promo always has a
 *  decent visual instead of a flat colour block. */
export const PROMO_DEFAULT_FALLBACK_URL = PROMO_DEFAULT_IMAGES[0].url;
