// ─── Promotion Engine ──────────────────────────────────────────────────────────
// Rules-based promotion calculation engine
// Each promotionType has its own rules JSON structure and calculation logic.
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
};

export type CartItem = {
  menuItemId: string;
  categoryId?: string;
  price: number;
  quantity: number;
  subtotal: number;
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
  /** Order channel. Multi-select promos match any of their listed types. */
  orderType: "pickup" | "delivery" | "dine_in" | "catering" | "takeout";
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
  /** Per-promo "has this customer used this promo before (lifetime)?"
   *  map. Keyed by promotion id. Caller pre-computes via Order rows
   *  filtered to this customer + this promotion. */
  hasUsedLifetime?: Record<string, boolean>;
  now?: Date;
};

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

function isScheduledNow(promo: PromoInput, now: Date): boolean {
  if (promo.startsAt && now < new Date(promo.startsAt)) return false;
  if (promo.endsAt && now > new Date(promo.endsAt)) return false;
  const days = safeJson<number[] | null>(promo.daysOfWeek ?? null, null);
  if (days && !days.includes(now.getDay())) return false;
  // Hour-of-day USABILITY window (Fabrizio 2026-05-28). Promo is only
  // applied if the current minute-of-day falls inside the window. Both
  // bounds NULL = always usable. Window can wrap past midnight when
  // start > end (e.g. 22:00–02:00 = late night).
  const startMin = typeof promo.usableHourStart === "number" ? promo.usableHourStart : null;
  const endMin = typeof promo.usableHourEnd === "number" ? promo.usableHourEnd : null;
  if (startMin != null || endMin != null) {
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const s = startMin ?? 0;
    const e = endMin ?? 1440;
    const inWindow = s <= e
      ? nowMin >= s && nowMin < e
      // Wrap: late-night promo (22:00–02:00) is in-window if EITHER
      // we're past start OR before end.
      : nowMin >= s || nowMin < e;
    if (!inWindow) return false;
  }
  return true;
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
  const allowedOrderTypes = parseOrderTypes(promo.orderType);
  if (allowedOrderTypes && !allowedOrderTypes.has(ctx.orderType)) return false;

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
    if (!allowedPaymentMethods.has(ctx.paymentMethod)) return false;
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
  if (!isScheduledNow(promo, ctx.now ?? new Date())) return false;

  return true;
}

// ── Item group matching ────────────────────────────────────────────────────────

function itemsMatchingGroup(group: ItemGroup, items: CartItem[]): CartItem[] {
  const { itemIds = [], categoryIds = [] } = group;
  if (!itemIds.length && !categoryIds.length) return items;
  return items.filter(i =>
    itemIds.includes(i.menuItemId) ||
    (i.categoryId != null && categoryIds.includes(i.categoryId))
  );
}

function groupTotalQty(group: ItemGroup, items: CartItem[]): number {
  return itemsMatchingGroup(group, items).reduce((s, i) => s + i.quantity, 0);
}

// ── Per-type discount calculators ─────────────────────────────────────────────

function calcPercentageOff(promo: PromoInput, ctx: ApplyContext): number {
  const rules = getRules(promo);
  const pct = rules.discountPercent ?? 0;
  if (!rules.groups?.length) {
    return parseFloat(((pct / 100) * ctx.subtotal).toFixed(2));
  }
  // Targeted items only
  let eligible = 0;
  for (const group of rules.groups) {
    const matched = itemsMatchingGroup(group, ctx.items);
    eligible += matched.reduce((s, i) => s + i.subtotal, 0);
  }
  return parseFloat(((pct / 100) * eligible).toFixed(2));
}

function calcFreeDelivery(_promo: PromoInput, _ctx: ApplyContext): number {
  return 0; // handled via hasFreeDelivery flag
}

/** Expand cart items into a flat list of per-unit prices. A cart item
 *  with quantity 3 becomes 3 entries at the same per-unit price. Used
 *  by BOGO / Buy-N-Get-Free so we can discount the correct NUMBER of
 *  units when the customer has multiple qualifying pairs. */
function expandToUnits(items: CartItem[]): number[] {
  const units: number[] = [];
  for (const it of items) {
    for (let i = 0; i < it.quantity; i++) units.push(it.price);
  }
  return units;
}

/** Pick the N units to discount from a pool, given a strategy. The
 *  pool is expanded by quantity so a single line item with qty=3
 *  contributes 3 discountable units. Returns the total discount $. */
