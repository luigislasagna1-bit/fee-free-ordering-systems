// ─── Promotion Engine ──────────────────────────────────────────────────────────
// Rules-based promotion calculation engine
// Each promotionType has its own rules JSON structure and calculation logic.
//
// Happy-Hour window math (day-of-week + hour-of-day) lives in the shared,
// client-safe ./promo-window module so the customer ordering page (banner
// greying / claim gating / nudge) and this server engine never drift.
import { localDateParts, isWithinUsableWindow } from "./promo-window";
import { getPromoTypeMeta } from "./promo-types";
//
// UNIVERSAL AUTO-APPLY PRINCIPLE (Luigi 2026-05-29):
//   "As long as the customer enters the coupon (if necessary), it shouldn't
//    matter if they do it first or after — the coupon should be applied. Or
//    if no coupon is necessary, it should be applied if eligible."
//
// Translation for the engine:
//   1. Every cart change → re-run applyPromotions().
//   2. A promo with no couponCode auto-applies whenever isEligible() is true.
//   3. A promo with a couponCode applies whenever:
//        - the customer has entered that code, AND
//        - isEligible() is true
//      regardless of whether the code was entered before or after the items.
//
// Restrictions are evaluated inside isEligible():
//   Happy Hour     → daysOfWeek + usableHourStart/End  (already wired)
//   Delivery Area  → deliveryZoneIds (NEW)
//   Cart Value     → minimumOrder
//   Payment        → paymentMethodSlugs (NEW)
//   Expiration     → startsAt/endsAt
//   Client Type    → customerType: any | new | returning | member (NEW: member)
//   Frequency      → usageLimit + onceLifetimePerClient (NEW)
//   Exclusivity    → stackingRule: standard | exclusive | master

export type ItemGroup = {
  id: string;
  label: string;
  categoryIds: string[];
  itemIds: string[];
  /** Specific size-variant IDs the group targets. When set (and the parent
   *  item is NOT also in itemIds), only those variants qualify. Empty/absent
   *  = no variant-level restriction. Additive — never narrows existing
   *  item/category matches. Luigi 2026-06-07. */
  variantIds?: string[];
  role?: "paid" | "free" | "trigger" | "required";
  minCount?: number;
  maxCount?: number;
  extraFee?: number;
};

export type PromoRules = {
  // percentage_off, payment_reward, percentage_combo
  discountPercent?: number;
  // fixed_cart, fixed_combo
  discountAmount?: number;
  // meal_bundle, meal_bundle_speciality
  bundlePrice?: number;
  // payment_reward
  paymentMethod?: string;
  // free_item - spend trigger
  triggerAmount?: number;
  // buy_n_get_free, bogo discount strategy
  discountStrategy?: "cheapest" | "most_expensive" | "fixed_percent";
  cheapestDiscount?: number;   // % off cheapest item (default 100 = fully free)
  mostExpensiveDiscount?: number; // % off most expensive
  // bogo / buy_n_get_free: cap the deal to a single application per order when
  // the owner checks "Only allowed once per order". Unchecked (default/absent)
  // → the deal repeats per qualifying pair. Luigi 2026-06-07.
  oncePerOrder?: boolean;
  // item groups (all multi-group types)
  groups?: ItemGroup[];
};

export type PromoResult = {
  promoId: string;
  name: string;
  discount: number;
  type: string;
  couponCode?: string;
  stackingRule: string;
  description?: string;
  /** Per-item breakdown for deals that apply more than once (bogo /
   *  buy_n_get_free) — one entry per discounted unit, so the cart can list
   *  each freed item instead of one lump sum. Empty/absent for single-shot
   *  deals. Item names are resolved downstream (the engine only knows ids). */
  breakdown?: DiscountLine[];
  /** reward_credit only: store credit the customer will EARN on completion (not
   *  a discount). Lets the cart show "Earn $X" instead of a discount line. */
  creditAmount?: number;
};

export type CartItem = {
  menuItemId: string;
  categoryId?: string;
  /** The chosen size variant's ID, when the line is a specific variant.
   *  Lets promos target a specific size. Null/absent on no-variant items. */
  variantId?: string | null;
  price: number;
  quantity: number;
  subtotal: number;
  /** Per-unit price of the sized item WITHOUT its choices/add-ons/toppings
   *  (= the chosen size variant's price, or the item price when no variant).
   *  Lets a BOGO/free-item promo free just the base and still charge for the
   *  toppings ("Charge extra for Choices/Add-ons" — GloriaFood parity). Absent
   *  → falls back to `price` (whole unit free, the default). Luigi 2026-07-07. */
  sizedBase?: number;
  /** Per-unit item price WITHOUT the size upcharge AND without choices/add-ons
   *  (= MenuItem.price). Lets a promo free only the base and charge for both the
   *  size upgrade and the toppings ("Charge extra for Choices/Add-ons & Sizes").
   *  Absent → falls back to `price`. Luigi 2026-07-07. */
  baseNoSize?: number;
  /** True when this line was added as a promo freebie ("Free with promo: …").
   *  Lets free_item discount the CLAIMED freebie (not just the cheapest match)
   *  and excludes the freed unit from its own trigger. Luigi 2026-06-27. */
  isFreebie?: boolean;
  /** Caller-supplied stable key for THIS cart line (e.g. its index). Echoed in
   *  DiscountLine so the cart can attribute a saving to the exact line even when
   *  the same dish is on two lines. Optional + display-only. Luigi 2026-06-30. */
  lineKey?: string;
  /** True when this line must never be discounted by any promo/coupon (gift
   *  cards — a $10 coupon must not buy a $10 gift card for $0, minting store
   *  credit). Resolved by the caller from MenuItem.promoExcluded OR its
   *  category's flag. Excluded lines: never match an item group, don't count
   *  toward minimumOrder, and are outside the whole-cart discountable base.
   *  Luigi 2026-07-01/02. */
  promoExcluded?: boolean;
};

/** Subtotal of the DISCOUNTABLE lines only — the whole-cart base every
 *  order-level discount (%-off with no groups, fixed_cart, payment_reward)
 *  and the minimumOrder eligibility check run against. Falls back to
 *  ctx.subtotal when no line is flagged, so legacy callers that don't thread
 *  items (or the flag) behave exactly as before. */
export function discountableSubtotal(ctx: ApplyContext): number {
  const excluded = ctx.items.reduce((s, i) => s + (i.promoExcluded ? i.subtotal : 0), 0);
  if (excluded <= 0) return ctx.subtotal;
  return Math.max(0, parseFloat((ctx.subtotal - excluded).toFixed(2)));
}

export type PromoInput = {
  id: string;
  name: string;
  description?: string | null;
  promotionType: string;
  isActive: boolean;
  stackingRule: string;
  /** Either "pickup", "delivery", "both", or a JSON-stringified array
   *  of types (e.g. `'["pickup","delivery","dine_in"]'`). The engine
   *  normalises to a Set for the membership check. */
  orderType: string;
  /** "any" | "new" | "returning" | "member" — Client Type restriction. */
  customerType: string;
  minimumOrder: number;
  /** Legacy: type-specific config as a JSON-encoded string. New code
   *  should populate `ruleConfig` (object/JSON) instead. The engine
   *  reads `ruleConfig` first, then falls back to `rules`. */
  rules: string;
  /** New (Phase 2a): type-specific config as a JSON object. When set,
   *  takes precedence over `rules`. Same shape contract as `PromoRules`. */
  ruleConfig?: unknown;
  daysOfWeek?: string | null;
  /** Minutes-since-midnight inclusive lower bound for when the promo
   *  becomes USABLE today. NULL = no lower bound (00:00). */
  usableHourStart?: number | null;
  /** Minutes-since-midnight exclusive upper bound. NULL = no upper bound
   *  (24:00). When usableHourStart > usableHourEnd, the window WRAPS
   *  past midnight (e.g. 22:00–02:00 = late-night promo). */
  usableHourEnd?: number | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  usageLimit?: number | null;
  usedCount: number;
  autoApply: boolean;
  couponCode?: string | null;

  // ── Restriction columns (Phase 2a, 2026-05-29) ───────────────────────
  /** JSON-stringified array of payment-method slugs allowed. Null = all
   *  enabled methods are allowed (no payment restriction). Slugs match
   *  Restaurant.paymentMethods values: "cash" | "card_in_person" |
   *  "online_card" | "paypal". */
  paymentMethodSlugs?: string | null;
  /** JSON-stringified array of DeliveryZone IDs the promo applies to.
   *  Null = no zone restriction. Only enforced when ctx.deliveryZoneId
   *  is provided (i.e. delivery orders that landed in a known zone). */
  deliveryZoneIds?: string | null;
  /** Frequency restriction: once-per-client-FOREVER. Caller must
   *  pre-compute `ctx.hasUsedLifetime` for this promo+customer pair. */
  onceLifetimePerClient?: boolean;
  /** Display Time → Limited showtime sub-config. Render-side concern
   *  (gates whether the promo CARD shows on the menu). NOT enforced in
   *  `isEligible` — if the customer has the coupon code, they can still
   *  apply it outside the visibility window. Engine only carries the
   *  field through so consumers can read it. */
  limitedShowtimeSchedules?: unknown;
  /** When set, the promo type is gated behind an add-on the restaurant
   *  must have active. Engine itself doesn't check this — the caller
   *  must filter promos by entitlement BEFORE invoking the engine
   *  (typically with `restaurant.hasFeature(slug)`). The field is
   *  carried here for traceability + safety nets. */
  requiredAddOnSlug?: string | null;
};

