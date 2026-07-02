/**
 * ONE money breakdown for the whole app (Luigi 2026-07-02). A PURE,
 * framework-agnostic builder that emits an ordered, canonical list of labeled
 * money rows so every surface — customer confirmation/status/account, kitchen
 * order detail, admin order detail, transactional emails — renders the SAME
 * lines, in the same order, with the same math. The GOLDEN thermal receipt
 * (receipt.ts / receipt-lines.ts) already emits this exact order and stays the
 * REFERENCE; it is not forced to consume this helper.
 *
 * Canonical order: line items → Subtotal → each discount (by promo NAME+code,
 * or a generic fallback) → Delivery fee (struck "FREE" when a free-delivery
 * promo fired) → service/other fees → Tax → Tip → TOTAL → reward/store-credit
 * USED ("Paid with {label}") → AMOUNT TO PAY / COLLECTED (Total − credit) →
 * payment method → reward EARNED (+). Zero-value lines are skipped.
 *
 * `labelKey` is a FULL i18n key path resolved by the renderer with a root
 * translator (`t(row.labelKey, row.labelArgs)`); dynamic names (promo, service
 * fee, line item) carry an EMPTY labelKey and their text in labelArgs.name.
 * `amount` is already rounded to 2 dp; for `sign: "minus" | "plus"` it stays
 * positive and the renderer prefixes − / +. Never throws — malformed
 * appliedPromos / appliedServiceFees JSON is swallowed and that section skipped.
 */
import { paymentMethodLabelKey } from "./payment-label";

export type MoneyRowKind =
  | "LINE_ITEM"
  | "SUBTOTAL"
  | "PROMO_DISCOUNT"
  | "COUPON_DISCOUNT"
  | "DELIVERY_FEE"
  | "SERVICE_FEE"
  | "TAX"
  | "TIP"
  | "TOTAL"
  | "REWARD_USED"
  | "AMOUNT_TO_PAY"
  | "PAYMENT_METHOD"
  | "REWARD_EARNED"
  | "REFUNDED_SO_FAR";

export interface MoneyRow {
  kind: MoneyRowKind;
  /** Full i18n key path, or "" when the label is a dynamic name in labelArgs.name. */
  labelKey: string;
  labelArgs?: Record<string, string | number>;
  /** Rounded to 2 dp. For minus/plus rows this is POSITIVE; renderer prefixes the sign. */
  amount: number;
  sign: "plain" | "minus" | "plus";
  /** Bold row (TOTAL, AMOUNT_TO_PAY). */
  emphasis?: boolean;
  /** DELIVERY_FEE only: original fee to strike through when free. */
  strikeBase?: number;
  /** DELIVERY_FEE only: render "FREE" instead of the amount. */
  free?: boolean;
  meta?: { promoType?: string; paymentMethod?: string; rawPaymentMethod?: string };
}

export interface MoneyBreakdownInput {
  currency: string;
  audience?: "customer" | "staff";
  items?: Array<{ name: string; quantity: number; lineTotal: number }>;
  showItems?: boolean;
  subtotal: number;
  /** Parsed Order.appliedPromos: per-promo NAME (+code). free_delivery entries drive the struck delivery line. */
  appliedPromos?: Array<{ name?: string; type?: string; discount?: number; couponCode?: string }> | string | null;
  /** Flat fallbacks when appliedPromos is empty (pre-Program-1 orders). */
  promoDiscount?: number;
  couponDiscount?: number;
  deliveryFee: number;
  appliedServiceFees?: Array<{ name?: string; amount?: number }> | string | null;
  taxAmount: number;
  tip?: number;
  total: number;
  orderType?: string | null;
  // Reward / store credit
  rewardsActive: boolean;
  rewardLabelSingular?: string | null;
  rewardLabelPlural?: string | null;
  /** Localized default reward name the caller resolved (t("...rewardDefaultName")). */
  rewardDefaultLabel?: string;
  /** From getOrderRewardSummary(orderId); `used` falls back to creditApplied. */
  reward?: { used?: number; earned?: number };
  creditApplied?: number;
  showRewardEarned?: boolean;
  // Payment + refunds
  paymentMethod?: string | null;
  /** Order.paymentStatus — drives the amount label: "paid" → Collected/Paid
   *  (money already in), otherwise → To collect / Balance to pay (still owed). */
  paidStatus?: string | null;
  refundedAmount?: number | null;
}

export interface MoneyBreakdown {
  rows: MoneyRow[];
  currency: string;
  total: number;
  /** max(0, total − rewardUsed) — the amount actually collected / charged. */
  amountToPay: number;
  rewardUsed: number;
  rewardEarned: number;
  rewardLabel: string;
}

