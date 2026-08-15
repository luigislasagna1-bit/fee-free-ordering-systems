/**
 * The simulator's OFFLINE PRICER — a deliberately small model of what
 * `/api/orders` (dryRun and the 201) would compute for a wire payload built
 * from a `MenuSnapshot`.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NOT MODELLED (on purpose — DB parity is a separate test, not this one):  │
 * │  • promotions / day deals / coupons / reward dollars   (discount = 0)    │
 * │  • delivery-zone minimum-order enforcement                              │
 * │  • service fees, deposits, tips                        ([] / 0)         │
 * │  • combo child up-charges and the shared topping pool  (base price only) │
 * │  • per-item tax overrides / tax-exempt items           (one flat rate)   │
 * │  • schedule/pause/holiday refusals                                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * What IS modelled, exactly enough for the cart comparison and for a
 * plausible spoken total:
 *  • simple items: (variant price | item price) + Σ modifier priceAdjustment,
 *    resolved by modifierOptionId across the item's groups;
 *  • pizzas: (variant price | item price) + toppingBaseAdjust + Σ
 *    priceToppingLines over the topping-group modifiers ("(L.H) "/"(R.H) "
 *    prefix ⇒ half line), + Σ priceAdjustment of the non-topping modifiers
 *    (crust / sauce / cheese / garnish) — the SAME formula the compiler uses
 *    for `lineSubtotal`, so a spoken pricing note and the quote agree;
 *  • combos: the combo's base price × quantity;
 *  • delivery: the fee `resolveSimAddress` reports for the order's address
 *    (so the mid-call address check and the quote can never disagree);
 *  • tax: subtotal × (pricing.taxRatePct ?? 13) / 100, rounded to cents.
 */
import { isHalfToppingName, priceToppingLines, toppingBaseAdjust, type ToppingChargeLine, type ToppingPricingConfig } from "@/lib/pizza-topping-pricing";
import type { CompiledLine, GroupData, ItemData } from "@/lib/voice/order-line-compiler";
import type { MenuSnapshot, SnapshotAddress } from "./snapshot-types";

const round2 = (n: number) => Math.round(n * 100) / 100;

/* ─────────────────────────────── addresses ─────────────────────────────── */

/** Case/punctuation-insensitive key, mirroring `addressKey` in the cart engine. */
const words = (s?: string | null) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const tight = (s?: string | null) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

/** The default flat fee when the fixture carries no curated addresses. */
export const SIM_DEFAULT_DELIVERY_FEE = 3.99;

export type SimAddressResult =
  | { located: false }
  | {
      located: true;
      inside: boolean;
      lat: number;
      lng: number;
      matchedAddress: string;
      zoneName: string | null;
      fee: number;
      minimumOrder: number;
      source: "fixture" | "default";
    };

/**
 * ONE resolver for "is this address deliverable, and what does it cost", used
 * by both the fake check-address endpoint and the fake pricer.
 *
 *  • With curated `snapshot.addresses`: match street (+ city / zip when the
 *    caller gave them) case- and punctuation-insensitively; a match is
 *    located, and inside iff it has a zone; fee = the address's fee, else the
 *    restaurant's flat fee, else 0. No match ⇒ not located.
 *  • With NO curated addresses (what `nabil-snapshot-menu.ts` produces): ANY
 *    street that carries a house number is located, inside, in "Sim Zone",
 *    at `pricing.deliveryFee ?? 3.99`. A street with no number is not located
 *    — so scenarios can still exercise the "could not pin it down" branch.
 */