export type ApplyContext = {
  /** Order channel. Multi-select promos match any of their listed types.
   *  "take_out" is the live customer value; "takeout" kept for legacy data. */
  orderType: "pickup" | "delivery" | "dine_in" | "catering" | "take_out" | "takeout";
  /** True when this is the customer's first order ever at the restaurant. */
  isNewCustomer: boolean;
  /** True when the customer has a registered account (CustomerAccount).
   *  Distinct from `isNewCustomer` — a member could be brand-new (just
   *  signed up) or a returning customer with order history. */
  isMember?: boolean;
  subtotal: number;
  items: CartItem[];
  couponCode?: string;
  paymentMethod?: string;
  /** Delivery zone the order is being delivered to (for delivery orders
   *  that resolved to a known zone). Used for the Delivery Area
   *  restriction. */
  deliveryZoneId?: string;
  /** The delivery fee this order would pay (delivery orders only; 0/undefined
   *  otherwise). free_delivery promos have no cart discount but are WORTH this
   *  fee — the engine scores them at it when picking the best EXCLUSIVE, so a
   *  free_delivery exclusive can beat a small cart-discount exclusive (audit
   *  B10). Optional: when absent, free_delivery scores 0 as before. */
  deliveryFee?: number;
  /** Per-promo "has this customer used this promo before (lifetime)?"
   *  map. Keyed by promotion id. Caller pre-computes via Order rows
   *  filtered to this customer + this promotion. */
  hasUsedLifetime?: Record<string, boolean>;
  now?: Date;
  /** Restaurant's IANA timezone (e.g. "Europe/Rome", "America/Toronto").
   *  Used to evaluate the day-of-week + hour-of-day usability windows
   *  in the OWNER's local time rather than the server's UTC clock.
   *  Without this, an Italian restaurant's "3 PM – 6 PM" Happy Hour
   *  is compared against UTC — so an actual 4 PM Italy customer hits
   *  the engine as 14:00 UTC and falls outside the window, producing
   *  a silent no-apply (Luigi flagged 2026-05-31, Italian beta tester).
   *  Falls back to the server clock when undefined for legacy callers. */
  restaurantTimezone?: string;
};

// localDateParts + isWithinUsableWindow now live in ./promo-window (shared with
// the client). Imported at the top of this file.

function safeJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

function getRules(promo: PromoInput): PromoRules {
  // Phase 2a: `ruleConfig` (Json column) takes precedence over `rules`
  // (legacy String). Migration path: new wizards write ruleConfig only;
  // existing promos with `rules` populated continue to work unchanged.
  if (promo.ruleConfig && typeof promo.ruleConfig === "object") {
    return promo.ruleConfig as PromoRules;
  }
  return safeJson<PromoRules>(promo.rules, {});
}

/** Parse a list-or-scalar JSON-string into a Set. Null/empty → null
 *  (meaning "no restriction; everything passes"). Used for the payment
 *  and delivery-area restrictions. */
function jsonStringList(s: string | null | undefined): Set<string> | null {
  if (!s) return null;
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return new Set(parsed.map(String));
    }
    return null;
  } catch {
    return null;
  }
}

/** Canonicalise an order-type value so promo restrictions match orders
 *  regardless of legacy spelling. Customer orders use "take_out" / "dine_in";
 *  older promos (and the promo engine's own type) used "takeout" / "dinein".
 *  Map them all to one canonical form. */
function canonicalOrderType(t: string): string {
  const k = String(t).toLowerCase().replace(/[\s-]+/g, "_");
  if (k === "takeout" || k === "take_out") return "take_out";
  if (k === "dinein" || k === "dine_in") return "dine_in";
  return k;
}

/** orderType can be a single value ("pickup", "delivery", "both") or a
 *  JSON-stringified array (multi-select). Returns a Set of allowed
 *  channels, or null when the promo accepts any channel ("both"). */
function parseOrderTypes(raw: string): Set<string> | null {
  if (!raw || raw === "both") return null;
  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        if (parsed.length === 0) return null;
        return new Set(parsed.map(String));
      }
    } catch {
      // fall through
    }
  }
  return new Set([raw]);
}

// ── Schedule / eligibility checks ─────────────────────────────────────────────

function isScheduledNow(promo: PromoInput, now: Date, tz?: string): boolean {
  if (promo.startsAt && now < new Date(promo.startsAt)) return false;
  if (promo.endsAt && now > new Date(promo.endsAt)) return false;
  // Day-of-week + hour-of-day both evaluated in the restaurant's
  // timezone, NOT the server's UTC clock. Without this an Italian
  // restaurant's 15:00–18:00 Happy Hour window is checked against
  // Vercel's UTC time and silently fails for any customer whose
  // local hour disagrees with UTC. Fall back to server-local fields
  // when no tz is supplied so legacy callers behave as before.
  // Day-of-week + hour-of-day window — shared with the customer ordering page
  // via ./promo-window so the banner/claim gating agrees with the discount.
  // (Empty daysOfWeek = every day; the hour window wraps past midnight when
  // start > end, e.g. 23:00–04:00. See isWithinUsableWindow.)
  const { weekday, minuteOfDay } = localDateParts(now, tz);
  return isWithinUsableWindow(promo, weekday, minuteOfDay);
}

function isEligible(promo: PromoInput, ctx: ApplyContext): boolean {
  if (!promo.isActive) return false;

  // ── Frequency restriction ──────────────────────────────────────────
  // Global usage cap.
  if (promo.usageLimit != null && promo.usedCount >= promo.usageLimit) return false;
  // Lifetime per-customer cap. Caller pre-computes
  // `ctx.hasUsedLifetime[promo.id]` from order history.
  if (
    promo.onceLifetimePerClient &&
    ctx.hasUsedLifetime?.[promo.id] === true
  ) {
    return false;
  }

  // ── Cart Value restriction ─────────────────────────────────────────
  // "Did the customer spend enough to qualify?" A gift card is a REAL
  // purchase, so it counts toward the spend threshold for fee-waiver and
  // cart-discount promos (buying $30 unlocks a "$30+ → free delivery" deal).
  // Gift cards are still never DISCOUNTED: every benefit calc runs on the
  // discountable base, so a gift-card-only cart yields $0 for cart-discount
  // promos (they self-cap and drop out of the results). The two types that
  // GIVE something away for free — a free item, or granted store credit —
  // keep the strict discountable gate, so nobody can mint free value by buying
  // a gift card. Luigi 2026-07-06 (was: discountable-only for every type).
  const givesFreeValue =
    promo.promotionType === "free_item" || promo.promotionType === "reward_credit";
  const spendBase = givesFreeValue ? discountableSubtotal(ctx) : ctx.subtotal;
  if (promo.minimumOrder > 0 && spendBase < promo.minimumOrder) return false;

  // ── Order channel (multi-select) ───────────────────────────────────
  // Canonicalise both sides so a "take_out" order matches a promo restricted
  // to "takeout" (and dine_in/dinein variants) regardless of spelling.
  const allowedOrderTypes = parseOrderTypes(promo.orderType);
  if (allowedOrderTypes) {
    const allowedCanon = new Set([...allowedOrderTypes].map(canonicalOrderType));
    if (!allowedCanon.has(canonicalOrderType(ctx.orderType))) return false;
  }

  // ── Type-level forced order channels ───────────────────────────────
  // Some promo types are inherently channel-locked regardless of the stored
  // orderType column (e.g. free_delivery only makes sense on delivery). Honor
  // the type metadata so a free_delivery promo saved as "both" can't apply to —
  // and silently occupy an exclusive slot on — a pickup/dine-in order, paying
  // $0 while blocking a real discount (audit B4). Type-agnostic: covers any
  // current/future type that declares forcedOrderTypes.
  const forcedOrderTypes = getPromoTypeMeta(promo.promotionType)?.forcedOrderTypes;
  if (forcedOrderTypes && forcedOrderTypes.length > 0) {
    const forcedCanon = new Set(forcedOrderTypes.map(canonicalOrderType));
    if (!forcedCanon.has(canonicalOrderType(ctx.orderType))) return false;
  }

  // ── Client Type restriction ────────────────────────────────────────
  // "any"       → no client-type restriction
  // "new"       → first order ever at this restaurant
  // "returning" → has ordered before (i.e. NOT a new customer)
  // "member"    → has a registered CustomerAccount (orthogonal to order
  //               history; a brand-new member who's never ordered IS a
  //               member, while a 10-order guest is NOT)
  if (promo.customerType === "new" && !ctx.isNewCustomer) return false;
  if (promo.customerType === "returning" && ctx.isNewCustomer) return false;
  if (promo.customerType === "member" && !ctx.isMember) return false;

  // ── Payment restriction ────────────────────────────────────────────
  // Promo only valid when paid via one of the allowed methods. If the
  // ctx hasn't selected a payment method yet (early in the cart flow),
  // we let the promo pass — the order-create endpoint runs the engine
  // again at submit time with the real payment method, which catches
  // any mismatch then.
  const allowedPaymentMethods = jsonStringList(promo.paymentMethodSlugs);
  if (allowedPaymentMethods && ctx.paymentMethod) {
    // The customer picker stores online-card as the legacy value "card"
    // (CheckoutModal), but the promo stores the canonical "online_card"
    // slug. Treat them as the same method so an online-card payment both
    // (a) doesn't lose a legit online-only promo and (b) a cash payment
    // doesn't wrongly keep one.
    const pmSlug = ctx.paymentMethod === "card" ? "online_card" : ctx.paymentMethod;
    if (!allowedPaymentMethods.has(pmSlug)) return false;
  }

  // ── Delivery Area restriction ──────────────────────────────────────
  // Only meaningful for delivery orders that resolved to a known zone.
  // Pickup/dine-in orders skip this check (no zone applies).
  const allowedZones = jsonStringList(promo.deliveryZoneIds);
  if (allowedZones) {
    // Pickup/dine-in carts have no zone — restriction implicitly fails
    // for them. (Owners who want a delivery-only promo should ALSO
    // restrict orderType to "delivery".)
    if (ctx.orderType !== "delivery") return false;
    if (!ctx.deliveryZoneId || !allowedZones.has(ctx.deliveryZoneId)) return false;
  }

  // ── Happy Hour + Expiration ────────────────────────────────────────
  if (!isScheduledNow(promo, ctx.now ?? new Date(), ctx.restaurantTimezone)) return false;

  return true;
}