const round2 = (n: number): number => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function asArray<T>(v: T[] | string | null | undefined): T[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v.trim()) {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function buildMoneyBreakdown(input: MoneyBreakdownInput): MoneyBreakdown {
  const rows: MoneyRow[] = [];
  const audience = input.audience ?? "customer";
  const isDelivery = input.orderType === "delivery" || input.orderType === "catering";

  // Optional line items (most surfaces render their own item list; off by default).
  if (input.showItems && input.items) {
    for (const it of input.items) {
      rows.push({ kind: "LINE_ITEM", labelKey: "", labelArgs: { name: it.name, quantity: it.quantity }, amount: round2(it.lineTotal), sign: "plain" });
    }
  }

  rows.push({ kind: "SUBTOTAL", labelKey: "receipt.customer.subtotal", amount: round2(input.subtotal), sign: "plain" });

  // Discounts: prefer per-promo NAMED rows; else the flat legacy columns.
  const promos = asArray(input.appliedPromos);
  const named = promos.filter((p) => p && p.type !== "free_delivery" && Number(p.discount ?? 0) > 0);
  const freeDelivery = promos.find((p) => p && p.type === "free_delivery" && Number(p.discount ?? 0) > 0);
  if (named.length > 0) {
    for (const p of named) {
      rows.push({
        kind: "PROMO_DISCOUNT",
        labelKey: "",
        labelArgs: { name: p.name ?? "", code: p.couponCode ?? "" },
        amount: round2(Number(p.discount)),
        sign: "minus",
        meta: { promoType: p.type },
      });
    }
    // A coupon column not represented in appliedPromos (rare) still shows.
    const couponD = round2(input.couponDiscount ?? 0);
    const sumNamed = round2(named.reduce((s, p) => s + Number(p.discount ?? 0), 0));
    if (couponD > 0 && couponD > sumNamed) {
      rows.push({ kind: "COUPON_DISCOUNT", labelKey: "receipt.customer.couponDiscount", amount: round2(couponD - sumNamed), sign: "minus" });
    }
  } else {
    const promoD = round2(input.promoDiscount ?? 0);
    const couponD = round2(input.couponDiscount ?? 0);
    if (promoD > 0) rows.push({ kind: "PROMO_DISCOUNT", labelKey: "receipt.customer.promoDiscount", amount: promoD, sign: "minus" });
    if (couponD > 0) rows.push({ kind: "COUPON_DISCOUNT", labelKey: "receipt.customer.couponDiscount", amount: couponD, sign: "minus" });
  }

  // Delivery fee (delivery/catering only). Free-delivery promo → strike + FREE.
  if (isDelivery) {
    if (freeDelivery) {
      rows.push({ kind: "DELIVERY_FEE", labelKey: "receipt.customer.deliveryFee", amount: 0, sign: "plain", strikeBase: round2(Number(freeDelivery.discount)), free: true });
    } else {
      rows.push({ kind: "DELIVERY_FEE", labelKey: "receipt.customer.deliveryFee", amount: round2(input.deliveryFee), sign: "plain" });
    }
  }

  // Service / other fees (each by name).
  for (const f of asArray(input.appliedServiceFees)) {
    if (f && Number(f.amount ?? 0) !== 0) {
      rows.push({ kind: "SERVICE_FEE", labelKey: "", labelArgs: { name: f.name ?? "" }, amount: round2(Number(f.amount)), sign: "plain" });
    }
  }

  if (round2(input.taxAmount ?? 0) > 0) rows.push({ kind: "TAX", labelKey: "receipt.customer.tax", amount: round2(input.taxAmount), sign: "plain" });
  if (round2(input.tip ?? 0) > 0) rows.push({ kind: "TIP", labelKey: "receipt.customer.tip", amount: round2(input.tip!), sign: "plain" });

  rows.push({ kind: "TOTAL", labelKey: "receipt.customer.total", amount: round2(input.total), sign: "plain", emphasis: true });

  // Reward / store credit.
  const rewardLabel =
    input.rewardLabelPlural?.trim() ||
    input.rewardLabelSingular?.trim() ||
    input.rewardDefaultLabel?.trim() ||
    "credit";
  const rewardUsed = input.rewardsActive ? round2(input.reward?.used ?? input.creditApplied ?? 0) : 0;
  const rewardEarned = input.rewardsActive ? round2(input.reward?.earned ?? 0) : 0;
  const amountToPay = round2(Math.max(0, input.total - rewardUsed));

  if (rewardUsed > 0) {
    rows.push({ kind: "REWARD_USED", labelKey: "receipt.customer.paidWithReward", labelArgs: { label: rewardLabel }, amount: rewardUsed, sign: "minus" });
    // Label depends on whether the non-credit portion was already PAID (online
    // card/PayPal captured) or is still OWED (cash to collect at pickup). Never
    // say "Collected" for an unpaid order (Luigi 2026-07-02).
    const isPaid = (input.paidStatus ?? "").toLowerCase() === "paid";
    rows.push({
      kind: "AMOUNT_TO_PAY",
      labelKey: audience === "staff"
        ? (isPaid ? "money.amountCollected" : "money.toCollect")
        : (isPaid ? "money.paid" : "receipt.customer.balanceDue"),
      amount: amountToPay,
      sign: "plain",
      emphasis: true,
    });
  }

  // Payment method (name only; amount 0 — it's a label row).
  if (input.paymentMethod) {
    const key = paymentMethodLabelKey(input.paymentMethod, input.orderType);
    rows.push({
      kind: "PAYMENT_METHOD",
      labelKey: key ?? "",
      labelArgs: key ? undefined : { name: input.paymentMethod },
      amount: 0,
      sign: "plain",
      meta: { paymentMethod: key ?? undefined, rawPaymentMethod: input.paymentMethod },
    });
  }

  if (round2(input.refundedAmount ?? 0) > 0) {
    rows.push({ kind: "REFUNDED_SO_FAR", labelKey: "money.refundedSoFar", amount: round2(input.refundedAmount!), sign: "minus" });
  }

  if (rewardEarned > 0 && (input.showRewardEarned ?? input.rewardsActive)) {
    rows.push({ kind: "REWARD_EARNED", labelKey: "receipt.customer.earnedReward", labelArgs: { label: rewardLabel }, amount: rewardEarned, sign: "plus" });
  }

  return { rows, currency: input.currency, total: round2(input.total), amountToPay, rewardUsed, rewardEarned, rewardLabel };
}
