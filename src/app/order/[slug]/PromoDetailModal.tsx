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
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { useCurrencyFormat } from "@/lib/currency-context";
import { getPromoTypeMeta } from "@/lib/promo-types";
import { FreebiePromptModal } from "./FreebiePromptModal";
import { BundleComposerModal, type BundleCartItem } from "./BundleComposerModal";
import { GuidedPromoModal, type GuidedPromoPick } from "./GuidedPromoModal";

// ─── Types — kept loose; the modal accepts the same shape used by the
//     parent OrderingPageClient promoBanners prop, plus any extra fields
//     the engine attaches (notably ruleConfig). ────────────────────────

type RuleConfigGroup = {
  id?: string;
  label?: string;
  categoryIds?: string[];
  itemIds?: string[];
  menuItemIds?: string[]; // legacy alias
  variantIds?: string[];
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
  // BOGO / Buy-N strategy fields. "cheapest" | "most_expensive" |
  // "fixed_percent". Together with the two pct fields they spell out
  // exactly what gets discounted and how much.
  discountStrategy?: "cheapest" | "most_expensive" | "fixed_percent";
  cheapestDiscount?: number;       // % off the cheapest qualifying item
  mostExpensiveDiscount?: number;  // % off the most expensive
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
  variants?: { id: string; name: string; price: number }[];
  /** True when the item needs a choice before adding (has variants or modifier groups) — the
   *  promo panel then shows "Customize" (open the picker) instead of a quick "+ Add". */
  requiresChoice?: boolean;
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
  onAddFreebie: (item: MenuItemLite, promoName: string, variantId?: string | null) => void;
  /** Add a fully-built bundle to the cart as ONE consolidated line — see
   *  BundleComposerModal for the contract. */
  onAddBundle: (bundle: BundleCartItem) => void;
  /** Complete a guided multi-group promo (bogo / buy_n_get_free /
   *  free_dish_meal / combo): drop the chosen items into the cart (free-group
   *  picks tagged so the engine nets them) and let the engine auto-apply.
   *  See GuidedPromoModal for the contract. */
  onCompleteGuidedPromo: (picks: GuidedPromoPick[], promoName: string) => void;
  /** Whether the promo can be redeemed for the customer's CURRENT order time
   *  (ASAP now, or their chosen scheduled time). When false the modal shows a
   *  "can't redeem now — order for later" notice instead of the claim builder.
   *  Defaults to true so callers that don't time-gate behave as before. */
  usableNow?: boolean;
  /** Human "11:00 PM–4:00 AM" window label for the not-available-now notice. */
  windowLabel?: string | null;
  /** Switch the cart to a scheduled ("order for later") time inside the promo's
   *  window so a time-restricted promo can be pre-ordered. */
  onOrderForLater?: () => void;
  /** Switch the page-level order type — used by the free_delivery panel's
   *  "Switch to delivery" footer button. */
  onSwitchOrderType?: (next: "pickup" | "delivery") => void;
  /** Open the item-config sheet for the clicked item (closing this modal
   *  in the process). Lets the customer pick size / modifiers / quantity
   *  before adding to cart — necessary because a "Pizza" can't be added
   *  blindly without picking a size. Falls back to scroll-to-menu-item
   *  when not provided. */
  onOpenItem?: (menuItemId: string) => void;
  /** id→name lookup so the eligible-items panel can GROUP items by their menu category
   *  (Fabrizio: they used to be all mixed together). */
  allVisibleCategories?: { id: string; name: string }[];
  /** Quick-add a SIMPLE eligible item (no variants/modifiers) straight to the cart WITHOUT
   *  leaving the promo screen. Items with options use onOpenItem (the customizer) instead. */
  onAddItemDirect?: (menuItemId: string) => void;
  onClose: () => void;
}

// Promo types whose claim flow is a guided, slot-by-slot picker (one item
// per group + the free item) rather than the informational read-only body.
// Bundles (meal_bundle*) and free_item have their own dedicated composers and
// are handled before this set is consulted.
const GUIDED_PROMO_TYPES = new Set<string>([
  "bogo",
  "buy_n_get_free",
  "free_dish_meal",
  "fixed_combo",
  "percentage_combo",
]);

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

/**
 * Freebie options for a group, variant-aware. For each eligible item, the
 * `variants` are narrowed to only the targeted sizes when the group selected
 * specific variant IDs; whole-item / category selection keeps all sizes. Lets
 * the claim modal offer the customer a "which size?" choice. Luigi 2026-06-07.
 */