// ── Item group matching ────────────────────────────────────────────────────────

/** Does a SINGLE cart item match a group? A group with NO targeting (no items,
 *  categories, AND no variants) matches NOTHING — not the whole cart. CRITICAL
 *  money-safety rule (Luigi 2026-06-11): whole-cart promos carry NO groups at
 *  all, so a fully-empty *group* is always corruption / misconfiguration. The
 *  old "empty → all items" behaviour turned a single lost categoryIds array into
 *  catastrophic over-discounting. Shared by EVERY multi-group promo type. */
function itemMatchesGroup(group: ItemGroup, i: CartItem): boolean {
  // Promo-excluded lines (gift cards) never match ANY group — the single
  // choke point that keeps every grouped type (BOGO, buy-N-get-free,
  // free_item, free_dish, combos, bundles, grouped %-off) off them. Luigi 2026-07-02.
  if (i.promoExcluded) return false;
  const { itemIds = [], categoryIds = [], variantIds = [] } = group;
  if (!itemIds.length && !categoryIds.length && !variantIds.length) return false;
  return (
    itemIds.includes(i.menuItemId) ||
    (i.categoryId != null && categoryIds.includes(i.categoryId)) ||
    (i.variantId != null && variantIds.includes(i.variantId))
  );
}

function itemsMatchingGroup(group: ItemGroup, items: CartItem[]): CartItem[] {
  return items.filter((i) => itemMatchesGroup(group, i));
}

function groupTotalQty(group: ItemGroup, items: CartItem[]): number {
  return itemsMatchingGroup(group, items).reduce((s, i) => s + i.quantity, 0);
}

// ── Per-type discount calculators ─────────────────────────────────────────────

/** Value of ONE combo's worth — the single most-expensive unit from each group.
 *  Used when a group/combo % discount is capped to once per order, so it covers
 *  one item per group (the customer's best single combo) instead of every
 *  qualifying item. Luigi 2026-06-07. */
function oneComboValue(groups: ItemGroup[], items: CartItem[]): number {
  // Each group contributes its single best item, but a given cart LINE can only
  // be claimed by ONE group — otherwise two overlapping groups (e.g. both target
  // "Pizzas") would both count the same pizza, double-charging the combo value
  // (audit percentage_combo over-count). Greedily give each group its best still-
  // unclaimed match. Luigi 2026-06-27.
  let total = 0;
  const used = new Set<CartItem>();
  for (const group of groups) {
    const matched = itemsMatchingGroup(group, items).filter((i) => !used.has(i));
    if (!matched.length) continue;
    const best = matched.reduce((a, b) => (a.price >= b.price ? a : b));
    used.add(best);
    total += best.price;
  }
  return total;
}

/** Sum of every qualifying item across all groups — each cart item counted ONCE
 *  even if it matches multiple groups (dedup by identity), so overlapping groups
 *  can't inflate the eligible base (audit percentage_off / percentage_combo
 *  over-count). Luigi 2026-06-27. */
function allGroupsValue(groups: ItemGroup[], items: CartItem[]): number {
  const matched = new Set<CartItem>();
  for (const group of groups) {
    for (const i of itemsMatchingGroup(group, items)) matched.add(i);
  }
  let total = 0;
  for (const i of matched) total += i.subtotal;
  return total;
}

function calcPercentageOff(promo: PromoInput, ctx: ApplyContext): number {
  const rules = getRules(promo);
  const pct = rules.discountPercent ?? 0;
  if (!rules.groups?.length) {
    // Whole-cart %: base excludes promo-excluded lines (gift cards).
    return parseFloat(((pct / 100) * discountableSubtotal(ctx)).toFixed(2));
  }
  // Targeted items. "Once per order" caps the discount to a single item per
  // group (one combo); otherwise it covers every qualifying item.
  const eligible = rules.oncePerOrder
    ? oneComboValue(rules.groups, ctx.items)
    : allGroupsValue(rules.groups, ctx.items);
  return parseFloat(((pct / 100) * eligible).toFixed(2));
}

function calcFreeDelivery(_promo: PromoInput, _ctx: ApplyContext): number {
  return 0; // handled via hasFreeDelivery flag
}

/** Expand cart items into a flat list of per-unit prices. A cart item
 *  with quantity 3 becomes 3 entries at the same per-unit price. Used
 *  by BOGO / Buy-N-Get-Free so we can discount the correct NUMBER of
 *  units when the customer has multiple qualifying pairs. */
type DiscountUnit = { menuItemId: string; price: number; sizedBase?: number; baseNoSize?: number; lineKey?: string };

function expandToUnits(items: CartItem[]): DiscountUnit[] {
  const units: DiscountUnit[] = [];
  for (const it of items) {
    for (let i = 0; i < it.quantity; i++) units.push({ menuItemId: it.menuItemId, price: it.price, sizedBase: it.sizedBase, baseNoSize: it.baseNoSize, lineKey: it.lineKey });
  }
  return units;
}

/** One discounted unit — which cart item, how much came off. `lineKey` (when the
 *  caller supplied one on the CartItem) pins it to the exact cart line so the
 *  cart can show "You saved" on the right line even with duplicate dishes.
 *  Lets the cart itemise a promo that applies more than once (Luigi 2026-06-07). */
export type DiscountLine = { menuItemId: string; amount: number; lineKey?: string };

/** Pick the N units to discount from a pool, given a strategy. The pool is
 *  expanded by quantity so a line item with qty=3 contributes 3 discountable
 *  units. Returns the total discount $ AND the per-unit breakdown. */
/** How much of a freed unit the discount covers (GloriaFood BOGO "extra charges"
 *  parity, Luigi 2026-07-07):
 *   "none"         → the whole unit (base + size + toppings) — the default.
 *   "addons"       → only the sized base; the customer still pays for toppings /
 *                    choices / add-ons on the freed item.
 *   "addons_sizes" → only the un-sized base; the customer pays for the size
 *                    upgrade AND the toppings on the freed item. */
type FreeBasis = "none" | "addons" | "addons_sizes";
function normalizeFreeBasis(v: unknown): FreeBasis {
  return v === "addons" || v === "addons_sizes" ? v : "none";
}
/** The portion of a unit eligible for the free/percentage discount, per the
 *  promo's freeBasis. Falls back to the full price when the caller didn't send
 *  the breakdown (legacy carts) or the base is missing, so behaviour is
 *  unchanged unless a restaurant opts into charging for extras. */
function freeableAmount(u: DiscountUnit, basis: FreeBasis): number {
  if (basis === "addons_sizes") return Math.min(u.price, u.baseNoSize ?? u.price);
  if (basis === "addons") return Math.min(u.price, u.sizedBase ?? u.price);
  return u.price;
}

