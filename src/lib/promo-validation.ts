/**
 * Shared promo-config validation used by BOTH the wizard (client, for a
 * localized pre-save block) and the create/update API routes (server, the
 * authoritative backstop) so the rule can never diverge.
 */

/**
 * Types the min-cart≥discount rule applies to. Only `fixed_cart` — a WHOLE-cart
 * dollar-off with no item requirement, so "$30 off" on a $5 cart is nonsense.
 * `fixed_combo` is deliberately EXCLUDED: a combo requires specific items from
 * each group and its discount is already capped at the value of the units it
 * claims, so it can never give away more than the combo is worth — and
 * GloriaFood likewise doesn't force a minimum on combos. Luigi 2026-07-07.
 */
export const FIXED_DISCOUNT_TYPES = ["fixed_cart"] as const;

export function isFixedDiscountType(promotionType: string): boolean {
  return (FIXED_DISCOUNT_TYPES as readonly string[]).includes(promotionType);
}

/**
 * A whole-cart fixed dollar-off promo can never discount MORE than the minimum
 * cart it requires — otherwise a "$30 off" promo qualifies on a sub-$30 cart and
 * gives away more than the order is worth (it only ever caps at $0). So the
 * minimum cart is MANDATORY and must be ≥ the discount amount. Luigi 2026-07-07.
 *
 * Returns an error payload (with a stable `code` + the `discount` for the
 * localized message) when the config is invalid, or null when it's fine.
 */
export function fixedDiscountMinError(
  promotionType: string,
  ruleConfig: unknown,
  minimumOrder: unknown,
): { error: string; code: "min_below_discount"; discount: number } | null {
  if (!isFixedDiscountType(promotionType)) return null;
  const discount = Number((ruleConfig as { discountAmount?: unknown } | null | undefined)?.discountAmount) || 0;
  const minOrder = Number(minimumOrder) || 0;
  if (discount > 0 && minOrder < discount) {
    return {
      error: `The minimum cart amount must be at least the discount amount (${discount}).`,
      code: "min_below_discount",
      discount,
    };
  }
  return null;
}
