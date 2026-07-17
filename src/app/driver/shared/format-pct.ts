/**
 * Locale-aware integer percent (v1.1 shell). English renders "92%", Turkish
 * renders "%92", etc. — a hardcoded `{value}%` composition is untranslatable
 * (the % sign position is a locale convention, and tr.json overwhelmingly
 * uses the prefix form). Intl.NumberFormat does this with ZERO message keys,
 * so it adds nothing to the ×38 parity surface.
 *
 * @param fraction value as a FRACTION (0.92 → "92%"), rounded to a whole percent.
 */
export function formatPct(fraction: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "percent",
      maximumFractionDigits: 0,
    }).format(fraction);
  } catch {
    // Unknown locale tag — fall back to the English composition.
    return `${Math.round(fraction * 100)}%`;
  }
}