function discountNUnitsDetailed(
  pool: CartItem[],
  count: number,
  strategy: string,
  cheapestPct: number,
  mostExpensivePct: number,
  freeBasis: FreeBasis = "none",
): { total: number; lines: DiscountLine[] } {
  if (count <= 0 || !pool.length) return { total: 0, lines: [] };
  const units = expandToUnits(pool);
  if (!units.length) return { total: 0, lines: [] };
  const isMostExpensive = strategy === "most_expensive";
  // Selection of WHICH unit is cheapest/priciest stays on the full price (the
  // customer's actual cheapest item); only the freed AMOUNT uses freeBasis.
  units.sort((a, b) => (isMostExpensive ? b.price - a.price : a.price - b.price));
  const pct = isMostExpensive ? mostExpensivePct : cheapestPct;
  const take = Math.min(count, units.length);
  // Total is summed RAW then rounded once (unchanged from the original) so
  // existing discount amounts are byte-for-byte stable; each line is rounded
  // individually for display.
  let rawSum = 0;
  const lines: DiscountLine[] = [];
  for (let i = 0; i < take; i++) {
    const raw = freeableAmount(units[i], freeBasis) * (pct / 100);
    rawSum += raw;
    lines.push({ menuItemId: units[i].menuItemId, amount: parseFloat(raw.toFixed(2)), lineKey: units[i].lineKey });
  }
  return { total: parseFloat(rawSum.toFixed(2)), lines };
}

/** Total-only convenience wrapper — used by callers that don't need the
 *  itemised breakdown. */
function discountNUnits(
  pool: CartItem[],
  count: number,
  strategy: string,
  cheapestPct: number,
  mostExpensivePct: number,
): number {
  return discountNUnitsDetailed(pool, count, strategy, cheapestPct, mostExpensivePct).total;
}

/** @deprecated single-unit helper. Retained for backwards compatibility
 *  with callers that haven't been migrated to {@link discountNUnits}. */
function applyGroupDiscount(
  freePool: CartItem[],
  strategy: string,
  cheapestPct: number,
  mostExpensivePct: number
): number {
  return discountNUnits(freePool, 1, strategy, cheapestPct, mostExpensivePct);
}

function bogoResult(promo: PromoInput, ctx: ApplyContext): { total: number; lines: DiscountLine[] } {
  const EMPTY = { total: 0, lines: [] as DiscountLine[] };
  const rules = getRules(promo);
  const groups = rules.groups ?? [];
  const paidGroup = groups.find(g => g.role === "paid") ?? groups[0];
  const freeGroup = groups.find(g => g.role === "free") ?? groups[groups.length - 1];
  if (!paidGroup || !freeGroup) return EMPTY;
  const paidItems = itemsMatchingGroup(paidGroup, ctx.items);
  if (!paidItems.length) return EMPTY;
  const freeItems = itemsMatchingGroup(freeGroup, ctx.items);
  if (!freeItems.length) return EMPTY;

  // BOGO requires at least 2 qualifying items in the cart — 1 paid
  // + 1 free. When the paid and free groups overlap (same items in
  // both), a SINGLE cart item satisfies both groups and the engine
  // would BOGO-discount itself. Count the unique qualifying line-items'
  // quantities and bail out when the total is < 2.
  // Luigi bug 2026-05-29: BOGO Pizza/Pasta with overlapping drink/salad
  // groups fired on a single drink because both groups matched it.
  const paidIds = new Set(paidItems.map(i => i.menuItemId));
  const freeIds = new Set(freeItems.map(i => i.menuItemId));
  const hasOverlap = [...paidIds].some(id => freeIds.has(id));

  // Compute number of BOGO pairs the cart unlocks.
  // Luigi bug 2026-05-30: BOGO with 4 qualifying items only discounted
  // ONE item — should discount TWO (one per pair).
  //
  //   • Overlapping groups (e.g. "BOGO on any pizza"): a single item
  //     is both paid AND free. Pairs = floor(totalQty / 2).
  //   • Distinct groups (e.g. "Buy pizza, get soda free"): each pair
  //     needs 1 paid + 1 free, so pairs = min(paidQty, freeQty).
  let pairs: number;
  if (hasOverlap) {
    const qualifyingIds = new Set<string>([...paidIds, ...freeIds]);
    const totalQualifyingQty = ctx.items
      .filter((i) => qualifyingIds.has(i.menuItemId))
      .reduce((s, i) => s + i.quantity, 0);
    if (totalQualifyingQty < 2) return EMPTY;
    pairs = Math.floor(totalQualifyingQty / 2);
  } else {
    const paidQty = paidItems.reduce((s, i) => s + i.quantity, 0);
    const freeQty = freeItems.reduce((s, i) => s + i.quantity, 0);
    pairs = Math.min(paidQty, freeQty);
    if (pairs < 1) return EMPTY;
  }

  // "Only allowed once per order" (Luigi 2026-06-07): when the owner checks
  // this box, the deal applies a SINGLE time no matter how many qualifying
  // pairs are in the cart. Unchecked (default) → it repeats per pair.
  if (rules.oncePerOrder) pairs = Math.min(pairs, 1);

  // Which item(s) get discounted? BOGO means "the cheaper (or, for the
  // most_expensive strategy, the pricier) of the QUALIFYING items is free."
  // The discount pool is therefore the union of BOTH groups' matched items —
  // not the free group alone. itemsMatchingGroup returns the same CartItem
  // references out of ctx.items, so a Set dedupes overlap (and items that
  // satisfy both groups) by identity.
  //
  // Previously the pool was `freeItems` only, so the FREE-group pick was
  // discounted regardless of price: a customer who put the pricier item in the
  // free group got the EXPENSIVE item free under a "cheapest" promo, over-
  // discounting the restaurant. Luigi 2026-06-07 ("it gave the more expensive
  // item free; it's set to give the cheaper item free"). Reward-style "buy a
  // main, get the cheapest side free" is unaffected when the main is the
  // priciest item (it never wins "cheapest"); a true designated-freebie reward
  // belongs to buy_n_get_free.
  const pool = [...new Set<CartItem>([...paidItems, ...freeItems])];

  // "Fixed discount percentage" strategy: the discounted unit gets the typed
  // discountPercent, NOT a free (100%) item. Map it onto the cheapest-ordering
  // path feeding discountPercent as the percent — otherwise the engine fell
  // through to cheapestDiscount ?? 100 and silently gave the item away free
  // (audit B1, Luigi 2026-06-26).
  const strat = rules.discountStrategy ?? "cheapest";
  const fixedPct = strat === "fixed_percent";
  return discountNUnitsDetailed(
    pool,
    pairs,
    fixedPct ? "cheapest" : strat,
    fixedPct ? (rules.discountPercent ?? 0) : (rules.cheapestDiscount ?? 100),
    rules.mostExpensiveDiscount ?? 100,
    // "No extra charges" (default) / "Charge extra for Choices/Add-ons" /
    // "…& Sizes" — free the whole unit, the sized base, or the un-sized base.
    normalizeFreeBasis((rules as { freeItemExtraChargeMode?: unknown }).freeItemExtraChargeMode),
  );
}

function calcBogo(promo: PromoInput, ctx: ApplyContext): number {
  return bogoResult(promo, ctx).total;
}