function discountNUnits(
  pool: CartItem[],
  count: number,
  strategy: string,
  cheapestPct: number,
  mostExpensivePct: number,
): number {
  if (count <= 0 || !pool.length) return 0;
  const units = expandToUnits(pool);
  if (!units.length) return 0;
  const isMostExpensive = strategy === "most_expensive";
  units.sort((a, b) => (isMostExpensive ? b - a : a - b));
  const pct = isMostExpensive ? mostExpensivePct : cheapestPct;
  const take = Math.min(count, units.length);
  let sum = 0;
  for (let i = 0; i < take; i++) sum += units[i] * (pct / 100);
  return parseFloat(sum.toFixed(2));
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

function calcBogo(promo: PromoInput, ctx: ApplyContext): number {
  const rules = getRules(promo);
  const groups = rules.groups ?? [];
  const paidGroup = groups.find(g => g.role === "paid") ?? groups[0];
  const freeGroup = groups.find(g => g.role === "free") ?? groups[groups.length - 1];
  if (!paidGroup || !freeGroup) return 0;
  const paidItems = itemsMatchingGroup(paidGroup, ctx.items);
  if (!paidItems.length) return 0;
  const freeItems = itemsMatchingGroup(freeGroup, ctx.items);
  if (!freeItems.length) return 0;

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
    if (totalQualifyingQty < 2) return 0;
    pairs = Math.floor(totalQualifyingQty / 2);
  } else {
    const paidQty = paidItems.reduce((s, i) => s + i.quantity, 0);
    const freeQty = freeItems.reduce((s, i) => s + i.quantity, 0);
    pairs = Math.min(paidQty, freeQty);
    if (pairs < 1) return 0;
  }

  return discountNUnits(
    freeItems,
    pairs,
    rules.discountStrategy ?? "cheapest",
    rules.cheapestDiscount ?? 100,
    rules.mostExpensiveDiscount ?? 100,
  );
}

function calcBuyNGetFree(promo: PromoInput, ctx: ApplyContext): number {
  const rules = getRules(promo);
  const groups = rules.groups ?? [];
  const paidGroups = groups.filter(g => g.role === "paid" || g.role === "required");
  const freeGroup = groups.find(g => g.role === "free");
  if (!freeGroup) return 0;
  // Each paid group has a minCount (defaults to 1). The promo unlocks
  // floor(actualQty / minCount) "sets" per paid group; the customer
  // gets ONE free item per FULL set across all paid groups (i.e. the
  // bottleneck group caps the multiplier).
  let multiplier = Infinity;
  for (const pg of paidGroups) {
    const need = pg.minCount ?? 1;
    if (need < 1) continue;
    const have = groupTotalQty(pg, ctx.items);
    if (have < need) return 0;
    multiplier = Math.min(multiplier, Math.floor(have / need));
  }
  if (!Number.isFinite(multiplier) || multiplier < 1) {
    // No paid-group gating at all — fall back to single application.
    multiplier = 1;
  }
  const freeItems = itemsMatchingGroup(freeGroup, ctx.items);
  if (!freeItems.length) return 0;
  return discountNUnits(
    freeItems,
    multiplier,
    rules.discountStrategy ?? "cheapest",
    rules.cheapestDiscount ?? 100,
    rules.mostExpensiveDiscount ?? 0,
  );
}

function calcFixedCart(promo: PromoInput, ctx: ApplyContext): number {
  const rules = getRules(promo);
  const amount = rules.discountAmount ?? 0;
  return Math.min(amount, ctx.subtotal);
}

function calcPaymentReward(promo: PromoInput, ctx: ApplyContext): number {
  const rules = getRules(promo);
  const pm = rules.paymentMethod;
  if (pm && pm !== "any" && ctx.paymentMethod && ctx.paymentMethod !== pm) return 0;
  return parseFloat(((( rules.discountPercent ?? 0) / 100) * ctx.subtotal).toFixed(2));
}

function calcFreeItem(promo: PromoInput, ctx: ApplyContext): number {
  const rules = getRules(promo);
  if (rules.triggerAmount && ctx.subtotal < rules.triggerAmount) return 0;
  const freeGroup = rules.groups?.find(g => g.role === "free") ?? rules.groups?.[0];
  if (!freeGroup) return 0;
  const eligible = itemsMatchingGroup(freeGroup, ctx.items);
  if (!eligible.length) return 0;
  const sorted = [...eligible].sort((a, b) => a.price - b.price);
  return sorted[0].price;
}

