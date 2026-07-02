/**
 * Shared payment-method → i18n label KEY map (Luigi 2026-07-02, money-display
 * normalization). Returns a FULL i18n key path from the message root — resolve
 * with a ROOT translator: `t(key)` where `const t = useTranslations()` /
 * `getTranslations()`. Works in React pages, emails, and dict-based paths alike.
 *
 * The GOLDEN thermal receipt keeps its OWN payment labels (receipt.customer.*)
 * and is not forced to use this. Unknown methods return null so the caller
 * echoes the raw string (capitalized) — the current fallback, never a blank.
 */
export function paymentMethodLabelKey(
  method: string | null | undefined,
  orderType?: string | null,
): string | null {
  const m = (method ?? "").trim().toLowerCase();
  const delivery = orderType === "delivery" || orderType === "catering";
  switch (m) {
    case "card":
    case "online":
    case "online_card":
    case "stripe":
      return "money.pay.card";
    case "card_in_person":
    case "card_on_pickup":
    case "card_on_delivery":
      return delivery ? "money.pay.cardOnDelivery" : "money.pay.cardOnPickup";
    case "cash":
      return delivery ? "money.pay.cashOnDelivery" : "money.pay.cashOnPickup";
    case "paypal":
      return "money.pay.paypal";
    case "reward_credit":
      return "money.pay.rewardCredit";
    default:
      return null;
  }
}