function buyNGetFreeResult(promo: PromoInput, ctx: ApplyContext): { total: number; lines: DiscountLine[] } {
  const EMPTY = { total: 0, lines: [] as DiscountLine[] };
  const rules = getRules(promo);
  const groups = rules.groups ?? [];
  const paidGroups = groups.filter(g => g.role === "paid" || g.role === "required");
  const freeGroup = groups.find(g => g.role === "free");
  if (!freeGroup) return EMPTY;
  const freeItems = itemsMatchingGroup(freeGroup, ctx.items);
  if (!freeItems.length) return EMPTY;
  const freeIds = new Set(freeItems.map((i) => i.menuItemId));
  // Each paid group has a minCount (defaults to 1). The promo unlocks
  // floor(actualQty / need) "sets" per paid group; the bottleneck group caps the
  // multiplier. When a paid group OVERLAPS the free group (the same items satisfy
  // both, e.g. "buy 1 pizza get 1 pizza free"), each set must also spare a unit
  // to be freed, so it needs need+1 units — otherwise the WHOLE qualifying
  // quantity went free (audit overlap bug; mirrors BOGO's guard). Luigi 2026-06-27.
  let multiplier = Infinity;
  for (const pg of paidGroups) {
    const need = pg.minCount ?? 1;
    if (need < 1) continue;
    const pgItems = itemsMatchingGroup(pg, ctx.items);
    const have = pgItems.reduce((s, i) => s + i.quantity, 0);
    const overlaps = pgItems.some((i) => freeIds.has(i.menuItemId));
    const per = overlaps ? need + 1 : need;
    if (have < per) return EMPTY;
    multiplier = Math.min(multiplier, Math.floor(have / per));
  }
  if (!Number.isFinite(multiplier) || multiplier < 1) {
    // No paid-group gating at all — fall back to single application.
    multiplier = 1;
  }
  // "Only allowed once per order" caps the freebie to a single application.
  if (rules.oncePerOrder) multiplier = Math.min(multiplier, 1);
  // Honor the "Fixed discount percentage" strategy (see bogoResult) — otherwise
  // discountPercent was discarded and the freebie went 100% off (audit B1).
  const strat = rules.discountStrategy ?? "cheapest";
  const fixedPct = strat === "fixed_percent";
  const effStrategy = fixedPct ? "cheapest" : strat;
  const cheapPct = fixedPct ? (rules.discountPercent ?? 0) : (rules.cheapestDiscount ?? 100);
  // Default 100% (free) like BOGO — was 0%, so the "most expensive item free"
  // strategy silently discounted nothing (audit dead#2). Luigi 2026-06-27.
  const expPct = rules.mostExpensiveDiscount ?? 100;
  // Customer-CHOSEN freebies first (wizard-tagged "Free with promo:" lines,
  // same rule free_item / free_dish_meal already follow): an explicit pick
  // must never be displaced by a cheaper eligible item that enters the cart
  // later — Luigi 2026-07-03: the chosen $25 pizza lost its discount to a
  // $9.99 pizza added afterwards. The configured strategy (cheapest / most
  // expensive) only decides among UNTAGGED candidates.
  // "Extra charges" mode (GloriaFood parity): free the whole unit / the sized
  // base / the un-sized base of each freed item. Luigi 2026-07-07.
  const freeBasis = normalizeFreeBasis((rules as { freeItemExtraChargeMode?: unknown }).freeItemExtraChargeMode);
  const taggedPool = freeItems.filter((i) => i.isFreebie);
  const untaggedPool = freeItems.filter((i) => !i.isFreebie);
  const taggedUnits = taggedPool.reduce((s, i) => s + i.quantity, 0);
  const takeTagged = Math.min(multiplier, taggedUnits);
  const fromTagged = takeTagged > 0
    ? discountNUnitsDetailed(taggedPool, takeTagged, effStrategy, cheapPct, expPct, freeBasis)
    : { total: 0, lines: [] as DiscountLine[] };
  const remainder = multiplier - takeTagged;
  const fromUntagged = remainder > 0
    ? discountNUnitsDetailed(untaggedPool, remainder, effStrategy, cheapPct, expPct, freeBasis)
    : { total: 0, lines: [] as DiscountLine[] };
  return {
    total: parseFloat((fromTagged.total + fromUntagged.total).toFixed(2)),
    lines: [...fromTagged.lines, ...fromUntagged.lines],
  };
}

function calcBuyNGetFree(promo: PromoInput, ctx: ApplyContext): number {
  return buyNGetFreeResult(promo, ctx).total;
}

/** DISPLAY-ONLY per-item discount breakdown so the cart can show WHICH dishes a
 *  promo discounted (GloriaFood-style — Fabrizio). NEVER used for the charge
 *  (calcDiscount is the source of truth); this only itemises for the UI, so
 *  extending it can't change any total. Whole-cart promos (fixed_cart,
 *  payment_reward, free_delivery, group-less percentage_off) return [] — there's
 *  nothing dish-specific to show. Luigi 2026-06-26. */
function promoBreakdown(promo: PromoInput, ctx: ApplyContext): DiscountLine[] {
  switch (promo.promotionType) {
    case "bogo":           return bogoResult(promo, ctx).lines;
    case "buy_n_get_free": return buyNGetFreeResult(promo, ctx).lines;
    case "percentage_off":
    case "percentage_combo": {
      // Per-matched-item % discount, one line per qualifying dish. No groups →
      // whole-cart % → nothing dish-specific to show.
      const rules = getRules(promo);
      const groups = rules.groups ?? [];
      if (!groups.length) return [];
      const pct = rules.discountPercent ?? 0;
      if (pct <= 0) return [];
      // "Once per order" → the discount covers ONE unit per group (the single
      // most expensive match — mirrors oneComboValue exactly). Emit THOSE
      // lines instead of [] so the cart still names which dish was discounted
      // — Fabrizio cmqtmfp2n follow-up (2026-07-02): with no lines the cart
      // showed only "20% ASPORTO −1,20 €" and the customer couldn't tell the
      // €102 cart was discounted on a single 6 € item.
      if (rules.oncePerOrder) {
        const lines: DiscountLine[] = [];
        const used = new Set<CartItem>();
        for (const g of groups) {
          const matched = itemsMatchingGroup(g, ctx.items).filter((i) => !used.has(i));
          if (!matched.length) continue;
          const best = matched.reduce((a, b) => (a.price >= b.price ? a : b));
          used.add(best);
          lines.push({ menuItemId: best.menuItemId, amount: parseFloat(((pct / 100) * best.price).toFixed(2)), lineKey: best.lineKey });
        }
        return lines;
      }
      const lines: DiscountLine[] = [];
      // Dedup per CART LINE (lineKey) not per dish, so the same dish on two
      // separate lines each gets its own "You saved"; a single line matching
      // two groups still dedups. Falls back to menuItemId when no lineKey.
      const seen = new Set<string>();
      for (const g of groups) {
        for (const it of itemsMatchingGroup(g, ctx.items)) {
          const dedupKey = it.lineKey ?? it.menuItemId;
          if (seen.has(dedupKey)) continue;
          seen.add(dedupKey);
          lines.push({ menuItemId: it.menuItemId, amount: parseFloat(((pct / 100) * it.subtotal).toFixed(2)), lineKey: it.lineKey });
        }
      }
      return lines;
    }
    case "free_item": {
      // One line for the freed dish (claimed freebie, else cheapest eligible) —
      // matches calcFreeItem so the cart names the actual discounted item.
      const rules = getRules(promo);
      const freeGroup = rules.groups?.find((g) => g.role === "free") ?? rules.groups?.[0];
      if (!freeGroup) return [];
      const eligible = itemsMatchingGroup(freeGroup, ctx.items);
      if (!eligible.length) return [];
      const freebie = eligible.find((i) => i.isFreebie) ?? [...eligible].sort((a, b) => a.price - b.price)[0];
      return [{ menuItemId: freebie.menuItemId, amount: parseFloat(freebie.price.toFixed(2)), lineKey: freebie.lineKey }];
    }
    case "free_dish_meal": {
      // One line for the freed dish (cheapest free-group item × discount%) so the
      // cart shows WHICH dish — and at the real (possibly partial) amount.
      const rules = getRules(promo);
      const freeGroup = rules.groups?.find((g) => g.role === "free");
      if (!freeGroup) return [];
      const freeItems = itemsMatchingGroup(freeGroup, ctx.items);
      if (!freeItems.length) return [];
      const pct = rules.discountPercent ?? 100;
      const cheapest = [...freeItems].sort((a, b) => a.price - b.price)[0];
      return [{ menuItemId: cheapest.menuItemId, amount: parseFloat((cheapest.price * (pct / 100)).toFixed(2)), lineKey: cheapest.lineKey }];
    }
    default:               return [];
  }
}

function calcFixedCart(promo: PromoInput, ctx: ApplyContext): number {
  const rules = getRules(promo);
  const amount = rules.discountAmount ?? 0;
  // Capped at the DISCOUNTABLE subtotal so a $10 coupon can't zero out a $10
  // gift-card line (free store-credit minting). Luigi 2026-07-01.
  return Math.min(amount, discountableSubtotal(ctx));
}

function calcPaymentReward(promo: PromoInput, ctx: ApplyContext): number {
  const rules = getRules(promo);
  const pm = rules.paymentMethod;
  // Base excludes promo-excluded lines (gift cards) — same as every other
  // whole-cart discount. Luigi 2026-07-02.
  // Normalize the legacy "card" value to the canonical "online_card" slug.
  const ctxPm = ctx.paymentMethod === "card" ? "online_card" : ctx.paymentMethod;
  if (pm && pm !== "any" && ctxPm && ctxPm !== pm) return 0;
  return parseFloat(((( rules.discountPercent ?? 0) / 100) * discountableSubtotal(ctx)).toFixed(2));
}

function calcFreeItem(promo: PromoInput, ctx: ApplyContext): number {
  const rules = getRules(promo);
  const freeGroup = rules.groups?.find(g => g.role === "free") ?? rules.groups?.[0];
  if (!freeGroup) return 0;
  const eligible = itemsMatchingGroup(freeGroup, ctx.items);
  if (!eligible.length) return 0;
  // Free the CLAIMED freebie if the customer picked one (tagged isFreebie),
  // otherwise the cheapest eligible unit. Before, it ALWAYS freed the cheapest
  // category match, so a customer who claimed a pricier freebie overpaid (audit).
  const claimed = eligible.find((i) => i.isFreebie);
  const freedItem = claimed ?? [...eligible].sort((a, b) => a.price - b.price)[0];
  // The freed unit must NOT count toward unlocking its own trigger — otherwise a
  // customer reached the threshold by adding only the free item and walked away
  // with a $0 order (audit self-bootstrap). Compare the trigger against the cart
  // MINUS the freed unit's FULL price (unaffected by the extra-charges mode).
  // Trigger judged on the DISCOUNTABLE subtotal — a gift-card line can't unlock
  // the free item. Luigi 2026-06-27 / 2026-07-02.
  const trigger = rules.triggerAmount ?? 0;
  if (trigger > 0 && discountableSubtotal(ctx) - freedItem.price < trigger) return 0;
  // "Extra charges" mode (GloriaFood parity, Luigi 2026-07-07): free the whole
  // item / just the sized base (charge toppings) / just the base (charge size +
  // toppings). Absent breakdown → full price (unchanged default).
  return freeableAmount(freedItem, normalizeFreeBasis((rules as { freeItemExtraChargeMode?: unknown }).freeItemExtraChargeMode));
}