function collectFreebieOptions(group: RuleConfigGroup | undefined, allMenuItems: MenuItemLite[]): MenuItemLite[] {
  if (!group) return [];
  const idSet = new Set<string>([...(group.itemIds ?? []), ...(group.menuItemIds ?? [])]);
  const catSet = new Set<string>(group.categoryIds ?? []);
  const variantIdSet = new Set<string>(group.variantIds ?? []);
  const out: MenuItemLite[] = [];
  for (const mi of allMenuItems) {
    const wholeItem = idSet.has(mi.id) || (!!mi.categoryId && catSet.has(mi.categoryId));
    if (wholeItem) {
      out.push(mi);
      continue;
    }
    // Item not whole-selected — include it only for its specifically targeted sizes.
    const targeted = (mi.variants ?? []).filter((v) => variantIdSet.has(v.id));
    if (targeted.length) out.push({ ...mi, variants: targeted });
  }
  return out;
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
  const formatCurrency = useCurrencyFormat();
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

// Eligible-items row WITH a quick "+ Add" (simple items) or "Customize" (items with options →
// opens the size/modifier picker). Used by the promo "Get it now" panel. Fabrizio 2026-06-25.
function EligibleItemRow({
  item,
  primaryColor,
  badge,
  onOpen,
  onAdd,
  addLabel,
  customizeLabel,
}: {
  item: MenuItemLite;
  primaryColor: string;
  badge?: string | null;
  onOpen: () => void;
  onAdd?: () => void;
  addLabel: string;
  customizeLabel: string;
}) {
  const formatCurrency = useCurrencyFormat();
  return (
    <div className="w-full flex items-center gap-2 p-2 rounded-xl border border-gray-100 hover:bg-gray-50 transition">
      <button type="button" onClick={onOpen} className="flex-1 flex items-center gap-3 text-left min-w-0">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
        ) : (
          <div className="w-12 h-12 rounded-lg flex-shrink-0" style={{ background: `linear-gradient(135deg, ${primaryColor}22, #f3f4f6)` }} />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gray-900 truncate">{item.name}</div>
          <div className="text-xs text-gray-500">{formatCurrency(item.price)}</div>
        </div>
      </button>
      {badge ? (
        <span className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: `${primaryColor}22`, color: primaryColor }}>
          {badge}
        </span>
      ) : null}
      <button
        type="button"
        onClick={onAdd ?? onOpen}
        className="flex-shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition hover:opacity-90"
        style={onAdd ? { backgroundColor: primaryColor, color: "#fff" } : { backgroundColor: `${primaryColor}18`, color: primaryColor }}
      >
        {onAdd ? `+ ${addLabel}` : customizeLabel}
      </button>
    </div>
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

type TFunction = ReturnType<typeof useTranslations<"customer.promoDetail">>;

function buildWhatYouGet(promo: Promo, rules: RuleConfig, t: TFunction, formatCurrency: (n: number) => string): string[] {
  const out: string[] = [];
  const pct = rules.discountPercent;
  const amt = rules.discountAmount;
  const bundlePrice = rules.bundlePrice;
  switch (promo.promotionType) {
    case "percentage_off":
      out.push(pct ? t("whatYouGetPercentageOff", { pct }) : t("whatYouGetPercentageOffDefault"));
      break;
    case "free_delivery":
      out.push(t("whatYouGetFreeDelivery"));
      break;
    case "bogo":
      out.push(t("whatYouGetBogo"));
      break;
    case "fixed_cart":
      out.push(amt ? t("whatYouGetFixedCart", { amount: formatCurrency(amt) }) : t("whatYouGetFixedCartDefault"));
      break;
    case "payment_reward":
      out.push(pct ? t("whatYouGetPaymentReward", { pct }) : t("whatYouGetPaymentRewardDefault"));
      break;
    case "free_item":
      out.push(t("whatYouGetFreeItem"));
      break;
    case "meal_bundle":
    case "meal_bundle_speciality":
      out.push(bundlePrice ? t("whatYouGetMealBundle", { price: formatCurrency(bundlePrice) }) : t("whatYouGetMealBundleDefault"));
      break;
    case "buy_n_get_free":
      out.push(t("whatYouGetBuyNGetFree"));
      break;
    case "free_dish_meal":
      out.push(t("whatYouGetFreeDishMeal"));
      break;
    case "fixed_combo":
      out.push(amt ? t("whatYouGetFixedCombo", { amount: formatCurrency(amt) }) : t("whatYouGetFixedComboDefault"));
      break;
    case "percentage_combo":
      out.push(pct ? t("whatYouGetPercentageCombo", { pct }) : t("whatYouGetPercentageComboDefault"));
      break;
    default:
      out.push(promo.description ?? promo.name);
  }
  return out;
}

function buildConditions(promo: Promo, zones: DeliveryZoneLite[], t: TFunction, formatCurrency: (n: number) => string): string[] {
  const out: string[] = [];

  // Frequency
  if (promo.onceLifetimePerClient) out.push(t("conditionOnceLifetime"));
  else out.push(t("conditionOnceInCart"));

  // Cart value
  if (promo.minimumOrder > 0) {
    out.push(t("conditionMinOrder", { amount: formatCurrency(promo.minimumOrder) }));
  }

  // Order channel
  if (promo.orderType && promo.orderType !== "both") {
    const channels = promo.orderType.startsWith("[")
      ? safeJsonArray(promo.orderType).map((s) => formatChannel(s, t)).join(", ")
      : formatChannel(promo.orderType, t);
    out.push(t("conditionOrderType", { channels }));
  }

  // Client type
  if (promo.customerType && promo.customerType !== "any") {
    const label =
      promo.customerType === "new" ? t("conditionNewCustomers") :
      promo.customerType === "returning" ? t("conditionReturningCustomers") :
      promo.customerType === "member" ? t("conditionMembersOnly") : promo.customerType;
    out.push(label);
  }

  // Payment
  const paymentSlugs = safeJsonArray(promo.paymentMethodSlugs);
  if (paymentSlugs.length > 0) {
    out.push(t("conditionPaymentMethod", { methods: paymentSlugs.map((s) => formatPayment(s, t)).join(", ") }));
  }

  // Delivery area
  const zoneIds = safeJsonArray(promo.deliveryZoneIds);
  if (zoneIds.length > 0) {
    const zoneNames = zoneIds
      .map((id) => zones.find((z) => z.id === id)?.name ?? null)
      .filter(Boolean) as string[];
    if (zoneNames.length > 0) {
      out.push(t("conditionDeliveryZones", { zones: zoneNames.join(", ") }));
    } else {
      out.push(t("conditionDeliveryZonesRestricted"));
    }
  }

  // Day-of-week
  const days = safeJsonArray(promo.daysOfWeek).map((d) => parseInt(d, 10)).filter((n) => Number.isFinite(n));
  if (days.length > 0 && days.length < 7) {
    out.push(t("conditionAvailableOn", { days: days.sort((a, b) => a - b).map((d) => DAY_NAMES[d]).join(", ") }));
  }

  // Hour-of-day
  if (typeof promo.usableHourStart === "number" && typeof promo.usableHourEnd === "number") {
    out.push(t("conditionAvailableBetween", { start: minToHHMM(promo.usableHourStart), end: minToHHMM(promo.usableHourEnd) }));
  }

  // Expiration
  if (promo.startsAt && new Date(promo.startsAt) > new Date()) {
    out.push(t("conditionStarts", { date: new Date(promo.startsAt).toLocaleDateString() }));
  }
  if (promo.endsAt) {
    out.push(t("conditionExpires", { date: new Date(promo.endsAt).toLocaleDateString() }));
  }

  return out;
}

function formatChannel(slug: string, t: TFunction): string {
  const map: Record<string, string> = {
    pickup: t("channelPickup"),
    delivery: t("channelDelivery"),
    dine_in: t("channelDineIn"),
    dinein: t("channelDineIn"),
    catering: t("channelCatering"),
    takeout: t("channelTakeout"),
    take_out: t("channelTakeout"),
  };
  return map[slug] ?? slug;
}

function formatPayment(slug: string, t: TFunction): string {
  const map: Record<string, string> = {
    cash: t("paymentCash"),
    card_in_person: t("paymentCardInPerson"),
    online_card: t("paymentOnlineCard"),
    paypal: t("paymentPaypal"),
  };
  return map[slug] ?? slug;
}

function SummaryPanel({ promo, rules, deliveryZones }: {
  promo: Promo;
  rules: RuleConfig;
  deliveryZones: DeliveryZoneLite[];
}) {
  const t = useTranslations("customer.promoDetail");
  const formatCurrency = useCurrencyFormat();
  const benefits = buildWhatYouGet(promo, rules, t, formatCurrency);
  const conditions = buildConditions(promo, deliveryZones, t, formatCurrency);
  const autoApply = promo.autoApply !== false;
  return (
    <div className="space-y-4 mb-5 pb-5 border-b border-gray-100">
      <div>
        <div className="text-sm font-bold text-gray-900 mb-1.5">{t("whatYouGet")}</div>
        <ul className="list-disc pl-5 space-y-0.5 text-sm text-gray-700">
          {benefits.map((b, i) => <li key={i}>{b}</li>)}
        </ul>
      </div>
      {conditions.length > 0 && (
        <div>
          <div className="text-sm font-bold text-gray-900 mb-1.5">{t("conditions")}</div>
          <ul className="list-disc pl-5 space-y-0.5 text-sm text-gray-700">
            {conditions.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </div>
      )}
      {promo.couponCode && !autoApply && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
          {t("couponInstructionBefore")}{" "}
          <span className="font-mono font-bold">{promo.couponCode}</span>{" "}
          {t("couponInstructionAfter")}
        </div>
      )}
      {autoApply && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800 text-center">
          {t("autoApplyNote")}
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
  usableNow = true,
  windowLabel,
  onOrderForLater,
  onAddFreebie,
  onAddBundle,
  onCompleteGuidedPromo,
  onSwitchOrderType,
  onOpenItem,
  allVisibleCategories,
  onAddItemDirect,
  onClose,
}: Props) {
  const t = useTranslations("customer.promoDetail");
  const meta = getPromoTypeMeta(promo.promotionType);
  const rules = useMemo(() => parseRuleConfig(promo), [promo]);
  const headline = promo.bannerHeadline?.trim() || promo.name;

  // Time-restricted promo, but the customer's current order time is outside
  // the window → don't let them build a claim that won't discount. Show a
  // "redeem later" notice with a one-tap "Order for later" that schedules the
  // cart inside the window (then this same modal flips to the builder).
  // Luigi 2026-06-07: keep the banner selectable; gate at redeem time.
  if (!usableNow) {
    return (
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
          <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-0.5">
                {meta?.name ?? t("promo")}
              </div>
              <h2 className="text-lg font-bold text-gray-900 truncate">{headline}</h2>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 flex-shrink-0" aria-label={t("close")}>
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-5">
            <div
              className="rounded-xl p-4 text-sm"
              style={{ backgroundColor: `${primaryColor}10`, color: "#374151" }}
            >
              <div className="font-semibold text-gray-900 mb-1">
                ⏰ {windowLabel ? t("notUsableNowTitleWindow", { window: windowLabel }) : t("notUsableNowTitle")}
              </div>
              <p>{t("notUsableNowBody")}</p>
            </div>
          </div>
          <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="font-semibold px-4 py-2.5 rounded-xl text-sm border border-gray-200 text-gray-700 hover:bg-gray-50"
            >
              {t("maybeLater")}
            </button>
            {onOrderForLater && (
              <button
                onClick={onOrderForLater}
                className="text-white font-semibold px-4 py-2.5 rounded-xl text-sm"
                style={{ backgroundColor: primaryColor }}
              >
                {t("orderForLater")}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

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
      collectFreebieOptions(rules.eligibleGroup, allMenuItems)
        .concat(
          (rules.groups ?? rules.itemGroups ?? []).flatMap((g) => collectFreebieOptions(g, allMenuItems)),
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
        onAddFreebie={(item, variantId) => {
          onAddFreebie(item, promo.name, variantId);
          onClose();
        }}
        onClose={onClose}
      />
    );
  }

  // Set-completion types get the guided slot picker — walk the customer
  // through one item per group + the free item, complete in ONE place (no
  // backing out to the full menu). Only when groups are configured; otherwise
  // fall through to the informational body below. The engine still auto-applies
  // the discount once the qualifying items land in the cart.
  if (GUIDED_PROMO_TYPES.has(promo.promotionType)) {
    const groups = (rules.groups ?? rules.itemGroups ?? []) as RuleConfigGroup[];
    if (groups.length > 0) {
      // BOGO's free slot can be a partial discount; surface it as a badge.
      // Other guided types are fully free (or combo-discounted as a whole).
      let discountPct: number | undefined;
      const strategy = rules.discountStrategy ?? "cheapest";
      if (promo.promotionType === "bogo") {
        discountPct =
          strategy === "most_expensive"
            ? Number(rules.mostExpensiveDiscount ?? 100)
            : Number(rules.cheapestDiscount ?? 100);
      }
      return (
        <GuidedPromoModal
          promoId={promo.id}
          promoName={promo.name}
          promotionType={promo.promotionType}
          groups={groups}
          allMenuItems={allMenuItems}
          primaryColor={primaryColor}
          discountPct={discountPct}
          discountStrategy={strategy}
          onComplete={(picks, promoName) => {
            onCompleteGuidedPromo(picks, promoName);
            onClose();
          }}
          onClose={onClose}
        />
      );
    }
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
              {meta?.name ?? t("promo")}
            </div>
            <h2 className="text-lg font-bold text-gray-900 truncate">{headline}</h2>
            {promo.description && (
              <p className="text-sm text-gray-500 mt-0.5">{promo.description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 flex-shrink-0"
            aria-label={t("close")}
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
            categoryNames={allVisibleCategories}
            onAddItem={onAddItemDirect}
            onScrollToItem={(itemId) => {
              // Prefer onOpenItem (opens the item-config sheet — better UX
              // because customer immediately gets size/mods/qty picker)
              // and fall through to scroll-to-menu-item when not wired.
              if (onOpenItem) onOpenItem(itemId);
              else scrollToMenuItem(itemId, onClose);
            }}
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
              {t("switchToDelivery")}
            </button>
          ) : (
            <button
              onClick={onClose}
              className="text-white font-semibold px-4 py-2.5 rounded-xl text-sm"
              style={{ backgroundColor: primaryColor }}
            >
              {promo.promotionType === "percentage_off" || promo.promotionType === "bogo"
                ? t("startAddingItems")
                : t("gotIt")}
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
  categoryNames,
  onAddItem,
  onScrollToItem,
}: {
  promo: Promo;
  rules: RuleConfig;
  allMenuItems: MenuItemLite[];
  deliveryZones: DeliveryZoneLite[];
  primaryColor: string;
  categoryNames?: { id: string; name: string }[];
  onAddItem?: (menuItemId: string) => void;
  onScrollToItem: (itemId: string) => void;
}) {
  const t = useTranslations("customer.promoDetail");
  const formatCurrency = useCurrencyFormat();
  const groups = (rules.groups ?? rules.itemGroups ?? []) as RuleConfigGroup[];

  const InfoCard = ({ children }: { children: React.ReactNode }) => (
    <div
      className="rounded-xl p-4 mb-4 text-sm"
      style={{ backgroundColor: `${primaryColor}10`, color: "#374151" }}
    >
      {children}
    </div>
  );

  const catNameOf = (id?: string) => (id ? categoryNames?.find((c) => c.id === id)?.name ?? null : null);
  const renderGroupItems = (group: RuleConfigGroup, badge?: string | null) => {
    const items = collectGroupItems(group, allMenuItems);
    if (items.length === 0) {
      return <p className="text-xs text-gray-400 italic">{t("noEligibleItems")}</p>;
    }
    // GROUP the eligible items by their menu category (Fabrizio: they used to be all mixed
    // together). Headers only show when there's more than one named category.
    const byCat = new Map<string, MenuItemLite[]>();
    const order: string[] = [];
    for (const it of items) {
      const key = it.categoryId ?? "__none";
      if (!byCat.has(key)) { byCat.set(key, []); order.push(key); }
      byCat.get(key)!.push(it);
    }
    const showHeaders = order.length > 1 && order.some((k) => k !== "__none" && catNameOf(k));
    return (
      <div className="space-y-3">
        {order.map((key) => {
          const label = key === "__none" ? null : catNameOf(key);
          return (
            <div key={key} className="space-y-2">
              {showHeaders && label ? (
                <div className="px-1 text-xs font-bold uppercase tracking-wide text-gray-500">{label}</div>
              ) : null}
              {byCat.get(key)!.map((item) => (
                <EligibleItemRow
                  key={item.id}
                  item={item}
                  primaryColor={primaryColor}
                  badge={badge ?? null}
                  onOpen={() => onScrollToItem(item.id)}
                  onAdd={onAddItem && !item.requiresChoice ? () => onAddItem(item.id) : undefined}
                  addLabel={t("addOne")}
                  customizeLabel={t("customize")}
                />
              ))}
            </div>
          );
        })}
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
            {promo.minimumOrder > 0
              ? ` on orders of ${formatCurrency(promo.minimumOrder)}+`
              : " on your order"}
            {"."}
            {groups.length > 0 && t("percentageOffAppliesToItems")}
            {promo.couponCode && (
              <>{t("percentageOffCoupon", { code: promo.couponCode })}</>
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
            {pct === 100 ? <strong>{t("freeDeliveryFull")}</strong> : <strong>{t("freeDeliveryPartial", { pct })}</strong>}
            {promo.minimumOrder > 0 ? t("freeDeliveryOnMinOrder", { minOrder: formatCurrency(promo.minimumOrder) }) : ""}.
          </InfoCard>
          {deliveryZones.length > 0 && (
            <div className="mb-4">
              <div className="font-semibold text-gray-900 text-sm mb-2">{t("eligibleDeliveryZones")}</div>
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
      // Render a clear "cheapest item gets X% off" hint based on the
      // configured discount strategy. The engine reads `discountStrategy`
      // ("cheapest" | "most_expensive" | "fixed_percent") and
      // cheapestDiscount / mostExpensiveDiscount (both as %).
      const strategy = (rules.discountStrategy ?? "cheapest") as string;
      const cheapestPct = Number(rules.cheapestDiscount ?? 100);
      const expPct = Number(rules.mostExpensiveDiscount ?? 100);
      let strategyHint = t("bogoCheapestItemDefault");
      if (strategy === "cheapest") {
        strategyHint = cheapestPct >= 100
          ? t("bogoCheapestFree")
          : t("bogoCheapestDiscount", { pct: cheapestPct });
      } else if (strategy === "most_expensive") {
        strategyHint = expPct >= 100
          ? t("bogoMostExpensiveFree")
          : t("bogoMostExpensiveDiscount", { pct: expPct });
      }
      const freeBadge = strategy === "most_expensive"
        ? (expPct >= 100 ? "FREE" : `${expPct}% off`)
        : (cheapestPct >= 100 ? "FREE" : `${cheapestPct}% off`);
      return (
        <>
          <InfoCard>
            {t("bogoInfo", { badge: freeBadge.toLowerCase() === "free" ? freeBadge.toLowerCase() : freeBadge })}
            <div className="mt-1.5 text-[11px] text-gray-500">{strategyHint}</div>
          </InfoCard>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <div className="font-semibold text-gray-900 text-sm mb-2">{paidGroup?.label ?? t("bogoAddPaidItem")}</div>
              {paidGroup ? renderGroupItems(paidGroup) : <p className="text-xs text-gray-400">{t("noItems")}</p>}
            </div>
            <div>
              <div className="font-semibold text-gray-900 text-sm mb-2">{freeGroup?.label ?? t("bogoGetOneFree")}</div>
              {freeGroup ? renderGroupItems(freeGroup, freeBadge) : <p className="text-xs text-gray-400">{t("noItems")}</p>}
            </div>
          </div>
        </>
      );
    }

    case "fixed_cart": {
      const amount = rules.discountAmount ?? rules.fixedDiscountAmount ?? 0;
      return (
        <InfoCard>
          {promo.minimumOrder > 0
            ? t("fixedCartInfo", { minOrder: formatCurrency(promo.minimumOrder), amount: formatCurrency(amount) })
            : t("fixedCartInfoAnyAmount", { amount: formatCurrency(amount) })}
        </InfoCard>
      );
    }

    case "payment_reward": {
      const pct = rules.discountPercent ?? 0;
      const method = rules.paymentMethod ?? t("paymentMethodDefault");
      return (
        <InfoCard>
          {promo.minimumOrder > 0
            ? t("paymentRewardInfo", { pct, method, minOrder: formatCurrency(promo.minimumOrder) })
            : t("paymentRewardInfoNoMin", { pct, method })}
        </InfoCard>
      );
    }

    case "buy_n_get_free": {
      return (
        <>
          <InfoCard>
            {t("buyNGetFreeInfo")}
          </InfoCard>
          {groups.map((g, i) => (
            <div key={g.id ?? i} className="mb-4">
              <div className="font-semibold text-gray-900 text-sm mb-2">
                {g.label ?? t("itemLabel", { n: i + 1 })}
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
            {t("freeDishMealInfo")}
          </InfoCard>
          {groups.map((g, i) => {
            const isFreeGroup = i === groups.length - 1;
            return (
              <div key={g.id ?? i} className="mb-4">
                <div className="font-semibold text-gray-900 text-sm mb-2">
                  {g.label ?? t("itemLabel", { n: i + 1 })}{" "}
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
            {t("comboInfo", { value })}
          </InfoCard>
          {groups.map((g, i) => (
            <div key={g.id ?? i} className="mb-4">
              <div className="font-semibold text-gray-900 text-sm mb-2">
                {g.label ?? t("itemLabel", { n: i + 1 })}
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
          {promo.description ?? t("defaultPromoInfo")}
        </InfoCard>
      );
  }
}
