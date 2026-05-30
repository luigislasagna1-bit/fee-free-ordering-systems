"use client";

/**
 * PromoDetailModal — customer-facing walkthrough modal for the 13 promo types.
 *
 * Opens when the customer clicks a promo banner card on /order/[slug]. Each
 * promo type has its own panel (read off `promo.promotionType`) — most are
 * read-only "info + clickable item rows that scroll to the matching menu
 * item." Interactive types (Free item picker, Meal bundle composer) embed
 * the dedicated sub-modals (FreebiePromptModal, BundleComposerModal).
 *
 * Auto-apply principle (per MARKETING-PROMO-CATALOG.md):
 *   The walkthrough is a DISCOVERY UX, never a gate. A customer who builds
 *   the qualifying cart manually gets the same discount as one who clicks
 *   the banner. Most panels here just explain the promo + help the customer
 *   find the eligible items faster.
 */
import { useMemo } from "react";
import { X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { getPromoTypeMeta } from "@/lib/promo-types";
import { FreebiePromptModal } from "./FreebiePromptModal";
import { BundleComposerModal, type BundleCartItem } from "./BundleComposerModal";

// ─── Types — kept loose; the modal accepts the same shape used by the
//     parent OrderingPageClient promoBanners prop, plus any extra fields
//     the engine attaches (notably ruleConfig). ────────────────────────

type RuleConfigGroup = {
  id?: string;
  label?: string;
  categoryIds?: string[];
  itemIds?: string[];
  menuItemIds?: string[]; // legacy alias
  minCount?: number;
  maxCount?: number;
  extraFee?: number;
};

type RuleConfig = {
  discountPercent?: number;
  discountAmount?: number;
  fixedDiscountAmount?: number;
  bundlePrice?: number;
  flatPrice?: number;
  paymentMethod?: string;
  triggerAmount?: number;
  groups?: RuleConfigGroup[];
  itemGroups?: RuleConfigGroup[];
  eligibleGroup?: RuleConfigGroup;
  deliveryFeeDiscountPercent?: number;
  // ...whatever else the engine emits.
};

type Promo = {
  id: string;
  name: string;
  description: string | null;
  promotionType: string;
  bannerHeadline: string | null;
  minimumOrder: number;
  orderType: string;
  couponCode: string | null;
  ruleConfig?: RuleConfig | null;
  rules?: string | null;
  // GloriaFood-style summary panel (Luigi 2026-05-29): drive
  // "What you get" + "Conditions" lists. All optional — modal degrades
  // gracefully when the field isn't passed.
  autoApply?: boolean;
  customerType?: string;
  daysOfWeek?: string | null;        // JSON array of 0..6
  usableHourStart?: number | null;   // minutes since midnight
  usableHourEnd?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  paymentMethodSlugs?: string | null;  // JSON array
  deliveryZoneIds?: string | null;     // JSON array
  onceLifetimePerClient?: boolean;
};

type MenuItemLite = {
  id: string;
  name: string;
  price: number;
  imageUrl?: string;
  categoryId?: string;
};

type DeliveryZoneLite = {
  id: string;
  name: string;
};

interface Props {
  promo: Promo;
  /** Flat list of every menu item across visible categories, for the
   *  item-row renderer to look up names/prices/images. */
  allMenuItems: MenuItemLite[];
  /** Delivery zones — used by the free_delivery panel. */
  deliveryZones?: DeliveryZoneLite[];
  /** Current cart subtotal — drives free_item gating. */
  cartSubtotal: number;
  /** Primary brand color from the theme — keeps the modal on-palette. */
  primaryColor: string;
  /** Add a freebie item to the cart at $0 (or discounted) — see
   *  FreebiePromptModal for the contract. */
  onAddFreebie: (item: MenuItemLite, promoName: string) => void;
  /** Add a fully-built bundle to the cart as ONE consolidated line — see
   *  BundleComposerModal for the contract. */
  onAddBundle: (bundle: BundleCartItem) => void;
  /** Switch the page-level order type — used by the free_delivery panel's
   *  "Switch to delivery" footer button. */
  onSwitchOrderType?: (next: "pickup" | "delivery") => void;
  onClose: () => void;
}

// ─── Helpers ───────────────────────────────────────────────────────────

function parseRuleConfig(promo: Promo): RuleConfig {
  if (promo.ruleConfig && typeof promo.ruleConfig === "object") {
    return promo.ruleConfig as RuleConfig;
  }
  if (typeof promo.rules === "string" && promo.rules.length > 0) {
    try {
      return JSON.parse(promo.rules) as RuleConfig;
    } catch {
      return {};
    }
  }
  return {};
}

function collectGroupItems(group: RuleConfigGroup | undefined, allMenuItems: MenuItemLite[]): MenuItemLite[] {
  if (!group) return [];
  const idSet = new Set<string>([
    ...(group.itemIds ?? []),
    ...(group.menuItemIds ?? []),
  ]);
  const catSet = new Set<string>(group.categoryIds ?? []);
  return allMenuItems.filter((mi) => idSet.has(mi.id) || (mi.categoryId && catSet.has(mi.categoryId)));
}

function scrollToMenuItem(itemId: string, onClose: () => void) {
  onClose();
  // Wait a tick for the modal to unmount before scrolling so the layout
  // is final and the scroll target is in its post-modal position.
  setTimeout(() => {
    const el = document.getElementById(`menu-item-${itemId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, 50);
}

// ─── Reusable item-row renderer ────────────────────────────────────────

function ItemRow({
  item,
  primaryColor,
  badge,
  onClick,
}: {
  item: MenuItemLite;
  primaryColor: string;
  badge?: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 p-2 rounded-xl border border-gray-100 hover:bg-gray-50 transition text-left"
    >
      {item.imageUrl ? (
        <img src={item.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
      ) : (
        <div
          className="w-12 h-12 rounded-lg flex-shrink-0"
          style={{ background: `linear-gradient(135deg, ${primaryColor}22, #f3f4f6)` }}
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-gray-900 truncate">{item.name}</div>
        <div className="text-xs text-gray-500">{formatCurrency(item.price)}</div>
      </div>
      {badge && (
        <span
          className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: `${primaryColor}22`, color: primaryColor }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

// ─── GloriaFood-style summary panel ────────────────────────────────────
// Builds two bulleted lists from the promo's data:
//   "What you get" — the benefit (e.g. "20% off cart", "Free delivery")
//   "Conditions"   — restrictions the customer must meet (cart minimum,
//                    day-of-week, address zone, payment method, etc.)
// Renders at the top of every PromoDetailModal so customers always see
// the same structured info — matches the GloriaFood UX Luigi screenshotted.

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function safeJsonArray(s: string | null | undefined): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

function minToHHMM(min: number): string {
  const m = Math.max(0, Math.min(1440, Math.floor(min)));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${mm.toString().padStart(2, "0")} ${ampm}`;
}

function buildWhatYouGet(promo: Promo, rules: RuleConfig): string[] {
  const out: string[] = [];
  const pct = rules.discountPercent;
  const amt = rules.discountAmount;
  const bundlePrice = rules.bundlePrice;
  switch (promo.promotionType) {
    case "percentage_off":
      out.push(pct ? `${pct}% off the eligible items` : "Percentage off the eligible items");
      break;
    case "free_delivery":
      out.push("100% discount to delivery fee");
      break;
    case "bogo":
      out.push("Buy one item, get another free (or discounted)");
      break;
    case "fixed_cart":
      out.push(amt ? `${formatCurrency(amt)} off your order` : "Fixed dollar discount on your order");
      break;
    case "payment_reward":
      out.push(pct ? `${pct}% off when paying with the selected method` : "Discount for paying with the selected method");
      break;
    case "free_item":
      out.push("A free item from the curated list");
      break;
    case "meal_bundle":
    case "meal_bundle_speciality":
      out.push(bundlePrice ? `Bundle deal for ${formatCurrency(bundlePrice)}` : "Mix-and-match bundle at a fixed price");
      break;
    case "buy_n_get_free":
      out.push("Add N qualifying items, get one free");
      break;
    case "free_dish_meal":
      out.push("Order the trigger items, get a dish free");
      break;
    case "fixed_combo":
      out.push(amt ? `${formatCurrency(amt)} off when buying the combo` : "Fixed dollar discount on the combo");
      break;
    case "percentage_combo":
      out.push(pct ? `${pct}% off when buying the combo` : "Percentage off the combo");
      break;
    default:
      out.push(promo.description ?? promo.name);
  }
  return out;
}

function buildConditions(promo: Promo, zones: DeliveryZoneLite[]): string[] {
  const out: string[] = [];

  // Frequency
  if (promo.onceLifetimePerClient) out.push("Only once per customer (lifetime)");
  else out.push("Only once in cart");

  // Cart value
  if (promo.minimumOrder > 0) {
    out.push(`Sub-total: greater than or equal to ${formatCurrency(promo.minimumOrder)}`);
  }

  // Order channel
  if (promo.orderType && promo.orderType !== "both") {
    const channels = promo.orderType.startsWith("[")
      ? safeJsonArray(promo.orderType).map(formatChannel).join(", ")
      : formatChannel(promo.orderType);
    out.push(`Order Type: ${channels}`);
  }

  // Client type
  if (promo.customerType && promo.customerType !== "any") {
    const label =
      promo.customerType === "new" ? "New customers only" :
      promo.customerType === "returning" ? "Returning customers only" :
      promo.customerType === "member" ? "Signed-in members only" : promo.customerType;
    out.push(label);
  }

  // Payment
  const paymentSlugs = safeJsonArray(promo.paymentMethodSlugs);
  if (paymentSlugs.length > 0) {
    out.push(`Payment Method: ${paymentSlugs.map(formatPayment).join(", ")}`);
  }

  // Delivery area
  const zoneIds = safeJsonArray(promo.deliveryZoneIds);
  if (zoneIds.length > 0) {
    const zoneNames = zoneIds
      .map((id) => zones.find((z) => z.id === id)?.name ?? null)
      .filter(Boolean) as string[];
    if (zoneNames.length > 0) {
      out.push(`For delivery, the address must be in the following zones: ${zoneNames.join(", ")}`);
    } else {
      out.push("Restricted to specific delivery zones");
    }
  }

  // Day-of-week
  const days = safeJsonArray(promo.daysOfWeek).map((d) => parseInt(d, 10)).filter((n) => Number.isFinite(n));
  if (days.length > 0 && days.length < 7) {
    out.push(`Available on: ${days.sort((a, b) => a - b).map((d) => DAY_NAMES[d]).join(", ")}`);
  }

  // Hour-of-day
  if (typeof promo.usableHourStart === "number" && typeof promo.usableHourEnd === "number") {
    out.push(`Available between ${minToHHMM(promo.usableHourStart)} – ${minToHHMM(promo.usableHourEnd)}`);
  }

  // Expiration
  if (promo.startsAt && new Date(promo.startsAt) > new Date()) {
    out.push(`Starts ${new Date(promo.startsAt).toLocaleDateString()}`);
  }
  if (promo.endsAt) {
    out.push(`Expires ${new Date(promo.endsAt).toLocaleDateString()}`);
  }

  return out;
}

function formatChannel(slug: string): string {
  return {
    pickup: "Pickup",
    delivery: "Delivery",
    dine_in: "Dine-In",
    catering: "Catering",
    takeout: "Take Out",
  }[slug] ?? slug;
}

function formatPayment(slug: string): string {
  return {
    cash: "Cash",
    card_in_person: "Card at pickup / door",
    online_card: "Card online",
    paypal: "PayPal",
  }[slug] ?? slug;
}

function SummaryPanel({ promo, rules, deliveryZones }: {
  promo: Promo;
  rules: RuleConfig;
  deliveryZones: DeliveryZoneLite[];
}) {
  const benefits = buildWhatYouGet(promo, rules);
  const conditions = buildConditions(promo, deliveryZones);
  const autoApply = promo.autoApply !== false;
  return (
    <div className="space-y-4 mb-5 pb-5 border-b border-gray-100">
      <div>
        <div className="text-sm font-bold text-gray-900 mb-1.5">What you get:</div>
        <ul className="list-disc pl-5 space-y-0.5 text-sm text-gray-700">
          {benefits.map((b, i) => <li key={i}>{b}</li>)}
        </ul>
      </div>
      {conditions.length > 0 && (
        <div>
          <div className="text-sm font-bold text-gray-900 mb-1.5">Conditions:</div>
          <ul className="list-disc pl-5 space-y-0.5 text-sm text-gray-700">
            {conditions.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </div>
      )}
      {promo.couponCode && !autoApply && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
          Enter the code <span className="font-mono font-bold">{promo.couponCode}</span> in
          the coupon field at checkout to apply this deal.
        </div>
      )}
      {autoApply && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800 text-center">
          Deal is applied automatically when all conditions are met.
        </div>
      )}
    </div>
  );
}

// ─── Main modal ────────────────────────────────────────────────────────

export function PromoDetailModal({
  promo,
  allMenuItems,
  deliveryZones = [],
  cartSubtotal,
  primaryColor,
  onAddFreebie,
  onAddBundle,
  onSwitchOrderType,
  onClose,
}: Props) {
  const meta = getPromoTypeMeta(promo.promotionType);
  const rules = useMemo(() => parseRuleConfig(promo), [promo]);
  const headline = promo.bannerHeadline?.trim() || promo.name;

  // Bundle types short-circuit straight to the composer — no shell.
  if (promo.promotionType === "meal_bundle" || promo.promotionType === "meal_bundle_speciality") {
    const groups = (rules.groups ?? rules.itemGroups ?? []) as RuleConfigGroup[];
    const bundlePrice = Number(rules.bundlePrice ?? rules.flatPrice ?? 0);
    return (
      <BundleComposerModal
        promoId={promo.id}
        promoName={promo.name}
        bundlePrice={bundlePrice}
        groups={groups}
        allMenuItems={allMenuItems}
        primaryColor={primaryColor}
        isSpeciality={promo.promotionType === "meal_bundle_speciality"}
        onAddBundle={onAddBundle}
        onClose={onClose}
      />
    );
  }

  // Free-item type short-circuits to the freebie picker.
  if (promo.promotionType === "free_item") {
    const eligible =
      collectGroupItems(rules.eligibleGroup, allMenuItems)
        .concat(
          (rules.groups ?? rules.itemGroups ?? []).flatMap((g) => collectGroupItems(g, allMenuItems)),
        );
    // Dedupe by id (a single item might appear via both itemIds and a
    // categoryIds inclusion).
    const dedupedMap = new Map<string, MenuItemLite>();
    for (const it of eligible) dedupedMap.set(it.id, it);
    return (
      <FreebiePromptModal
        promoName={promo.name}
        triggerAmount={Number(rules.triggerAmount ?? promo.minimumOrder ?? 0)}
        cartSubtotal={cartSubtotal}
        eligibleItems={Array.from(dedupedMap.values())}
        primaryColor={primaryColor}
        onAddFreebie={(item) => {
          onAddFreebie(item, promo.name);
          onClose();
        }}
        onClose={onClose}
      />
    );
  }

  // Common shell.
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white z-10 px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-0.5">
              {meta?.name ?? "Promo"}
            </div>
            <h2 className="text-lg font-bold text-gray-900 truncate">{headline}</h2>
            {promo.description && (
              <p className="text-sm text-gray-500 mt-0.5">{promo.description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 flex-shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          <SummaryPanel promo={promo} rules={rules} deliveryZones={deliveryZones ?? []} />
          <PromoBody
            promo={promo}
            rules={rules}
            allMenuItems={allMenuItems}
            deliveryZones={deliveryZones}
            primaryColor={primaryColor}
            onScrollToItem={(itemId) => scrollToMenuItem(itemId, onClose)}
          />
        </div>

        {/* Footer — varies per type */}
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-3 flex justify-end gap-2">
          {promo.promotionType === "free_delivery" && onSwitchOrderType ? (
            <button
              onClick={() => {
                onSwitchOrderType("delivery");
                onClose();
              }}
              className="text-white font-semibold px-4 py-2.5 rounded-xl text-sm"
              style={{ backgroundColor: primaryColor }}
            >
              Switch to delivery
            </button>
          ) : (
            <button
              onClick={onClose}
              className="text-white font-semibold px-4 py-2.5 rounded-xl text-sm"
              style={{ backgroundColor: primaryColor }}
            >
              {promo.promotionType === "percentage_off" || promo.promotionType === "bogo"
                ? "Start adding items"
                : "Got it"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Per-type body renderer ────────────────────────────────────────────

function PromoBody({
  promo,
  rules,
  allMenuItems,
  deliveryZones,
  primaryColor,
  onScrollToItem,
}: {
  promo: Promo;
  rules: RuleConfig;
  allMenuItems: MenuItemLite[];
  deliveryZones: DeliveryZoneLite[];
  primaryColor: string;
  onScrollToItem: (itemId: string) => void;
}) {
  const groups = (rules.groups ?? rules.itemGroups ?? []) as RuleConfigGroup[];

  const InfoCard = ({ children }: { children: React.ReactNode }) => (
    <div
      className="rounded-xl p-4 mb-4 text-sm"
      style={{ backgroundColor: `${primaryColor}10`, color: "#374151" }}
    >
      {children}
    </div>
  );

  const renderGroupItems = (group: RuleConfigGroup, badge?: string | null) => {
    const items = collectGroupItems(group, allMenuItems);
    if (items.length === 0) {
      return <p className="text-xs text-gray-400 italic">No eligible items available.</p>;
    }
    return (
      <div className="space-y-2">
        {items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            primaryColor={primaryColor}
            badge={badge ?? null}
            onClick={() => onScrollToItem(item.id)}
          />
        ))}
      </div>
    );
  };

  switch (promo.promotionType) {
    case "percentage_off": {
      const pct = rules.discountPercent ?? 0;
      return (
        <>
          <InfoCard>
            <strong>{pct}% off</strong>
            {promo.minimumOrder > 0 ? ` on orders of ${formatCurrency(promo.minimumOrder)}+` : " on your order"}.
            {groups.length > 0 && " Applies to the items below."}
            {promo.couponCode && (
              <>
                {" "}Enter code <span className="font-mono font-bold">{promo.couponCode}</span> at checkout.
              </>
            )}
          </InfoCard>
          {groups.map((g, i) => (
            <div key={g.id ?? i} className="mb-4">
              {g.label && <div className="font-semibold text-gray-900 text-sm mb-2">{g.label}</div>}
              {renderGroupItems(g)}
            </div>
          ))}
        </>
      );
    }

    case "free_delivery": {
      const pct = rules.deliveryFeeDiscountPercent ?? 100;
      return (
        <>
          <InfoCard>
            {pct === 100 ? <strong>Free delivery</strong> : <strong>{pct}% off delivery</strong>}
            {promo.minimumOrder > 0 ? ` on orders of ${formatCurrency(promo.minimumOrder)}+` : ""}.
          </InfoCard>
          {deliveryZones.length > 0 && (
            <div className="mb-4">
              <div className="font-semibold text-gray-900 text-sm mb-2">Eligible delivery zones</div>
              <div className="flex flex-wrap gap-2">
                {deliveryZones.map((z) => (
                  <span
                    key={z.id}
                    className="text-xs font-medium px-2.5 py-1 rounded-full"
                    style={{ backgroundColor: `${primaryColor}15`, color: primaryColor }}
                  >
                    {z.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      );
    }

    case "bogo": {
      const [paidGroup, freeGroup] = [groups[0], groups[1]];
      return (
        <>
          <InfoCard>
            Add a paid item from the first group — get one from the second group{" "}
            <strong>free</strong>.
          </InfoCard>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <div className="font-semibold text-gray-900 text-sm mb-2">{paidGroup?.label ?? "Add a paid item"}</div>
              {paidGroup ? renderGroupItems(paidGroup) : <p className="text-xs text-gray-400">No items.</p>}
            </div>
            <div>
              <div className="font-semibold text-gray-900 text-sm mb-2">{freeGroup?.label ?? "Get one free"}</div>
              {freeGroup ? renderGroupItems(freeGroup, "FREE") : <p className="text-xs text-gray-400">No items.</p>}
            </div>
          </div>
        </>
      );
    }

    case "fixed_cart": {
      const amount = rules.discountAmount ?? rules.fixedDiscountAmount ?? 0;
      return (
        <InfoCard>
          Spend{" "}
          <strong>
            {promo.minimumOrder > 0 ? formatCurrency(promo.minimumOrder) : "any amount"}
          </strong>{" "}
          to save <strong>{formatCurrency(amount)}</strong>.
        </InfoCard>
      );
    }

    case "payment_reward": {
      const pct = rules.discountPercent ?? 0;
      const method = rules.paymentMethod ?? "the eligible payment method";
      return (
        <InfoCard>
          Get <strong>{pct}% off</strong> when you pay with <strong>{method}</strong>
          {promo.minimumOrder > 0 ? ` on orders of ${formatCurrency(promo.minimumOrder)}+` : ""}.
        </InfoCard>
      );
    }

    case "buy_n_get_free": {
      return (
        <>
          <InfoCard>
            Add the qualifying items below — the cheapest one is <strong>free</strong> (per the
            promo's configured discount ladder).
          </InfoCard>
          {groups.map((g, i) => (
            <div key={g.id ?? i} className="mb-4">
              <div className="font-semibold text-gray-900 text-sm mb-2">
                {g.label ?? `Item ${i + 1}`}
              </div>
              {renderGroupItems(g)}
            </div>
          ))}
        </>
      );
    }

    case "free_dish_meal": {
      // Last group is typically the "free" group; we mark it with a FREE
      // badge as a hint. Owner's discountPercentages per-group is the
      // authoritative value, but this is a reasonable UX default.
      return (
        <>
          <InfoCard>
            Order the matching combo — one of the items below comes <strong>free</strong> with
            the meal.
          </InfoCard>
          {groups.map((g, i) => {
            const isFreeGroup = i === groups.length - 1;
            return (
              <div key={g.id ?? i} className="mb-4">
                <div className="font-semibold text-gray-900 text-sm mb-2">
                  {g.label ?? `Item ${i + 1}`}{" "}
                  {isFreeGroup && (
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full ml-1"
                      style={{ backgroundColor: `${primaryColor}22`, color: primaryColor }}
                    >
                      FREE
                    </span>
                  )}
                </div>
                {renderGroupItems(g, isFreeGroup ? "FREE" : null)}
              </div>
            );
          })}
        </>
      );
    }

    case "fixed_combo":
    case "percentage_combo": {
      const isPct = promo.promotionType === "percentage_combo";
      const value = isPct
        ? `${rules.discountPercent ?? 0}%`
        : formatCurrency(rules.discountAmount ?? rules.fixedDiscountAmount ?? 0);
      return (
        <>
          <InfoCard>
            Add ONE item from each of the groups below to save <strong>{value}</strong>.
          </InfoCard>
          {groups.map((g, i) => (
            <div key={g.id ?? i} className="mb-4">
              <div className="font-semibold text-gray-900 text-sm mb-2">
                {g.label ?? `Item ${i + 1}`}
              </div>
              {renderGroupItems(g)}
            </div>
          ))}
        </>
      );
    }

    default:
      return (
        <InfoCard>
          {promo.description ?? "Check the menu — eligible items will trigger this promo automatically."}
        </InfoCard>
      );
  }
}
