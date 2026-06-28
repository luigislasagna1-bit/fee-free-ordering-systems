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
  /** True when this line was added as a promo freebie ("Free with promo: …").
   *  Lets free_item discount the CLAIMED freebie (not just the cheapest match)
   *  and excludes the freed unit from its own trigger. Luigi 2026-06-27. */
  isFreebie?: boolean;
};

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
  if (promo.minimumOrder > 0 && ctx.subtotal < promo.minimumOrder) return false;

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
    return parseFloat(((pct / 100) * ctx.subtotal).toFixed(2));
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
type DiscountUnit = { menuItemId: string; price: number };

function expandToUnits(items: CartItem[]): DiscountUnit[] {
  const units: DiscountUnit[] = [];
  for (const it of items) {
    for (let i = 0; i < it.quantity; i++) units.push({ menuItemId: it.menuItemId, price: it.price });
  }
  return units;
}

/** One discounted unit — which cart item, how much came off. Lets the cart
 *  itemise a promo that applies more than once (Luigi 2026-06-07). */
export type DiscountLine = { menuItemId: string; amount: number };

/** Pick the N units to discount from a pool, given a strategy. The pool is
 *  expanded by quantity so a line item with qty=3 contributes 3 discountable
 *  units. Returns the total discount $ AND the per-unit breakdown. */