/** A claiming promo's discount PLUS the exact cart units it prices. `claimed`
 *  has one entry per physical unit the promo owns (a line of qty 2 both folded
 *  into a bundle appears twice), referencing the CartItem it came from — so the
 *  resolver can remove those units from the pool the OTHER item promos see and
 *  stop a second promo discounting the same unit. Empty when the promo yields no
 *  benefit (it then owns nothing). Luigi 2026-07-07. */
type ClaimResult = { total: number; claimed: CartItem[] };

/** One formed bundle: the units that fill it + the per-slot speciality fee it
 *  carries. `saved` = (Σ its unit prices) − bundlePrice − its fee. Surfaced so
 *  the cart can show each repeated bundle as its own "2 pizzas $30 · saved X"
 *  line with its contents (GloriaFood parity — Luigi 2026-07-07). */
export type BundleInstance = { units: CartItem[]; fee: number; itemsTotal: number; saved: number };

function mealBundleInstances(promo: PromoInput, ctx: ApplyContext): BundleInstance[] {
  const rules = getRules(promo);
  const groups = rules.groups ?? [];
  if (!groups.length) return [];
  const isSpeciality = promo.promotionType === "meal_bundle_speciality";
  const bundlePrice = rules.bundlePrice ?? 0;
  const onceOnly = !!rules.oncePerOrder;

  // Expand the cart to individual UNITS so each physical unit fills at most ONE
  // slot — overlapping slots (e.g. two "Pizza" groups) must not both claim the
  // same pizza, which double-counted the discount on loose/freeform carts
  // (audit). Each unit carries its per-unit price + a reference to its cart item
  // for group matching. Luigi 2026-06-27.
  const units: { price: number; item: CartItem; used: boolean }[] = [];
  for (const i of ctx.items) {
    const unit = i.quantity > 0 ? i.subtotal / i.quantity : i.subtotal;
    for (let q = 0; q < i.quantity; q++) units.push({ price: unit, item: i, used: false });
  }

  const instances: BundleInstance[] = [];
  // Form as many COMPLETE bundles as the cart supports — 4 eligible pizzas fill
  // a "2 for $30" bundle TWICE (GloriaFood parity, Luigi 2026-07-07). Each pass
  // fills every group (min..cap priciest still-unclaimed units); stop when a
  // group can't supply its min, or after one pass when the promo is once-per-order.
  while (true) {
    // Tentatively reserve one bundle's worth across all groups. minCount clamped
    // to >=1 so a slot saved with min 0 can't auto-fold priciest units for free.
    const passUnits: { price: number; item: CartItem; used: boolean }[] = [];
    let feeTotal = 0;
    let canForm = true;
    for (const group of groups) {
      const min = Math.max(1, group.minCount ?? 1);
      const cap = Math.max(min, group.maxCount ?? min);
      const avail = units
        .filter((u) => !u.used && itemMatchesGroup(group, u.item))
        .sort((a, b) => b.price - a.price);
      if (avail.length < min) { canForm = false; break; }
      const take = avail.slice(0, cap);
      for (const u of take) u.used = true; // reserve so overlapping slots don't reuse a unit
      passUnits.push(...take);
      if (isSpeciality) feeTotal += Math.max(0, Number(group.extraFee ?? 0)) * take.length;
    }
    if (!canForm) {
      for (const u of passUnits) u.used = false; // roll back the incomplete pass
      break;
    }
    const itemsTotal = passUnits.reduce((s, u) => s + u.price, 0);
    const saved = parseFloat((itemsTotal - bundlePrice - feeTotal).toFixed(2));
    // A bundle only APPLIES when the items cost MORE than the bundle price — else
    // it would charge the customer extra (2 cheap pizzas for $30 > their real
    // price). Since units are taken priciest-first, once a pass isn't beneficial
    // no later pass will be, so stop AND leave those units unclaimed for other
    // promos (don't lock them into a $0-benefit bundle). Luigi 2026-07-07.
    if (saved <= 0) {
      for (const u of passUnits) u.used = false;
      break;
    }
    instances.push({
      units: passUnits.map((u) => u.item),
      fee: feeTotal,
      itemsTotal: parseFloat(itemsTotal.toFixed(2)),
      saved,
    });
    if (onceOnly) break;
  }
  return instances;
}

function mealBundleResult(promo: PromoInput, ctx: ApplyContext): ClaimResult {
  const instances = mealBundleInstances(promo, ctx);
  if (!instances.length) return { total: 0, claimed: [] };
  const total = parseFloat(instances.reduce((s, b) => s + b.saved, 0).toFixed(2));
  // A bundle that saves nothing OWNS nothing — leave the units for other promos.
  if (total <= 0) return { total: 0, claimed: [] };
  const claimed: CartItem[] = [];
  for (const b of instances) claimed.push(...b.units);
  return { total, claimed };
}

function calcMealBundle(promo: PromoInput, ctx: ApplyContext): number {
  return mealBundleResult(promo, ctx).total;
}

function calcFreeDishMeal(promo: PromoInput, ctx: ApplyContext): number {
  const rules = getRules(promo);
  const groups = rules.groups ?? [];
  const triggerGroups = groups.filter(g => g.role === "trigger");
  const freeGroup = groups.find(g => g.role === "free");
  if (!freeGroup) return 0;
  // A free dish needs an ACTUAL meal too — at least one trigger group must exist.
  if (!triggerGroups.length) return 0;
  const freeItems = itemsMatchingGroup(freeGroup, ctx.items);
  if (!freeItems.length) return 0;
  // All trigger groups satisfied. When a trigger group OVERLAPS the free group
  // (the same dish can satisfy both), require 2 units — one to satisfy the meal,
  // one to be freed — so a single dish can't free itself (mirrors BOGO's overlap
  // guard). Luigi 2026-06-27.
  const freeIds = new Set(freeItems.map((i) => i.menuItemId));
  for (const tg of triggerGroups) {
    const tgItems = itemsMatchingGroup(tg, ctx.items);
    const overlaps = tgItems.some((i) => freeIds.has(i.menuItemId));
    const need = overlaps ? 2 : 1;
    if (tgItems.reduce((s, i) => s + i.quantity, 0) < need) return 0;
  }
  const pct = rules.discountPercent ?? 100;
  const sorted = [...freeItems].sort((a, b) => a.price - b.price);
  // "Extra charges" mode (GloriaFood parity, Luigi 2026-07-07) — free the whole
  // dish / sized base / base, same as free_item & BOGO.
  const basis = normalizeFreeBasis((rules as { freeItemExtraChargeMode?: unknown }).freeItemExtraChargeMode);
  return parseFloat((freeableAmount(sorted[0], basis) * (pct / 100)).toFixed(2));
}

/** Per-unit price of a cart line (its subtotal spread over its quantity). */
function perUnitPrice(i: CartItem): number {
  return i.quantity > 0 ? i.subtotal / i.quantity : i.price;
}

/** Claim one unit from each group — the combo the customer formed. Greedily
 *  picks the priciest still-available match per group (a line can supply up to
 *  its quantity, so two "pizza" groups can each take a unit from one qty-2 line).
 *  Shared by fixed_combo (owns the units its flat discount rewards). */
function claimOnePerGroup(groups: ItemGroup[], items: CartItem[]): CartItem[] {
  const takenPerLine = new Map<CartItem, number>();
  for (const group of groups) {
    const match = itemsMatchingGroup(group, items)
      .filter((i) => (takenPerLine.get(i) ?? 0) < i.quantity)
      .sort((a, b) => b.price - a.price)[0];
    if (match) takenPerLine.set(match, (takenPerLine.get(match) ?? 0) + 1);
  }
  const claimed: CartItem[] = [];
  for (const [line, n] of takenPerLine) for (let k = 0; k < n; k++) claimed.push(line);
  return claimed;
}

function fixedComboResult(promo: PromoInput, ctx: ApplyContext): ClaimResult {
  const rules = getRules(promo);
  const groups = rules.groups ?? [];
  // A combo with NO groups is a misconfiguration — must NOT behave like an
  // unconditional whole-cart discount (audit). Luigi 2026-06-27.
  if (!groups.length) return { total: 0, claimed: [] };
  for (const group of groups) {
    if (groupTotalQty(group, ctx.items) < 1) return { total: 0, claimed: [] };
  }
  // The flat discount is capped at the value of the units the combo OWNS (one per
  // group), NOT the whole cart — otherwise a $60 combo on $25 of claimed items ate
  // $35 out of unclaimed units that a later item promo also discounts (double-dip;
  // adversarial Defect 3, Luigi 2026-07-07). discountableSubtotal stays as a
  // second, gift-card-aware ceiling.
  const claimed = claimOnePerGroup(groups, ctx.items);
  const claimedValue = parseFloat(claimed.reduce((s, u) => s + perUnitPrice(u), 0).toFixed(2));
  const total = Math.min(rules.discountAmount ?? 0, discountableSubtotal(ctx), claimedValue);
  return { total, claimed: total > 0 ? claimed : [] };
}