export function resolveSimAddress(
  snapshot: MenuSnapshot,
  addr: { street?: string | null; city?: string | null; zip?: string | null },
): SimAddressResult {
  const street = words(addr.street);
  if (!street) return { located: false };
  const city = words(addr.city);
  const zip = tight(addr.zip);
  const curated: SnapshotAddress[] = Array.isArray(snapshot.addresses) ? snapshot.addresses : [];
  if (curated.length) {
    const hit = curated.find((a) => {
      if (words(a.street) !== street) return false;
      if (city && words(a.city) && words(a.city) !== city) return false;
      if (zip && tight(a.zip) && tight(a.zip) !== zip) return false;
      return true;
    });
    if (!hit) return { located: false };
    const fee = typeof hit.fee === "number" ? hit.fee : (snapshot.pricing.deliveryFee ?? 0);
    return {
      located: true,
      inside: hit.zoneName !== null,
      lat: hit.lat,
      lng: hit.lng,
      matchedAddress: [hit.street, hit.city, hit.zip].filter(Boolean).join(", "),
      zoneName: hit.zoneName,
      fee,
      minimumOrder: snapshot.pricing.minimumOrder ?? 0,
      source: "fixture",
    };
  }
  if (!/\d/.test(street)) return { located: false };
  return {
    located: true,
    inside: true,
    lat: 43.5183,
    lng: -79.8774,
    matchedAddress: [addr.street, addr.city, addr.zip].map((s) => (s || "").trim()).filter(Boolean).join(", "),
    zoneName: "Sim Zone",
    fee: typeof snapshot.pricing.deliveryFee === "number" ? snapshot.pricing.deliveryFee : SIM_DEFAULT_DELIVERY_FEE,
    minimumOrder: snapshot.pricing.minimumOrder ?? 0,
    source: "default",
  };
}

/* ─────────────────────────────── pricing ───────────────────────────────── */

export type PricedLine = { name: string; quantity: number; unitPrice: number; subtotal: number };

export type PriceOk = {
  ok: true;
  total: number;
  subtotal: number;
  discount: number;
  tax: number;
  deliveryFee: number;
  serviceFees: unknown[];
  deposits: unknown[];
  tip: number;
  appliedPromoNames: string[];
  lines: PricedLine[];
};
export type PriceErr = { ok: false; status: 400; code: string; error: string };

/** The `/api/orders` body shape the voice service sends (see tools.ts orderBody). */
export type OrderBody = {
  type?: string | null;
  items?: CompiledLine[];
  deliveryAddress?: string | null;
  deliveryCity?: string | null;
  deliveryZip?: string | null;
  [k: string]: unknown;
};

function optionOf(groups: GroupData[], modifierOptionId: string) {
  for (const g of groups) {
    const o = g.options.find((x) => x.modifierOptionId === modifierOptionId);
    if (o) return { group: g, option: o };
  }
  return null;
}

/** Topping groups of a pizza, by pizzaConfig ids first, then by role tag. */
export function toppingGroupIds(item: ItemData): Set<string> {
  const cfg = item.pizzaConfig;
  const byId = cfg?.toppingGroupIds?.length ? item.modifierGroups.filter((g) => cfg.toppingGroupIds.includes(g.id)) : [];
  const groups = byId.length ? byId : item.modifierGroups.filter((g) => g.pizzaRole === "topping" || g.pizzaRole === "toppings");
  return new Set(groups.map((g) => g.id));
}

/** Unit price of one wire line against the snapshot, or an error. */
export type PriceOpts = { soldOut?: Iterable<string> };

