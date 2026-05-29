// ─── Promotion Engine ──────────────────────────────────────────────────────────
// Rules-based promotion calculation engine
// Each promotionType has its own rules JSON structure and calculation logic.

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
  orderType: string;
  customerType: string;
  minimumOrder: number;
  rules: string;
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
};

export type ApplyContext = {
  orderType: "pickup" | "delivery";
  isNewCustomer: boolean;
  subtotal: number;
  items: CartItem[];
  couponCode?: string;
  paymentMethod?: string;
  now?: Date;
};

function safeJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

function getRules(promo: PromoInput): PromoRules {
  return safeJson<PromoRules>(promo.rules, {});
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
  if (promo.usageLimit != null && promo.usedCount >= promo.usageLimit) return false;
  if (promo.minimumOrder > 0 && ctx.subtotal < promo.minimumOrder) return false;
  if (promo.orderType !== "both" && promo.orderType !== ctx.orderType) return false;
  if (promo.customerType === "new" && !ctx.isNewCustomer) return false;
  if (promo.customerType === "returning" && ctx.isNewCustomer) return false;
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

function applyGroupDiscount(
  freePool: CartItem[],
  strategy: string,
  cheapestPct: number,
  mostExpensivePct: number
): number {
  if (!freePool.length) return 0;
  const sorted = [...freePool].sort((a, b) => a.price - b.price);
  if (strategy === "most_expensive") {
    const item = sorted[sorted.length - 1];
    return parseFloat((item.price * (mostExpensivePct / 100)).toFixed(2));
  }
  // default = cheapest
  const item = sorted[0];
  return parseFloat((item.price * (cheapestPct / 100)).toFixed(2));
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
  return applyGroupDiscount(
    freeItems,
    rules.discountStrategy ?? "cheapest",
    rules.cheapestDiscount ?? 100,
    rules.mostExpensiveDiscount ?? 100
  );
}

function calcBuyNGetFree(promo: PromoInput, ctx: ApplyContext): number {
  const rules = getRules(promo);
  const groups = rules.groups ?? [];
  const paidGroups = groups.filter(g => g.role === "paid" || g.role === "required");
  const freeGroup = groups.find(g => g.role === "free");
  if (!freeGroup) return 0;
  // Check each paid group has at least 1 item
  for (const pg of paidGroups) {
    if (groupTotalQty(pg, ctx.items) < 1) return 0;
  }
  const freeItems = itemsMatchingGroup(freeGroup, ctx.items);
  if (!freeItems.length) return 0;
  return applyGroupDiscount(
    freeItems,
    rules.discountStrategy ?? "cheapest",
    rules.cheapestDiscount ?? 100,
    rules.mostExpensiveDiscount ?? 0
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