function calcFixedCombo(promo: PromoInput, ctx: ApplyContext): number {
  return fixedComboResult(promo, ctx).total;
}

function percentageComboResult(promo: PromoInput, ctx: ApplyContext): ClaimResult {
  const rules = getRules(promo);
  const groups = rules.groups ?? [];
  if (!groups.length) return { total: 0, claimed: [] }; // no groups = misconfig, never whole-cart
  for (const group of groups) {
    if (groupTotalQty(group, ctx.items) < 1) return { total: 0, claimed: [] };
  }
  // "Once per order" → discount ONE combo (one item per group, the customer's
  // best). Unchecked (default) → discount every qualifying item, i.e. all the
  // combos the cart forms. Luigi 2026-06-07: "buy 4 items — all 4 or just one
  // 2-item combo? — this is what that option adjusts."
  // The claimed units MIRROR the eligible base exactly (oneComboValue picks one
  // best unit per group; allGroupsValue takes every qualifying unit) so the total
  // stays byte-for-byte identical to the pre-ownership behaviour.
  const claimed: CartItem[] = [];
  let eligible = 0;
  if (rules.oncePerOrder) {
    const used = new Set<CartItem>();
    for (const group of groups) {
      const matched = itemsMatchingGroup(group, ctx.items).filter((i) => !used.has(i));
      if (!matched.length) continue;
      const best = matched.reduce((a, b) => (a.price >= b.price ? a : b));
      used.add(best);
      eligible += best.price;
      claimed.push(best); // one unit of the best line
    }
  } else {
    const matched = new Set<CartItem>();
    for (const group of groups) for (const i of itemsMatchingGroup(group, ctx.items)) matched.add(i);
    for (const i of matched) {
      eligible += i.subtotal;
      for (let k = 0; k < i.quantity; k++) claimed.push(i); // every unit of every matching line
    }
  }
  const total = parseFloat((((rules.discountPercent ?? 0) / 100) * eligible).toFixed(2));
  return { total, claimed: total > 0 ? claimed : [] };
}

function calcPercentageCombo(promo: PromoInput, ctx: ApplyContext): number {
  return percentageComboResult(promo, ctx).total;
}

function calcMealBundleSpeciality(promo: PromoInput, ctx: ApplyContext): number {
  // calcMealBundle is speciality-aware (it reads promo.promotionType and
  // subtracts per-slot extraFee from the savings). Luigi 2026-06-27.
  return calcMealBundle(promo, ctx);
}