function calcMealBundle(promo: PromoInput, ctx: ApplyContext): number {
  const rules = getRules(promo);
  const groups = rules.groups ?? [];
  if (!groups.length) return 0;
  // Check each group satisfies its minCount
  for (const group of groups) {
    const min = group.minCount ?? 1;
    if (groupTotalQty(group, ctx.items) < min) return 0;
  }
  // Discount = sum of all eligible items - bundlePrice
  let eligibleTotal = 0;
  for (const group of groups) {
    const matched = itemsMatchingGroup(group, ctx.items);
    eligibleTotal += matched.reduce((s, i) => s + i.subtotal, 0);
  }
  const bundlePrice = rules.bundlePrice ?? 0;
  return Math.max(0, parseFloat((eligibleTotal - bundlePrice).toFixed(2)));
}

function calcFreeDishMeal(promo: PromoInput, ctx: ApplyContext): number {
  const rules = getRules(promo);
  const groups = rules.groups ?? [];
  const triggerGroups = groups.filter(g => g.role === "trigger");
  const freeGroup = groups.find(g => g.role === "free");
  if (!freeGroup) return 0;
  // All trigger groups must be satisfied
  for (const tg of triggerGroups) {
    if (groupTotalQty(tg, ctx.items) < 1) return 0;
  }
  const freeItems = itemsMatchingGroup(freeGroup, ctx.items);
  if (!freeItems.length) return 0;
  const pct = rules.discountPercent ?? 100;
  const sorted = [...freeItems].sort((a, b) => a.price - b.price);
  return parseFloat((sorted[0].price * (pct / 100)).toFixed(2));
}

function calcFixedCombo(promo: PromoInput, ctx: ApplyContext): number {
  const rules = getRules(promo);
  const groups = rules.groups ?? [];
  for (const group of groups) {
    if (groupTotalQty(group, ctx.items) < 1) return 0;
  }
  return Math.min(rules.discountAmount ?? 0, ctx.subtotal);
}

function calcPercentageCombo(promo: PromoInput, ctx: ApplyContext): number {
  const rules = getRules(promo);
  const groups = rules.groups ?? [];
  for (const group of groups) {
    if (groupTotalQty(group, ctx.items) < 1) return 0;
  }
  let eligible = 0;
  for (const group of groups) {
    const matched = itemsMatchingGroup(group, ctx.items);
    eligible += matched.reduce((s, i) => s + i.subtotal, 0);
  }
  return parseFloat((((rules.discountPercent ?? 0) / 100) * eligible).toFixed(2));
}

function calcMealBundleSpeciality(promo: PromoInput, ctx: ApplyContext): number {
  // Same as meal bundle - extra fee is added at UI level, discount = bundle savings
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
    default:                 return 0;
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export function applyPromotions(promos: PromoInput[], ctx: ApplyContext): PromoResult[] {
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

  if (!triggered.length) return [];

  // Stacking resolution
  const masters    = triggered.filter(p => p.stackingRule === "master");
  const exclusives = triggered.filter(p => p.stackingRule === "exclusive");
  const standards  = triggered.filter(p => p.stackingRule === "standard");

  let active: PromoInput[];
  if (exclusives.length > 0) {
    const best = exclusives.reduce((a, b) =>
      calcDiscount(a, ctx) >= calcDiscount(b, ctx) ? a : b
    );
    active = [best, ...masters];
  } else {
    active = [...standards, ...masters];
  }

  const seen = new Set<string>();
  const results: PromoResult[] = [];
  for (const p of active) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    const discount = calcDiscount(p, ctx);
    if (discount > 0 || p.promotionType === "free_delivery") {
      results.push({
        promoId: p.id,
        name: p.name,
        discount,
        type: p.promotionType,
        couponCode: p.couponCode ?? undefined,
        stackingRule: p.stackingRule,
        description: p.description ?? undefined,
      });
    }
  }
  return results;
}

export function totalPromoDiscount(results: PromoResult[], subtotal: number): number {
  const sum = results.reduce((s, r) => s + r.discount, 0);
  return Math.min(parseFloat(sum.toFixed(2)), subtotal);
}