function discountNUnitsDetailed(
  pool: CartItem[],
  count: number,
  strategy: string,
  cheapestPct: number,
  mostExpensivePct: number,
): { total: number; lines: DiscountLine[] } {
  if (count <= 0 || !pool.length) return { total: 0, lines: [] };
  const units = expandToUnits(pool);
  if (!units.length) return { total: 0, lines: [] };
  const isMostExpensive = strategy === "most_expensive";
  units.sort((a, b) => (isMostExpensive ? b.price - a.price : a.price - b.price));
  const pct = isMostExpensive ? mostExpensivePct : cheapestPct;
  const take = Math.min(count, units.length);
  // Total is summed RAW then rounded once (unchanged from the original) so
  // existing discount amounts are byte-for-byte stable; each line is rounded
  // individually for display.
  let rawSum = 0;
  const lines: DiscountLine[] = [];
  for (let i = 0; i < take; i++) {
    const raw = units[i].price * (pct / 100);
    rawSum += raw;
    lines.push({ menuItemId: units[i].menuItemId, amount: parseFloat(raw.toFixed(2)) });
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
  return discountNUnitsDetailed(
    freeItems,
    multiplier,
    fixedPct ? "cheapest" : strat,
    fixedPct ? (rules.discountPercent ?? 0) : (rules.cheapestDiscount ?? 100),
    // Default 100% (free) like BOGO — was 0%, so the "most expensive item free"
    // strategy silently discounted nothing (audit dead#2). Luigi 2026-06-27.
    rules.mostExpensiveDiscount ?? 100,
  );
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
      // Per-matched-item % discount, one line per qualifying dish. Skipped when
      // "once per order" (the discount is a single lump on one combo, shown as a
      // single line by the cart) or when there are no item groups (whole-cart %).
      const rules = getRules(promo);
      const groups = rules.groups ?? [];
      if (!groups.length || rules.oncePerOrder) return [];
      const pct = rules.discountPercent ?? 0;
      if (pct <= 0) return [];
      const lines: DiscountLine[] = [];
      const seen = new Set<string>();
      for (const g of groups) {
        for (const it of itemsMatchingGroup(g, ctx.items)) {
          if (seen.has(it.menuItemId)) continue;
          seen.add(it.menuItemId);
          lines.push({ menuItemId: it.menuItemId, amount: parseFloat(((pct / 100) * it.subtotal).toFixed(2)) });
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
      return [{ menuItemId: freebie.menuItemId, amount: parseFloat(freebie.price.toFixed(2)) }];
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
      return [{ menuItemId: cheapest.menuItemId, amount: parseFloat((cheapest.price * (pct / 100)).toFixed(2)) }];
    }
    default:               return [];
  }
}

function calcFixedCart(promo: PromoInput, ctx: ApplyContext): number {
  const rules = getRules(promo);
  const amount = rules.discountAmount ?? 0;
  return Math.min(amount, ctx.subtotal);
}

function calcPaymentReward(promo: PromoInput, ctx: ApplyContext): number {
  const rules = getRules(promo);
  const pm = rules.paymentMethod;
  // Normalize the legacy "card" value to the canonical "online_card" slug.
  const ctxPm = ctx.paymentMethod === "card" ? "online_card" : ctx.paymentMethod;
  if (pm && pm !== "any" && ctxPm && ctxPm !== pm) return 0;
  return parseFloat(((( rules.discountPercent ?? 0) / 100) * ctx.subtotal).toFixed(2));
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
  const freedAmount = (claimed ?? [...eligible].sort((a, b) => a.price - b.price)[0]).price;
  // The freed unit must NOT count toward unlocking its own trigger — otherwise a
  // customer reached the threshold by adding only the free item and walked away
  // with a $0 order (audit self-bootstrap). Compare the trigger against the cart
  // MINUS the freed unit. Luigi 2026-06-27.
  const trigger = rules.triggerAmount ?? 0;
  if (trigger > 0 && ctx.subtotal - freedAmount < trigger) return 0;
  return freedAmount;
}

function calcMealBundle(promo: PromoInput, ctx: ApplyContext): number {
  const rules = getRules(promo);
  const groups = rules.groups ?? [];
  if (!groups.length) return 0;
  const isSpeciality = promo.promotionType === "meal_bundle_speciality";

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

  let eligibleTotal = 0;
  let feeTotal = 0;
  for (const group of groups) {
    // minCount clamped to >=1 so a slot saved with min 0 can't auto-satisfy or
    // auto-fold priciest units for free (audit). maxCount >= min.
    const min = Math.max(1, group.minCount ?? 1);
    const cap = Math.max(min, group.maxCount ?? min);
    const avail = units
      .filter((u) => !u.used && itemMatchesGroup(group, u.item))
      .sort((a, b) => b.price - a.price);
    // Each slot needs `min` DISTINCT units; if the cart can't supply them with
    // units not already claimed by another slot, the bundle doesn't qualify.
    if (avail.length < min) return 0;
    const take = avail.slice(0, cap);
    for (const u of take) {
      u.used = true;
      eligibleTotal += u.price;
    }
    // Speciality bundles add a per-slot fee per claimed unit — it's NOT part of
    // the discount, so it reduces the savings (customer pays bundlePrice + fees).
    if (isSpeciality) feeTotal += Math.max(0, Number(group.extraFee ?? 0)) * take.length;
  }
  const bundlePrice = rules.bundlePrice ?? 0;
  return Math.max(0, parseFloat((eligibleTotal - bundlePrice - feeTotal).toFixed(2)));
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
  return parseFloat((sorted[0].price * (pct / 100)).toFixed(2));
}

function calcFixedCombo(promo: PromoInput, ctx: ApplyContext): number {
  const rules = getRules(promo);
  const groups = rules.groups ?? [];
  // A combo with NO groups is a misconfiguration — must NOT behave like an
  // unconditional whole-cart discount (audit). Luigi 2026-06-27.
  if (!groups.length) return 0;
  for (const group of groups) {
    if (groupTotalQty(group, ctx.items) < 1) return 0;
  }
  return Math.min(rules.discountAmount ?? 0, ctx.subtotal);
}

function calcPercentageCombo(promo: PromoInput, ctx: ApplyContext): number {
  const rules = getRules(promo);
  const groups = rules.groups ?? [];
  if (!groups.length) return 0; // no groups = misconfig, never whole-cart
  for (const group of groups) {
    if (groupTotalQty(group, ctx.items) < 1) return 0;
  }
  // "Once per order" → discount ONE combo (one item per group, the customer's
  // best). Unchecked (default) → discount every qualifying item, i.e. all the
  // combos the cart forms. Luigi 2026-06-07: "buy 4 items — all 4 or just one
  // 2-item combo? — this is what that option adjusts."
  const eligible = rules.oncePerOrder
    ? oneComboValue(groups, ctx.items)
    : allGroupsValue(groups, ctx.items);
  return parseFloat((((rules.discountPercent ?? 0) / 100) * eligible).toFixed(2));
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

  let active: PromoInput[];
  const blockedPromos: BlockedPromo[] = [];
  if (exclusives.length > 0) {
    const best = exclusives.reduce((a, b) =>
      effectiveValue(a) >= effectiveValue(b) ? a : b
    );
    active = [best, ...masters];
    // Everything else that qualified — the other exclusives AND every standard
    // deal — is blocked, because the winning exclusive can't be combined with
    // them. Masters still apply (they stack with everything). We report each so
    // the cart can explain it and offer "remove this to use that instead".
    for (const p of triggered) {
      if (p.id === best.id || p.stackingRule === "master") continue;
      if (effectiveValue(p) > 0) {
        blockedPromos.push({ promoId: p.id, name: p.name, discount: calcDiscount(p, ctx), winnerName: best.name, wasExclusive: p.stackingRule === "exclusive", couponCode: p.couponCode ?? undefined });
      }
    }
  } else {
    active = [...standards, ...masters];
  }

  const seen = new Set<string>();
  const results: PromoResult[] = [];
  for (const p of active) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    const discount = calcDiscount(p, ctx);
    if (discount > 0 || p.promotionType === "free_delivery" || p.promotionType === "reward_credit") {
      const breakdown = promoBreakdown(p, ctx);
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