export function calcDiscount(promo: PromoInput, ctx: ApplyContext): number {
  switch (promo.promotionType) {
    case "percentage_off":   return calcPercentageOff(promo, ctx);
    case "free_delivery":    return calcFreeDelivery(promo, ctx);
    case "bogo":             return calcBogo(promo, ctx);
    case "buy_n_get_free":   return calcBuyNGetFree(promo, ctx);
    case "fixed_cart":       return calcFixedCart(promo, ctx);
    case "payment_reward":   return calcPaymentReward(promo, ctx);
    case "free_item":        return calcFreeItem(promo, ctx);
    case "meal_bundle":      return calcMealBundle(promo, ctx);
    case "free_dish_meal":   return calcFreeDishMeal(promo, ctx);
    case "fixed_combo":      return calcFixedCombo(promo, ctx);
    case "percentage_combo": return calcPercentageCombo(promo, ctx);
    case "meal_bundle_speciality": return calcMealBundleSpeciality(promo, ctx);
    case "reward_credit":    return 0; // grants store credit at fulfillment, no cart discount
    default:                 return 0;
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

/** An exclusive promo that qualified but was set aside because a bigger
 *  exclusive won (only one exclusive applies per order). Surfaced so the
 *  customer can be told WHY a deal they expected didn't apply. */
/** A promo that QUALIFIED (would have discounted) but was not applied because a
 *  non-stackable exclusive deal is active. `wasExclusive` distinguishes a
 *  bumped exclusive (another exclusive won) from a standard deal dropped because
 *  an exclusive is present. `winnerName` is the deal that's keeping it out. */
export type BlockedPromo = { promoId: string; name: string; discount: number; winnerName: string; wasExclusive: boolean; couponCode?: string };
/** @deprecated kept as a name alias — the exclusive-vs-exclusive subset. */
export type BumpedExclusive = BlockedPromo;

export type ResolvedPromotions = {
  results: PromoResult[];
  /** Every promo that qualified but was blocked by the winning exclusive —
   *  both bumped exclusives and dropped standards. Drives the cart's
   *  "can't combine / remove to use this instead" UX. Empty unless an exclusive
   *  is active alongside other qualifying deals. */
  blockedPromos: BlockedPromo[];
};

// ── Cross-promo unit ownership (Luigi 2026-07-07) ─────────────────────────────
// A bundle/combo OWNS the physical units it prices — another item-targeting promo
// (BOGO, free-item, grouped %-off) must not discount the SAME unit a second time.
// A "2 pizzas for $30" bundle + a BOGO on the same 2 pizzas used to stack and net
// the pair below the $30 bundle floor (each promo's calc ran over the same
// untouched cart with no shared unit accounting). Bundles/combos now CLAIM their
// units first; the other item promos see only what's left. Whole-cart /
// order-level promos (fixed_cart, payment_reward, group-less %-off, free_delivery,
// reward_credit) discount the cart as a whole, not specific units, so they're
// unaffected and keep running over the full original cart.
const CLAIMING_TYPES = new Set(["meal_bundle", "meal_bundle_speciality", "fixed_combo", "percentage_combo"]);
const ITEM_TYPES = new Set(["bogo", "buy_n_get_free", "free_item", "free_dish_meal"]);

/** Which resolution lane a promo runs in: "claim" (bundle/combo — owns its units,
 *  goes first), "item" (targets specific dishes — sees only unclaimed units), or
 *  "order" (whole-cart / no specific units — unchanged, runs on the full cart). */
function promoLane(p: PromoInput): "claim" | "item" | "order" {
  if (CLAIMING_TYPES.has(p.promotionType)) return "claim";
  if (ITEM_TYPES.has(p.promotionType)) return "item";
  // percentage_off is item-targeted only when it carries groups; otherwise it's a
  // whole-cart discount and must NOT shrink to the post-claim pool.
  if (p.promotionType === "percentage_off") return (getRules(p).groups?.length ?? 0) > 0 ? "item" : "order";
  return "order";
}

/** A claiming promo's discount + the units it owns, so the resolver can pull them
 *  out of the pool. Non-claiming types report no claimed units. */
function claimingResult(promo: PromoInput, ctx: ApplyContext): ClaimResult {
  switch (promo.promotionType) {
    case "meal_bundle":
    case "meal_bundle_speciality": return mealBundleResult(promo, ctx);
    case "fixed_combo":            return fixedComboResult(promo, ctx);
    case "percentage_combo":       return percentageComboResult(promo, ctx);
    default:                       return { total: calcDiscount(promo, ctx), claimed: [] };
  }
}

/** Return a copy of `items` with the claimed UNITS removed (identity-matched to
 *  the source lines). A line loses one unit of quantity per claimed entry; a line
 *  fully claimed drops out. Per-unit price/base fields are preserved so a partly
 *  claimed line still prices its remaining units correctly for the next promo. */
function removeClaimedUnits(items: CartItem[], claimed: CartItem[]): CartItem[] {
  if (!claimed.length) return items;
  const counts = new Map<CartItem, number>();
  for (const u of claimed) counts.set(u, (counts.get(u) ?? 0) + 1);
  const out: CartItem[] = [];
  for (const it of items) {
    const n = counts.get(it) ?? 0;
    if (n <= 0) { out.push(it); continue; }
    const newQty = it.quantity - n;
    if (newQty <= 0) continue; // every unit of this line was claimed
    const perUnit = it.quantity > 0 ? it.subtotal / it.quantity : it.price;
    out.push({ ...it, quantity: newQty, subtotal: parseFloat((perUnit * newQty).toFixed(2)) });
  }
  return out;
}

export function resolvePromotions(promos: PromoInput[], ctx: ApplyContext): ResolvedPromotions {
  // Split coupon vs auto
  const couponPromos = promos.filter(p => p.couponCode && !p.autoApply);
  const autoPromos   = promos.filter(p => p.autoApply || !p.couponCode);

  const triggered: PromoInput[] = [];

  if (ctx.couponCode) {
    const matched = couponPromos.find(p =>
      p.couponCode?.toUpperCase() === ctx.couponCode?.toUpperCase()
    );
    if (matched && isEligible(matched, ctx)) triggered.push(matched);
  }

  for (const p of autoPromos) {
    if (isEligible(p, ctx)) triggered.push(p);
  }

  if (!triggered.length) return { results: [], blockedPromos: [] };

  // Stacking resolution. reward_credit is ALWAYS a master (it gives no cart
  // discount — it grants store credit at fulfillment — so it must never occupy
  // an exclusive slot or be blocked by one, regardless of its stored
  // stackingRule). Luigi 2026-06-27.
  const isRewardCredit = (p: PromoInput) => p.promotionType === "reward_credit";
  const masters    = triggered.filter(p => p.stackingRule === "master" || isRewardCredit(p));
  const standards  = triggered.filter(p => p.stackingRule === "standard" && !isRewardCredit(p));
  // A promo's REAL value for stacking decisions. free_delivery has no cart
  // discount (calcDiscount = 0) but is worth the delivery fee on a delivery
  // order — so it's scored at the fee (audit B10). On a non-delivery order or a
  // $0-fee zone it's worth $0. Other types use calcDiscount.
  const effectiveValue = (p: PromoInput): number =>
    p.promotionType === "free_delivery" && canonicalOrderType(ctx.orderType) === "delivery"
      ? Math.max(calcDiscount(p, ctx), ctx.deliveryFee ?? 0)
      : calcDiscount(p, ctx);

  // Only exclusives that actually deliver a benefit can occupy the single
  // exclusive slot. A $0 exclusive — "10% off ALL PIZZAS" with no pizzas, OR a
  // free_delivery on a $0-fee zone — must NOT block a standard deal that would
  // discount (audit; an inert exclusive silently suppressed a real deal).
  // Luigi 2026-06-08 / 2026-06-27.
  const exclusives = triggered.filter(
    p => p.stackingRule === "exclusive" && effectiveValue(p) > 0,
  );

  // GloriaFood parity (Luigi 2026-07-07): a Standard the customer already has is
  // KEPT by default — an Exclusive NEVER silently overrides it. (Entering a 15%
  // exclusive code used to drop a 30% standard: a downgrade.) When both are
  // present we keep the Standards (+ Masters) and hand each qualifying Exclusive
  // back as a *switchable alternative* (blockedPromos, wasExclusive) so the cart
  // can say "can't be combined — use this instead". The customer switches by
  // suppressing the standards (client → suppressedPromoIds), which re-resolves
  // into the no-standard branch below where the exclusive then applies.
  const beneficialStandards = standards.filter(p => effectiveValue(p) > 0);

  let active: PromoInput[];
  const blockedPromos: BlockedPromo[] = [];
  if (exclusives.length > 0 && beneficialStandards.length === 0) {
    // No Standard to clash with → the best Exclusive applies alongside Masters
    // (exclusive-alone, exclusive + free-delivery master, exclusive-vs-exclusive).
    // The best exclusive wins its slot; other exclusives are switchable.
    const best = exclusives.reduce((a, b) =>
      effectiveValue(a) >= effectiveValue(b) ? a : b
    );
    active = [best, ...masters];
    for (const p of triggered) {
      // reward_credit is always a master benefit (0 cart discount) — never blocked.
      if (p.id === best.id || p.stackingRule === "master" || isRewardCredit(p)) continue;
      if (effectiveValue(p) > 0) {
        blockedPromos.push({ promoId: p.id, name: p.name, discount: calcDiscount(p, ctx), winnerName: best.name, wasExclusive: p.stackingRule === "exclusive", couponCode: p.couponCode ?? undefined });
      }
    }
  } else {
    // Keep the stackable Standards (+ Masters). Any qualifying Exclusive is
    // offered as a switchable alternative rather than auto-applied — so it can
    // never silently replace (and possibly shrink) the customer's current deal.
    active = [...standards, ...masters];
    const keptName = beneficialStandards[0]?.name ?? masters[0]?.name ?? "";
    for (const p of exclusives) {
      blockedPromos.push({ promoId: p.id, name: p.name, discount: calcDiscount(p, ctx), winnerName: keptName, wasExclusive: true, couponCode: p.couponCode ?? undefined });
    }
  }

  // Resolve each active promo's discount with cross-promo unit ownership. The
  // discount + the ctx it was measured against are stored so the itemisation
  // breakdown below reflects the SAME (possibly reduced) cart.
  const computed = new Map<string, { discount: number; ctxUsed: ApplyContext }>();
  const uniqueActive = active.filter((p, i) => active.findIndex(q => q.id === p.id) === i);

  // Phase 1 — claiming promos (bundle/combo) take their units, biggest deal
  // first, off a shrinking pool. GLORIAFOOD TIE-BREAK KNOB (Luigi 2026-07-07):
  // claiming promos run BEFORE the other item promos, so a bundle KEEPS its items
  // even when a BOGO alone would beat the bundle price — "bundle owns its items".
  // To switch to "the customer gets the cheaper of the two", merge the claim +
  // item lanes into one list sorted by descending discount instead of claim-first.
  let workingItems = ctx.items;
  const claimLane = uniqueActive
    .filter(p => promoLane(p) === "claim")
    .map(p => ({ p, standalone: claimingResult(p, ctx).total }))
    .sort((a, b) => b.standalone - a.standalone);
  for (const { p } of claimLane) {
    const ctxUsed = workingItems === ctx.items ? ctx : { ...ctx, items: workingItems };
    const { total, claimed } = claimingResult(p, ctxUsed);
    computed.set(p.id, { discount: total, ctxUsed });
    if (total > 0 && claimed.length) workingItems = removeClaimedUnits(workingItems, claimed);
  }

  // Phase 2 — remaining item-targeted promos see ONLY the unclaimed units (so a
  // BOGO can't re-free a bundled pizza). Keep the original subtotal so spend-based
  // triggers (free_item "spend $40") aren't perturbed by the bundling.
  const itemCtx = workingItems === ctx.items ? ctx : { ...ctx, items: workingItems };
  for (const p of uniqueActive) {
    if (promoLane(p) !== "item") continue;
    computed.set(p.id, { discount: calcDiscount(p, itemCtx), ctxUsed: itemCtx });
  }

  // Phase 3 — whole-cart / order-level promos (group-less %-off, fixed_cart,
  // payment_reward) discount the REMAINDER after bundles/combos took their units,
  // NOT the full cart. Otherwise a "20% off everything" coupon re-discounts pizzas
  // already priced by a "2 for $30" bundle and pushes the pair under its $30 floor
  // (adversarial Defect 1, Luigi 2026-07-07). With no claiming promo the pool is
  // unchanged, so carts without a bundle behave exactly as before. free_delivery /
  // reward_credit don't read the subtotal, so the reduced ctx is a no-op for them.
  const orderSubtotal = workingItems === ctx.items
    ? ctx.subtotal
    : parseFloat(workingItems.reduce((s, i) => s + i.subtotal, 0).toFixed(2));
  const orderCtx = workingItems === ctx.items ? ctx : { ...ctx, items: workingItems, subtotal: orderSubtotal };
  for (const p of uniqueActive) {
    if (promoLane(p) !== "order") continue;
    computed.set(p.id, { discount: calcDiscount(p, orderCtx), ctxUsed: orderCtx });
  }

  // Emit in the original active order (dedup by id) — output shape unchanged.
  const seen = new Set<string>();
  const results: PromoResult[] = [];
  for (const p of active) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    const { discount, ctxUsed } = computed.get(p.id) ?? { discount: calcDiscount(p, ctx), ctxUsed: ctx };
    if (discount > 0 || p.promotionType === "free_delivery" || p.promotionType === "reward_credit") {
      const breakdown = promoBreakdown(p, ctxUsed);
      results.push({
        promoId: p.id,
        name: p.name,
        discount,
        type: p.promotionType,
        couponCode: p.couponCode ?? undefined,
        stackingRule: p.stackingRule,
        description: p.description ?? undefined,
        creditAmount: p.promotionType === "reward_credit"
          ? Math.max(0, Number((getRules(p) as any).creditAmount) || 0)
          : undefined,
        // Itemise whenever the engine produced per-dish lines (incl. a single
        // discounted dish) so the cart can show WHICH items were discounted.
        // Whole-cart promos return [] from promoBreakdown → no itemisation.
        breakdown: breakdown.length >= 1 ? breakdown : undefined,
      });
    }
  }
  return { results, blockedPromos };
}

/** Back-compat wrapper — returns just the applied results. Existing callers
 *  (order placement, harness) keep working unchanged. */
export function applyPromotions(promos: PromoInput[], ctx: ApplyContext): PromoResult[] {
  return resolvePromotions(promos, ctx).results;
}

export function totalPromoDiscount(results: PromoResult[], subtotal: number): number {
  const sum = results.reduce((s, r) => s + r.discount, 0);
  return Math.min(parseFloat(sum.toFixed(2)), subtotal);
}