export function priceLine(snapshot: MenuSnapshot, line: CompiledLine, opts: PriceOpts = {}): { ok: true; unit: number; name: string } | PriceErr {
  const item = snapshot.items[String(line.menuItemId ?? "")];
  if (!item) return { ok: false, status: 400, code: "invalid_item", error: `Unknown menu item ${String(line.menuItemId)}` };
  const soldOut = new Set(opts.soldOut ?? []);
  if (item.isSoldOut || soldOut.has(item.menuItemId)) return { ok: false, status: 400, code: "sold_out", error: `${item.name} is sold out` };

  // Combos: base price only (see header).
  const combo = snapshot.combos[item.menuItemId];
  if (line.isCombo && Array.isArray(line.bundleItems)) {
    if (!combo) return { ok: false, status: 400, code: "not_a_combo", error: `${item.name} is not a combo` };
    for (const child of line.bundleItems) {
      const c = snapshot.items[child.menuItemId];
      if (!c) return { ok: false, status: 400, code: "invalid_item", error: `Unknown combo child ${child.menuItemId}` };
      if (c.isSoldOut || soldOut.has(c.menuItemId)) return { ok: false, status: 400, code: "sold_out", error: `${c.name} is sold out` };
    }
    return { ok: true, unit: round2(combo.price), name: item.name };
  }

  let base = item.price;
  let variantName: string | null = null;
  if (line.variantId) {
    const v = item.variants.find((x) => x.variantId === line.variantId);
    if (!v) return { ok: false, status: 400, code: "invalid_variant", error: `Unknown variant on ${item.name}` };
    base = v.price;
    variantName = v.name;
  } else if (item.hasVariants && item.variants.length) {
    return { ok: false, status: 400, code: "variant_required", error: `${item.name} needs a size` };
  }

  const mods = Array.isArray(line.modifiers) ? line.modifiers : [];
  const cfg = item.pizzaConfig;
  if (!cfg) {
    let extras = 0;
    for (const m of mods) {
      const hit = optionOf(item.modifierGroups, m.modifierOptionId);
      if (!hit) return { ok: false, status: 400, code: "invalid_modifier", error: `Unknown modifier ${m.modifierOptionId} on ${item.name}` };
      extras += Number(hit.option.priceAdjustment) || 0;
    }
    return { ok: true, unit: round2(base + extras), name: item.name };
  }

  // Pizza — the compiler's lineSubtotal formula.
  const tIds = toppingGroupIds(item);
  const flat = variantName && cfg.variantToppingPrices?.[variantName] !== undefined ? Number(cfg.variantToppingPrices[variantName]) || 0 : cfg.extraToppingPrice;
  const pricing: ToppingPricingConfig = {
    extraToppingPrice: flat,
    includedToppings: cfg.includedToppings,
    halfToppingMultiplier: cfg.halfToppingMultiplier,
    reduceOnRemove: cfg.reduceOnRemove,
  };
  const chargeLines: ToppingChargeLine[] = [];
  let extras = 0;
  for (const m of mods) {
    const hit = optionOf(item.modifierGroups, m.modifierOptionId);
    if (!hit) return { ok: false, status: 400, code: "invalid_modifier", error: `Unknown modifier ${m.modifierOptionId} on ${item.name}` };
    if (tIds.has(hit.group.id)) {
      chargeLines.push({ optionId: hit.option.modifierOptionId, optionPrice: hit.option.priceAdjustment, isHalf: isHalfToppingName(m.name) });
    } else {
      extras += Number(hit.option.priceAdjustment) || 0;
    }
  }
  const toppings = priceToppingLines(pricing, chargeLines).reduce((a, b) => a + b, 0);
  const unit = round2(Math.max(0, base + toppingBaseAdjust(pricing) + toppings) + extras);
  return { ok: true, unit, name: item.name };
}

/** Price a whole `/api/orders` body. Mirrors the dryRun envelope's numbers. */
export function priceOrder(snapshot: MenuSnapshot, body: OrderBody, opts: PriceOpts = {}): PriceOk | PriceErr {
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) return { ok: false, status: 400, code: "empty_cart", error: "No items" };
  const lines: PricedLine[] = [];
  let subtotal = 0;
  for (const raw of items) {
    const qty = Math.max(1, Math.floor(Number(raw?.quantity) || 1));
    const p = priceLine(snapshot, raw, opts);
    if (!p.ok) return p;
    const lineSubtotal = round2(p.unit * qty);
    subtotal = round2(subtotal + lineSubtotal);
    lines.push({ name: p.name, quantity: qty, unitPrice: p.unit, subtotal: lineSubtotal });
  }
  let deliveryFee = 0;
  if (body.type === "delivery") {
    const r = resolveSimAddress(snapshot, { street: body.deliveryAddress, city: body.deliveryCity, zip: body.deliveryZip });
    deliveryFee = r.located ? r.fee : (snapshot.pricing.deliveryFee ?? SIM_DEFAULT_DELIVERY_FEE);
  }
  const rate = typeof snapshot.pricing.taxRatePct === "number" ? snapshot.pricing.taxRatePct : 13;
  const tax = round2((subtotal * rate) / 100);
  const total = round2(subtotal + tax + deliveryFee);
  return { ok: true, total, subtotal, discount: 0, tax, deliveryFee, serviceFees: [], deposits: [], tip: 0, appliedPromoNames: [], lines };
}
