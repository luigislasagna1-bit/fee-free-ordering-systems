/**
 * Payment methods — accepted-method config that can vary BY ORDER TYPE
 * (GloriaFood parity, Luigi 2026-06-08).
 *
 * `Restaurant.paymentMethods` is a JSON string column that holds EITHER:
 *   - LEGACY: a flat array of slugs, applied to every order type, e.g.
 *       ["cash","online_card"]
 *   - NEW: a per-order-type object, e.g.
 *       { "pickup":["cash","online_card"], "delivery":["cash"], "dine_in":["card_in_person"] }
 *
 * No schema migration is needed — only the SHAPE of the JSON changes, and the
 * reader below accepts both so existing restaurants keep working untouched.
 *
 * SLUGS vs VALUES: the admin/config layer uses SLUGS ("online_card"); the
 * checkout state + order route use the legacy VALUE ("card") for online card.
 * The two ends are bridged by slugToPaymentValue / paymentValueToSlug.
 */

export const PAYMENT_METHOD_SLUGS = ["cash", "card_in_person", "online_card", "paypal"] as const;
export type PaymentMethodSlug = (typeof PAYMENT_METHOD_SLUGS)[number];

/** Order types we let restaurants configure payment methods for. `catering`
 *  shares the `dine_in` config (it's an eat-/serve-side channel). */
export const PAYMENT_ORDER_TYPES = ["pickup", "delivery", "dine_in", "take_out"] as const;
export type PaymentOrderType = (typeof PAYMENT_ORDER_TYPES)[number];

export type PaymentMethodsConfig = Partial<Record<PaymentOrderType, string[]>>;

/** online card is "online_card" as a slug but "card" as the checkout value. */
export function slugToPaymentValue(slug: string): string {
  return slug === "online_card" ? "card" : slug;
}
export function paymentValueToSlug(value: string): string {
  return value === "card" ? "online_card" : value;
}

/**
 * Parse `Restaurant.paymentMethods` into a normalized result. Defensive: a
 * malformed / empty value yields an empty legacy list (caller falls back to
 * cash). Accepts the raw string, an already-parsed array, or an object.
 */
export function parsePaymentMethods(raw: unknown):
  | { mode: "all"; methods: string[] }
  | { mode: "perType"; perType: PaymentMethodsConfig } {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try { parsed = JSON.parse(raw); } catch { parsed = null; }
  }
  if (Array.isArray(parsed)) {
    return { mode: "all", methods: parsed.filter((m): m is string => typeof m === "string") };
  }
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    const perType: PaymentMethodsConfig = {};
    for (const t of PAYMENT_ORDER_TYPES) {
      const v = obj[t];
      if (Array.isArray(v)) perType[t] = v.filter((m): m is string => typeof m === "string");
    }
    return { mode: "perType", perType };
  }
  return { mode: "all", methods: [] };
}

/**
 * The accepted payment-method SLUGS for a given order type. Legacy flat lists
 * apply to every type; a per-type config that has no entry for this type falls
 * back to the union of all configured methods, then to ["cash"] so checkout is
 * never left with zero options.
 */
export function methodsForOrderType(raw: unknown, orderType: string): string[] {
  const cfg = parsePaymentMethods(raw);
  if (cfg.mode === "all") return cfg.methods.length ? cfg.methods : ["cash"];
  const key = (orderType === "catering" ? "dine_in" : orderType) as PaymentOrderType;
  const forType = cfg.perType[key];
  if (forType && forType.length) return forType;
  const union = Array.from(new Set(Object.values(cfg.perType).flat()));
  return union.length ? union : ["cash"];
}

/**
 * The UNION of accepted payment-method SLUGS across every order type. Used by
 * the promo wizard, whose reward / payment-restriction dropdown offers any
 * method the restaurant accepts anywhere (a payment_reward isn't tied to one
 * order type). Handles BOTH the legacy flat array and the per-order-type object
 * — the promo pages previously assumed a flat array and silently got [] for the
 * per-type shape, hiding every real method. Online methods are already
 * entitlement-gated at save time (PUT /api/restaurants/payment-methods strips
 * online_card / paypal without the card_payments add-on), so the list is
 * authoritative — no capability re-check needed here. Luigi 2026-07-07.
 */
export function allAcceptedMethods(raw: unknown): string[] {
  const cfg = parsePaymentMethods(raw);
  if (cfg.mode === "all") return Array.from(new Set(cfg.methods));
  return Array.from(new Set(Object.values(cfg.perType).flat()));
}

/** True when `paymentValue` (checkout VALUE, e.g. "card"/"cash") is accepted
 *  for `orderType`. Used for server-side defense-in-depth in /api/orders. */
export function isPaymentMethodAcceptedForType(raw: unknown, orderType: string, paymentValue: string): boolean {
  const slug = paymentValueToSlug(paymentValue);
  // In-person methods (cash, card-in-person) settle on pickup/delivery and
  // need no provider, so they can never become an uncollectable "ghost" order
  // — they're always acceptable. This also keeps checkout working when a
  // restaurant's only configured method is an online one whose provider isn't
  // ready: the customer falls back to Cash (CheckoutModal's cash safety-net)
  // and the order still goes through. Only ONLINE methods (online_card /
  // paypal) are gated against the restaurant's per-type accepted list.
  if (slug === "cash" || slug === "card_in_person") return true;
  return methodsForOrderType(raw, orderType).includes(slug);
}
