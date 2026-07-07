"use client";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { trackEvent } from "@/lib/visit-tracker";
import {
  ShoppingCart, MapPin, Phone, Clock, Plus, Minus, X,
  AlertCircle, Tag, Loader2, ChevronDown, Star, Info, Calendar,
  Truck, ShoppingBag, ChevronLeft, ChevronRight,
  UserCircle, LogIn, Search, Utensils, Package, Gift, Trash2,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { CurrencyProvider, useCurrencyFormat } from "@/lib/currency-context";
import { formatTime as formatHHMM, formatMinutes, type HoursFormat } from "@/lib/format-time";
import { methodsForOrderType, paymentValueToSlug } from "@/lib/payment-methods";
import { localDowAndHHMM, liveOpenStatus, nextOpenAt, parseLocalDateTimeInTz, rowIntervals, dateKeyInTimezone } from "@/lib/restaurant-hours";
import { holidayEffectForDay, canonicalHolidayService } from "@/lib/holiday-rules";
import { resolveServiceHours, type ServiceKind } from "@/lib/service-hours";
import { resolveSlotModes } from "@/lib/slot-modes";
import { isVisibleNow } from "@/lib/menu-visibility";
import { hasFulfilWindow, isFulfilableAt, fulfilWindowLabel, combinedFulfilConstraint, fulfilWindowsOf, windowMatches } from "@/lib/menu-fulfilment";

/** Convert minutes-since-midnight (0..1440) into "HH:MM" 24-hour format.
 *  Used by the promo-banner usability-window label so a 12-3 PM lunch
 *  promo shows up as "12:00–15:00" on the card. */
function minutesToHHMM(minutes: number): string {
  const m = Math.max(0, Math.min(1440, Math.floor(minutes)));
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { parseTheme, bannerHeightPx } from "@/lib/theme";
import {
  PizzaBuilder, parsePizzaConfig, pizzaCustomizationToModifiers,
  PizzaCustomization, PizzaAddResult, PizzaConfig,
} from "./PizzaBuilder";
import { geocodeAddress, findZoneForPoint, type ZoneLike } from "@/lib/geocode";
import {
  resolveDeliveryAddressConfig,
  DELIVERY_FIELD_KEYS,
  type DeliveryFieldKey,
  type DeliveryAddressData,
} from "@/lib/delivery-address-fields";
import { CheckoutModal } from "./CheckoutModal";
import { PromotionalPopup, type OrderingPopupConfig } from "./PromotionalPopup";
import { ReservationModal } from "./ReservationModal";
import { PROMO_STOCK_IMAGES } from "./promo-stock-data";
import { PromoDetailModal } from "./PromoDetailModal";
import { promoUsableNow, nextUsableSlot } from "@/lib/promo-window";
import type { BundleCartItem } from "./BundleComposerModal";
import { ComboComposerModal, type ComboCartResult } from "./ComboComposerModal";
import { parseComboConfig } from "@/lib/combo";
import { evaluateApplicableFees, type ServiceFeeRow } from "@/lib/service-fees";
import { useTranslations } from "next-intl";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { SocialFooter } from "./SocialFooter";
import { PoweredByCredit } from "@/components/PoweredByFeeFree";
import type { PoweredByCredit as PoweredByCreditValue } from "@/lib/white-label";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ModOption { id: string; name: string; priceAdjustment: number; isDefault: boolean; isAvailable: boolean }
interface ModGroup  { id: string; name: string; description?: string; required: boolean; minSelect: number; maxSelect: number; maxPerOption?: number; isHidden?: boolean; libraryGroupId?: string | null; options: ModOption[] }
interface ItemVariant { id: string; name: string; price: number; isDefault: boolean; sortOrder: number }
// GloriaFood-style scheduled visibility fields (shared by items + categories).
interface VisibilityProps {
  isHidden: boolean;
  visibilityMode?: string | null;
  visibleUntil?: string | null;
  visibleStartDate?: string | null;
  visibleEndDate?: string | null;
  visibleDays?: string | null;
  visibleFrom?: string | null;
  visibleTo?: string | null;
  /** Multi-window show_only_from list (cmr803ovq c); resolved by isVisibleNow. */
  visibleWindows?: unknown;
}
interface MenuItem extends VisibilityProps {
  id: string; name: string; description: string; price: number;
  imageUrl?: string; isFeatured: boolean; isSoldOut: boolean;
  /** Pin-to-top featured strip (Fabrizio cmr80joh0). */
  pinnedToTop?: boolean;
  hasVariants: boolean; forPickup: boolean; forDelivery: boolean;
  availableDays?: number[]; availableFrom?: string; availableTo?: string;
  // Phase 2 Fulfilment Time: item visible all week, orderable only for these
  // days/times (forces scheduling, like catering). null = no restriction.
  fulfilDays?: string | null; fulfilFrom?: string | null; fulfilTo?: string | null;
  /** Multi-window fulfilment list (cmr803ovq c); resolved by fulfilWindowsOf. */
  fulfilWindows?: unknown;
  modifierGroups: ModGroup[]; variants: ItemVariant[];
  categoryId?: string;
  pizzaConfig?: string;
}
interface Category extends VisibilityProps {
  id: string; name: string; imageUrl?: string; modifierGroups: ModGroup[]; menuItems: MenuItem[];
  /** Category-level service restriction (Fabrizio cmr803ovq) — mirrors the
   *  item flags; missing/undefined = unrestricted (legacy rows). */
  forPickup?: boolean; forDelivery?: boolean;
  /** Optional header accent color overriding the theme color (cmr80joh0). */
  accentColor?: string | null;
  /** Pin this category to the top "Featured" strip (Fabrizio cmr80joh0). */
  pinnedToTop?: boolean;
}
interface CartItem {
  menuItem: MenuItem; variant?: ItemVariant; quantity: number;
  selectedMods: Record<string, string[]>; notes: string; lineTotal: number;
  /** Present for pizza items — replaces selectedMods for serialisation */
  pizzaCustomization?: PizzaCustomization;
  /** Unit price for a qty-1 pizza item; used by updateQty */
  unitPrice?: number;
  /** Bundle line item (Promo Type 8 / 13) — when true, `bundleItems`
   *  carries the child picks and the cart UI renders this as ONE
   *  consolidated parent row with indented children. Quantity is
   *  always 1 for bundles (re-adding the bundle = build it again). */
  isBundle?: boolean;
  bundleItems?: Array<{
    menuItemId: string;
    variantId?: string;
    name: string;
    variantName?: string;
    modifiers?: Array<{ name: string; priceAdjustment?: number }>;
    notes?: string;
    specialityFee?: number;
    /** Add-on/extra surcharge for a combo child (0 unless the combo charges
     *  for extras). Separate from specialityFee (the owner's item upcharge). */
    extrasFee?: number;
    /** Combo component that's a customized pizza — carries the builder
     *  selections (half/half, toppings) so the kitchen ticket shows them. */
    pizzaCustomization?: PizzaCustomization;
  }>;
  /** True when this line is a COMBO menu item (vs a promo bundle). Renders the
   *  same consolidated parent + children, but priced as a menu item. */
  isCombo?: boolean;
  /** Source promo id + name — preserved so the receipt + kitchen ticket
   *  can label the parent row with the bundle's promo name. */
  bundlePromoId?: string;
  bundlePromoName?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** The "+ …" build labels shown under a cart line: pizza-builder selections
 *  (half/half, toppings, sauce, cheese) via pizzaCustomizationToModifiers, or
 *  plain modifier-group picks. Shared by the cart drawer AND the checkout
 *  summary so both show the SAME build — the checkout summary was dropping
 *  pizza toppings entirely (Luigi 2026-07-06). Bundles render their children
 *  separately (bundleItems), so they contribute no labels here. */
function cartItemModifierLabels(ci: CartItem): string[] {
  if (ci.isBundle) return [];
  if (ci.pizzaCustomization) {
    return pizzaCustomizationToModifiers(
      ci.pizzaCustomization,
      ci.menuItem.modifierGroups as any,
    ).map((m) => m.name);
  }
  const out: string[] = [];
  for (const [gId, optIds] of Object.entries(ci.selectedMods)) {
    const g = ci.menuItem.modifierGroups.find((grp) => grp.id === gId);
    for (const optId of optIds) {
      const opt = g?.options.find((o) => o.id === optId);
      if (opt) out.push(opt.name);
    }
  }
  return out;
}

const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

/** Human-readable availability window for a day/time-limited item, e.g.
 *  "Mon, Fri · 12:00 – 15:00". Day names come from Intl in the browser
 *  locale. Used by the visible-but-purchase-restricted treatment
 *  (reseller report cmpxec829). */
function itemAvailabilityWindow(item: MenuItem, hoursFmt: "12h" | "24h"): string {
  const parts: string[] = [];
  try {
    if (item.availableDays) {
      const days: number[] = typeof item.availableDays === "string" ? JSON.parse(item.availableDays) : item.availableDays;
      if (Array.isArray(days) && days.length > 0 && days.length < 7) {
        // 2021-08-01 was a Sunday — offsetting by the dow index yields each
        // weekday name in the customer's own locale.
        const fmt = new Intl.DateTimeFormat(undefined, { weekday: "short", timeZone: "UTC" });
        parts.push([...days].sort().map((d) => fmt.format(new Date(Date.UTC(2021, 7, 1 + d)))).join(", "));
      }
    }
  } catch { /* malformed days JSON — skip the day part */ }
  if (item.availableFrom && item.availableTo) {
    parts.push(`${formatHHMM(item.availableFrom, hoursFmt)} – ${formatHHMM(item.availableTo, hoursFmt)}`);
  }
  return parts.join(" · ");
}

/** Phase 2 Fulfilment Time window label, e.g. "Tue, Wed · 12:00 – 15:00".
 *  Day names from Intl in the browser locale; times honour 12h/24h. Used for
 *  the "Order ahead — available …" badge on a fulfilment-restricted item. */
function itemFulfilWindow(item: MenuItem, hoursFmt: "12h" | "24h"): string {
  const fmt = new Intl.DateTimeFormat(undefined, { weekday: "short", timeZone: "UTC" });
  return fulfilWindowLabel(
    item,
    // 2021-08-01 was a Sunday — offsetting by the dow index yields each weekday.
    (d) => fmt.format(new Date(Date.UTC(2021, 7, 1 + d))),
    (hhmm) => formatHHMM(hhmm, hoursFmt),
  );
}

/** Earliest 15-min slot from `from` at which EVERY supplied fulfilment item is
 *  simultaneously orderable (restaurant tz). null = already orderable at `from`,
 *  or no item is restricted, or none opens within 14 days. Drives the forced
 *  schedule minimum when the cart holds fulfilment-restricted items. */
function earliestCombinedFulfilSlot(items: MenuItem[], from: Date, timezone?: string): Date | null {
  const restricted = items.filter(hasFulfilWindow);
  if (restricted.length === 0) return null;
  if (restricted.every((it) => isFulfilableAt(it, from, timezone))) return null;
  const q = 15 * 60 * 1000;
  let t = Math.ceil(from.getTime() / q) * q;
  const limit = from.getTime() + 14 * 24 * 3600 * 1000;
  while (t <= limit) {
    const d = new Date(t);
    if (restricted.every((it) => isFulfilableAt(it, d, timezone))) return d;
    t += q;
  }
  return null;
}

/** The restricted cart items that, together, share NO orderable day/time, so
 *  they can't be fulfilled in one order (e.g. a Monday-only + a Tuesday-only
 *  special). Returns [] when the fulfilment items CAN share a slot or there are
 *  fewer than two. Drives the "can't be ordered together" prompt. */
function conflictingFulfilItems(items: MenuItem[], from: Date, timezone?: string): MenuItem[] {
  const restricted = items.filter(hasFulfilWindow);
  if (restricted.length < 2) return [];
  // Orderable together right now → fine.
  if (restricted.every((it) => isFulfilableAt(it, from, timezone))) return [];
  // A future slot where all are simultaneously orderable → fine (just schedule).
  if (earliestCombinedFulfilSlot(restricted, from, timezone) !== null) return [];
  return restricted;
}

function isItemAvailableNow(item: MenuItem, timezone?: string): boolean {
  // Day-of-week and HH:MM must be computed in the RESTAURANT's local
  // timezone so an out-of-town customer (e.g. delivery scheduled from
  // a different time zone) still sees the right "lunch only" / "Friday
  // pizza" availability windows. Falls back to browser-local when no
  // timezone is supplied — matches pre-2026-05-30 behaviour.
  const { dow, hhmm } = localDowAndHHMM(new Date(), timezone);
  if (item.availableDays) {
    const days: number[] = typeof item.availableDays === "string" ? JSON.parse(item.availableDays) : item.availableDays;
    if (!days.includes(dow)) return false;
  }
  if (item.availableFrom && item.availableTo) {
    // String comparisons work because every value is zero-padded HH:MM.
    if (hhmm < item.availableFrom || hhmm > item.availableTo) return false;
  }
  return true;
}

/** DAY-only availability: is today (restaurant tz) one of the item's
 *  available days? Drives availabilityMode "show" semantics (reseller
 *  report cmpxec829, Fabrizio's follow-up): a Mon–Fri lunch special
 *  shows greyed-out on Mon–Fri mornings/evenings, but on Sat/Sun — a
 *  day it's never sold — it disappears from the menu entirely. */
function isItemDayAvailable(item: MenuItem, timezone?: string): boolean {
  if (!item.availableDays) return true;
  try {
    const days: number[] = typeof item.availableDays === "string" ? JSON.parse(item.availableDays) : item.availableDays;
    if (!Array.isArray(days) || days.length === 0) return true;
    return days.includes(localDowAndHHMM(new Date(), timezone).dow);
  } catch {
    return true;
  }
}

// ─── Mobile detection ────────────────────────────────────────────────────────
// SSR-safe: starts false (desktop) and corrects on mount via matchMedia, so the
// mobile-only category accordion never affects desktop or the server render.
function useIsMobile(breakpointPx = 640): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpointPx - 0.02}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [breakpointPx]);
  return isMobile;
}

// True when a hex colour is light enough that white text on it would be hard to
// read — used to flip the themed-fallback banner's text to dark on a pale brand
// colour (e.g. yellow). Photos always use white text (the scrim guarantees it).
function isLightColor(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || "").trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62;
}

// ─── Category banner (hero-band header) ──────────────────────────────────────
// A full-width photo banner with the category name overlaid — replaces the small
// thumbnail + text heading when the owner shows category images
// (theme.showCategoryImages). A category with no photo falls back to a solid
// theme-primary band with the same treatment, so the menu never looks half-empty.
// The whole band is the collapse toggle when the accordion is active; otherwise a
// carousel category shows its scroll arrows here. Luigi 2026-06-30.
function CategoryBanner({ cat, theme, collapsible, collapsedNow, onToggleCollapse, onScroll }: {
  cat: Category;
  theme: ReturnType<typeof parseTheme>;
  collapsible: boolean;
  collapsedNow: boolean;
  onToggleCollapse?: () => void;
  onScroll?: (dir: -1 | 1) => void;
}) {
  const hasImage = !!cat.imageUrl;
  // Per-category accent color overrides the theme color (Fabrizio cmr80joh0).
  const bandColor = (cat as any).accentColor || theme.primaryColor;
  const light = !hasImage && isLightColor(bandColor); // pale colour → dark text
  const overlayText = light ? "#1f2937" : "#ffffff";
  return (
    <div
      className={`group relative mb-3 rounded-xl overflow-hidden ${collapsible ? "cursor-pointer select-none" : ""}`}
      style={{ height: "clamp(130px, 20vw, 156px)", backgroundColor: hasImage ? "#000000" : bandColor }}
      onClick={collapsible ? onToggleCollapse : undefined}
      role={collapsible ? "button" : undefined}
      aria-expanded={collapsible ? !collapsedNow : undefined}
      aria-label={collapsible ? cat.name : undefined}
    >
      {hasImage && (
        <img
          src={cat.imageUrl!}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}
      {/* Bottom-up scrim (or a soft side wash on the themed fallback) keeps the
          white name legible over any photo. */}
      <div
        className="absolute inset-0"
        style={{
          background: hasImage
            ? "linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.14) 50%, rgba(0,0,0,0) 74%)"
            : light
              ? "transparent"
              : "linear-gradient(120deg, rgba(0,0,0,0.28), rgba(0,0,0,0) 62%)",
        }}
      />
      {/* Hover tint — darkens the whole band on hover so a clickable category
          reads as interactive. Pointer-only: no-op on touch, and skipped when
          the band isn't itself clickable (carousel arrows handle their own
          hover). Luigi 2026-07-01. */}
      {collapsible && (
        <div className="absolute inset-0 pointer-events-none bg-transparent group-hover:bg-black/20 transition-colors duration-200" />
      )}
      <div className="absolute top-3 right-3 z-10">
        {collapsible ? (
          <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.34)" }}>
            <ChevronDown className={`w-[18px] h-[18px] text-white transition-transform ${collapsedNow ? "" : "rotate-180"}`} />
          </div>
        ) : onScroll ? (
          <div className="flex gap-1.5">
            <button type="button" onClick={(e) => { e.stopPropagation(); onScroll(-1); }} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.34)" }} aria-label="Scroll left">
              <ChevronLeft className="w-[18px] h-[18px] text-white" />
            </button>
            <button type="button" onClick={(e) => { e.stopPropagation(); onScroll(1); }} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.34)" }} aria-label="Scroll right">
              <ChevronRight className="w-[18px] h-[18px] text-white" />
            </button>
          </div>
        ) : null}
      </div>
      <div className="absolute left-4 bottom-4 right-14">
        <div className="h-[3px] w-8 rounded mb-2" style={{ backgroundColor: hasImage ? "#f0c674" : light ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.75)" }} />
        <h2 className="font-medium leading-tight truncate" style={{ color: overlayText, fontSize: "clamp(20px, 4.5vw, 24px)", letterSpacing: "-0.01em", textShadow: light ? "none" : "0 1px 12px rgba(0,0,0,0.5)" }}>{cat.name}</h2>
        {/* Dish-count pill (icon + number) — deliberately language-neutral so it
            needs no per-locale plural text. A fork/knife icon makes it read as
            "N dishes" in any of the 38 locales. Luigi 2026-07-01. */}
        {cat.menuItems.length > 0 && (
          <span
            className="inline-flex items-center gap-1 mt-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full leading-none"
            style={{ backgroundColor: hasImage || !light ? "rgba(255,255,255,0.20)" : "rgba(0,0,0,0.10)", color: overlayText }}
          >
            <Utensils className="w-3 h-3" style={{ opacity: 0.85 }} aria-hidden />
            {cat.menuItems.length}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Category Section (carousel or grid) ─────────────────────────────────────

/** Non-banner category header — three looks (Luigi 2026-07-04: plain headers
 *  "blend in like nothing", so owners can pick a clearly-tappable style):
 *    "plain"  — the classic text-only header (default)
 *    "button" — an item-card-like tappable card (border + shadow + count)
 *    "modern" — a theme-colour accent panel (left bar + tinted background)
 *  Shared by all three menu layouts; `trailing` carries the carousel's
 *  scroll arrows when the category isn't collapsible. */
function PlainCategoryHeader({ cat, theme, styleKind, collapsible, collapsedNow, onToggleCollapse, trailing, compact }: {
  cat: Category;
  theme: ReturnType<typeof parseTheme>;
  styleKind: "plain" | "button" | "modern";
  collapsible?: boolean;
  collapsedNow?: boolean;
  onToggleCollapse?: () => void;
  trailing?: React.ReactNode;
  compact?: boolean;
}) {
  const count = cat.menuItems.length;
  const nameSize = compact ? "text-lg" : "text-xl";
  const mb = compact ? "mb-3" : "mb-4";
  // Per-category accent color overrides the theme color (Fabrizio cmr80joh0).
  const accent = (cat as any).accentColor || theme.primaryColor;
  if (styleKind === "button") {
    return (
      <div className={`${mb} sticky top-0 py-2 z-10`} style={{ backgroundColor: theme.backgroundColor }}>
        <div
          className={`flex items-center gap-3 rounded-2xl border border-gray-200 shadow-sm px-4 ${compact ? "py-3" : "py-3.5"} transition hover:shadow-md ${collapsible ? "cursor-pointer select-none" : ""}`}
          style={{ backgroundColor: theme.cardBackground }}
          onClick={collapsible ? onToggleCollapse : undefined}
        >
          <h2 className={`${nameSize} font-bold flex-1 min-w-0 truncate`} style={{ color: theme.textColor }}>{cat.name}</h2>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 flex-shrink-0">{count}</span>
          {collapsible ? (
            <ChevronDown className={`w-5 h-5 flex-shrink-0 transition-transform ${collapsedNow ? "" : "rotate-180"}`} style={{ color: theme.textColor }} />
          ) : trailing ?? null}
        </div>
      </div>
    );
  }
  if (styleKind === "modern") {
    return (
      <div className={`${mb} sticky top-0 py-2 z-10`} style={{ backgroundColor: theme.backgroundColor }}>
        <div
          className={`flex items-center gap-3 rounded-xl px-4 ${compact ? "py-3" : "py-3.5"} ${collapsible ? "cursor-pointer select-none" : ""}`}
          style={{ backgroundColor: `${accent}0D`, borderLeft: `4px solid ${accent}` }}
          onClick={collapsible ? onToggleCollapse : undefined}
        >
          <h2 className={`${nameSize} font-extrabold tracking-tight flex-1 min-w-0 truncate`} style={{ color: theme.textColor }}>{cat.name}</h2>
          <span className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: `${accent}1A`, color: accent }}>{count}</span>
          {collapsible ? (
            <span className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${accent}1A` }}>
              <ChevronDown className={`w-4 h-4 transition-transform ${collapsedNow ? "" : "rotate-180"}`} style={{ color: accent }} />
            </span>
          ) : trailing ?? null}
        </div>
      </div>
    );
  }
  // "plain" — the classic header, unchanged.
  return (
    <div
      className={`flex items-center gap-3 ${mb} sticky top-0 py-2 z-10 ${collapsible ? "cursor-pointer select-none" : ""}`}
      style={{ backgroundColor: theme.backgroundColor }}
      onClick={collapsible ? onToggleCollapse : undefined}
    >
      <h2 className={`${nameSize} font-bold flex-1`} style={{ color: theme.textColor }}>{cat.name}</h2>
      {collapsible ? (
        <ChevronDown className={`w-5 h-5 flex-shrink-0 transition-transform ${collapsedNow ? "" : "rotate-180"}`} style={{ color: theme.textColor }} />
      ) : trailing ?? null}
    </div>
  );
}

function CategorySection({ cat, theme, onRef, onOpen, collapsible = false, collapsed = false, onToggleCollapse }: {
  cat: Category;
  theme: ReturnType<typeof parseTheme>;
  onRef: (el: HTMLElement | null) => void;
  onOpen: (item: MenuItem) => void;
  /** Mobile accordion: when true the category header toggles its items. */
  collapsible?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  // Only hide items when collapsing is actually active AND this one is closed.
  const collapsedNow = collapsible && collapsed;
  // Which header this category gets (Luigi 2026-07-03/04): the photo banner
  // when it has an image (banners ON); an image-LESS category follows
  // theme.categoryNoImageStyle — "band" = solid-colour banner, else one of
  // the header styles (plain / button / modern). With banners OFF, "band"
  // maps to "plain" so pre-existing stores keep the classic look.
  const noImgStyle =
    !theme.showCategoryImages && theme.categoryNoImageStyle === "band"
      ? "plain"
      : theme.categoryNoImageStyle;
  const useBanner =
    theme.showCategoryImages && (!!cat.imageUrl || noImgStyle === "band");
  const headerKind: "plain" | "button" | "modern" =
    noImgStyle === "button" || noImgStyle === "modern" ? noImgStyle : "plain";
  const scrollRef = useRef<HTMLDivElement>(null);
  // Track drag state via refs (not state) so we never re-render mid-drag.
  //   • `armed`     — pointer is down; we MIGHT be about to drag.
  //   • `dragging`  — pointer moved past the 5px threshold; this IS a drag.
  //                   Once true, pointer capture is taken and the trailing
  //                   click is suppressed.
  //   • `movedPx`   — running max displacement; the click-capture guard
  //                   reads this to decide whether to swallow the click.
  // Luigi 2026-05-30: previous version called setPointerCapture on
  // pointerdown which broke ordinary clicks — the capture stole the
  // event from the card. Now we only capture once a real drag begins.
  const dragRef = useRef({
    armed: false,
    dragging: false,
    pointerId: -1,
    startX: 0,
    startScrollLeft: 0,
    movedPx: 0,
  });

  const scroll = useCallback((dir: -1 | 1) => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: dir * 320, behavior: "smooth" });
    }
  }, []);

  if (theme.menuLayout === "grid") {
    return (
      <div ref={onRef as any}>
        {useBanner ? (
          <CategoryBanner cat={cat} theme={theme} collapsible={collapsible} collapsedNow={collapsedNow} onToggleCollapse={onToggleCollapse} />
        ) : (
          <PlainCategoryHeader cat={cat} theme={theme} styleKind={headerKind} collapsible={collapsible} collapsedNow={collapsedNow} onToggleCollapse={onToggleCollapse} />
        )}
        {!collapsedNow && (
          <div className="grid sm:grid-cols-2 gap-4">
            {cat.menuItems.map(item => (
              <GridCard key={item.id} item={item} theme={theme} onOpen={onOpen} />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (theme.menuLayout === "list") {
    // "List" layout (GloriaFood-style): a vertical list with a small food
    // photo on the LEFT and text on the RIGHT. Image-less items simply have
    // no thumbnail — no blank placeholder (Luigi report cmpxe0ufs).
    return (
      <div ref={onRef as any}>
        {useBanner ? (
          <CategoryBanner cat={cat} theme={theme} collapsible={collapsible} collapsedNow={collapsedNow} onToggleCollapse={onToggleCollapse} />
        ) : (
          <PlainCategoryHeader cat={cat} theme={theme} styleKind={headerKind} collapsible={collapsible} collapsedNow={collapsedNow} onToggleCollapse={onToggleCollapse} />
        )}
        {!collapsedNow && (
          <div className="flex flex-col gap-2">
            {cat.menuItems.map(item => (
              <ListCard key={item.id} item={item} theme={theme} onOpen={onOpen} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // "Carousel" layout — single horizontal scroller on BOTH mobile and
  // desktop (Luigi 2026-05-30: previous grid-on-desktop variant didn't
  // look right, restore the original carousel). Desktop interaction:
  //   • Click-and-drag — grab anywhere on the strip and pan. The
  //     synthetic click on the card under the cursor is suppressed
  //     when the pointer moved more than 5px.
  //   • Arrow buttons — visible on desktop too now (used to be md:hidden).
  //   • Mouse wheel — vertical wheel pans horizontally.
  // Mobile interaction is unchanged: native touch swipe (snap-x).
  return (
    <div ref={onRef as any}>
      {useBanner ? (
        <CategoryBanner cat={cat} theme={theme} collapsible={collapsible} collapsedNow={collapsedNow} onToggleCollapse={onToggleCollapse} onScroll={scroll} />
      ) : (
        <PlainCategoryHeader
          cat={cat} theme={theme} styleKind={headerKind} compact
          collapsible={collapsible} collapsedNow={collapsedNow} onToggleCollapse={onToggleCollapse}
          trailing={(
            <div className="flex gap-1">
              <button onClick={() => scroll(-1)} className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-100 transition" style={{ backgroundColor: theme.cardBackground }} aria-label="Scroll left">
                <ChevronLeft className="w-4 h-4 text-gray-500" />
              </button>
              <button onClick={() => scroll(1)} className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-100 transition" style={{ backgroundColor: theme.cardBackground }} aria-label="Scroll right">
                <ChevronRight className="w-4 h-4 text-gray-500" />
              </button>
            </div>
          )}
        />
      )}
      {!collapsedNow && (
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto pb-2 snap-x select-none"
        onWheel={(e) => {
          // Convert vertical wheel deltas into horizontal scroll so a
          // standard mouse wheel can pan the carousel without clicking
          // the arrow buttons. shift+wheel naturally already scrolls
          // horizontally — this just handles the no-shift case.
          if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
          if (scrollRef.current) {
            scrollRef.current.scrollBy({ left: e.deltaY, behavior: "auto" });
          }
        }}
        // ── Click-and-drag (desktop mouse). Touch is handled by the
        // browser's native scroll so we explicitly ignore non-mouse
        // pointer events — capturing them would disable the native
        // momentum scroll on phones and ruin the mobile experience
        // Luigi explicitly wants left alone.
        //
        // Strategy: arm on pointerdown, but do NOT take pointer capture
        // yet. Promote to a real drag only after the pointer has moved
        // 5px. This way a normal click never has its event redirected
        // away from the card.
        onPointerDown={(e) => {
          if (e.pointerType !== "mouse") return;
          // Ignore right-click / middle-click — only the primary
          // mouse button should pan.
          if (e.button !== 0) return;
          const el = scrollRef.current;
          if (!el) return;
          dragRef.current.armed = true;
          dragRef.current.dragging = false;
          dragRef.current.pointerId = e.pointerId;
          dragRef.current.startX = e.clientX;
          dragRef.current.startScrollLeft = el.scrollLeft;
          dragRef.current.movedPx = 0;
        }}
        onPointerMove={(e) => {
          if (!dragRef.current.armed) return;
          const el = scrollRef.current;
          if (!el) return;
          const dx = e.clientX - dragRef.current.startX;
          const abs = Math.abs(dx);
          dragRef.current.movedPx = Math.max(dragRef.current.movedPx, abs);
          // Promote to real drag only past the threshold. THEN take
          // pointer capture so the drag survives the cursor leaving
          // the strip.
          if (!dragRef.current.dragging && abs > 5) {
            dragRef.current.dragging = true;
            try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
          }
          if (dragRef.current.dragging) {
            el.scrollLeft = dragRef.current.startScrollLeft - dx;
          }
        }}
        onPointerUp={(e) => {
          if (!dragRef.current.armed) return;
          const wasDrag = dragRef.current.dragging;
          dragRef.current.armed = false;
          dragRef.current.dragging = false;
          const el = scrollRef.current;
          if (el && el.hasPointerCapture(e.pointerId)) {
            try { el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
          }
          // Reset movedPx after the synthetic click has had a chance
          // to fire (and be swallowed by onClickCapture below).
          setTimeout(() => { dragRef.current.movedPx = 0; }, 0);
          if (wasDrag) e.preventDefault();
        }}
        onPointerCancel={() => {
          dragRef.current.armed = false;
          dragRef.current.dragging = false;
        }}
        // Capture-phase click guard — fires BEFORE the card's onClick.
        // Only swallows the click when the user actually dragged
        // (movedPx > 5). A plain click leaves movedPx at 0 and passes
        // through cleanly.
        onClickCapture={(e) => {
          if (dragRef.current.movedPx > 5) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        style={{
          scrollbarWidth: "none",
          WebkitOverflowScrolling: "touch",
          cursor: "grab",
          touchAction: "pan-x",
        } as React.CSSProperties}
      >
        {cat.menuItems.map((item) => (
          <CarouselCard key={item.id} item={item} theme={theme} onOpen={onOpen} />
        ))}
      </div>
      )}
    </div>
  );
}

function CarouselCard({ item, theme, onOpen }: { item: MenuItem; theme: ReturnType<typeof parseTheme>; onOpen: (i: MenuItem) => void }) {
  const t = useTranslations("ordering");
  const fmt = useCurrencyFormat();
  const isSold = item.isSoldOut;
  const availNote = (item as any).__availabilityNote as string | undefined;
  const availBlocked = !!(item as any).__availabilityBlocked;
  const blocked = isSold || availBlocked;
  const basePrice = item.hasVariants && item.variants?.length
    ? Math.min(...item.variants.map(v => v.price))
    : item.price;
  return (
    <button
      id={`menu-item-${item.id}`}
      onClick={() => !blocked && onOpen(item)}
      disabled={blocked}
      className={`flex-shrink-0 text-left rounded-2xl overflow-hidden shadow-sm transition group ${blocked ? "opacity-60 cursor-not-allowed" : "hover:shadow-md"}`}
      style={{ width: 168, backgroundColor: theme.cardBackground, border: "1px solid #e5e7eb" }}
    >
      {/* Image block renders ONLY when the item has an image — no broken/gray
          placeholder for image-less items (Luigi 2026-06-04). Featured + sold-out
          badges (which used to overlay the image) move inline below when there's
          no image, so that info is never lost. */}
      {item.imageUrl && (
        <div className="relative overflow-hidden" style={{ height: 110 }}>
          <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
          {item.isFeatured && (
            <div className="absolute top-1.5 left-1.5 bg-yellow-400 text-yellow-900 text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
              <Star className="w-2.5 h-2.5 fill-yellow-900" />
            </div>
          )}
          {isSold && (
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
              <span className="bg-white text-gray-800 text-xs font-bold px-2 py-1 rounded-full">{t("soldOut")}</span>
            </div>
          )}
          {!isSold && availBlocked && availNote && (
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
              <span className="bg-white text-amber-700 text-[10px] font-bold px-2 py-1 rounded-full text-center leading-tight">{availNote}</span>
            </div>
          )}
        </div>
      )}
      <div className="p-2.5">
        <p className="text-sm font-semibold leading-snug line-clamp-2 flex items-center gap-1" style={{ color: theme.textColor }}>
          {!item.imageUrl && item.isFeatured && <Star className="w-3 h-3 flex-shrink-0 fill-yellow-500 text-yellow-500" />}
          {item.name}
        </p>
        {!item.imageUrl && isSold && (
          <span className="inline-block mt-1 bg-gray-200 text-gray-700 text-[10px] font-bold px-2 py-0.5 rounded-full">{t("soldOut")}</span>
        )}
        {!item.imageUrl && !isSold && availBlocked && availNote && (
          <span className="inline-block mt-1 bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full">{availNote}</span>
        )}
        {/* Currently purchasable but day/time-limited — informational line so
            the customer learns the window without the item reading "blocked". */}
        {!isSold && !availBlocked && availNote && (
          <p className="mt-1 text-[10px] font-medium text-amber-700 leading-tight">{availNote}</p>
        )}
        {!isSold && (item as any).__fulfilNote && (
          <p className="mt-1 text-[10px] font-semibold text-indigo-600 leading-tight">{(item as any).__fulfilNote}</p>
        )}
        <div className="flex items-center justify-between mt-2">
          <span className="text-sm font-bold" style={{ color: theme.primaryColor }}>
            {item.hasVariants ? t("fromPrice", { price: fmt(basePrice) }) : fmt(basePrice)}
          </span>
          {!blocked && (
            <div className="w-7 h-7 rounded-full flex items-center justify-center shadow-sm transition" style={{ backgroundColor: theme.primaryColor }}>
              <Plus className="w-4 h-4 text-white" />
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

/**
 * Magnifying-glass search bar above the category pills. Pure
 * controlled input — the filter logic happens in the parent where
 * visibleCategories is computed. Inspired by CloudWaitress's
 * always-visible search pattern (Luigi 2026-05-31).
 */
function MenuSearchBar({
  value,
  onChange,
  theme,
}: {
  value: string;
  onChange: (v: string) => void;
  theme: ReturnType<typeof parseTheme>;
}) {
  const t = useTranslations("ordering");
  return (
    <div className="relative mb-3">
      <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("searchMenu")}
        className="w-full pl-9 pr-9 py-2.5 rounded-full text-sm focus:outline-none focus:ring-2 transition"
        style={{
          backgroundColor: theme.cardBackground,
          border: `1px solid #e5e7eb`,
          color: theme.textColor,
          "--tw-ring-color": theme.primaryColor,
        } as React.CSSProperties}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center hover:bg-gray-100 text-gray-500"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

function GridCard({ item, theme, onOpen }: { item: MenuItem; theme: ReturnType<typeof parseTheme>; onOpen: (i: MenuItem) => void }) {
  const t = useTranslations("ordering");
  const fmt = useCurrencyFormat();
  const isSold = item.isSoldOut;
  // Visible-but-purchase-restricted (reseller report cmpxec829): outside the
  // item's window it renders like sold-out but with an "Available …" note.
  // The note also renders (informational, not blocking) while purchasable.
  const availNote = (item as any).__availabilityNote as string | undefined;
  const availBlocked = !!(item as any).__availabilityBlocked;
  const blocked = isSold || availBlocked;
  const basePrice = item.hasVariants && item.variants?.length
    ? Math.min(...item.variants.map(v => v.price))
    : item.price;
  return (
    <button
      id={`menu-item-${item.id}`}
      onClick={() => !blocked && onOpen(item)}
      disabled={blocked}
      className={`text-left rounded-2xl border overflow-hidden shadow-sm transition group ${blocked ? "opacity-60 cursor-not-allowed border-gray-100" : "hover:shadow-lg"}`}
      style={{ backgroundColor: theme.cardBackground, borderColor: "#e5e7eb" }}
    >
      {/* Image block renders ONLY when the item has an image — no broken/gray
          placeholder for image-less items (Luigi 2026-06-04). Featured + sold-out
          badges move inline below the title when there's no image so the info
          is preserved. */}
      {item.imageUrl && (
        <div className="relative overflow-hidden" style={{ aspectRatio: "16/9" }}>
          <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
          {item.isFeatured && (
            <div className="absolute top-2 left-2 bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
              <Star className="w-3 h-3 fill-yellow-900" /> {t("featured")}
            </div>
          )}
          {isSold && (
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
              <span className="bg-white text-gray-800 text-xs font-bold px-3 py-1.5 rounded-full">{t("soldOut")}</span>
            </div>
          )}
          {!isSold && availBlocked && availNote && (
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
              <span className="bg-white text-amber-700 text-xs font-bold px-3 py-1.5 rounded-full">{availNote}</span>
            </div>
          )}
        </div>
      )}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {!item.imageUrl && (item.isFeatured || blocked) && (
              <div className="flex items-center gap-1.5 mb-1">
                {item.isFeatured && (
                  <span className="inline-flex items-center gap-1 bg-yellow-100 text-yellow-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    <Star className="w-2.5 h-2.5 fill-yellow-800" /> {t("featured")}
                  </span>
                )}
                {isSold && (
                  <span className="inline-block bg-gray-200 text-gray-700 text-[10px] font-bold px-2 py-0.5 rounded-full">{t("soldOut")}</span>
                )}
                {!isSold && availBlocked && availNote && (
                  <span className="inline-block bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full">{availNote}</span>
                )}
              </div>
            )}
            <p className="font-semibold leading-snug transition" style={{ color: theme.textColor }}>{item.name}</p>
            {item.description && <p className="text-sm text-gray-500 mt-1 line-clamp-2 leading-relaxed">{item.description}</p>}
            {!isSold && !availBlocked && availNote && (
              <p className="text-[11px] font-medium text-amber-700 mt-1">{availNote}</p>
            )}
            {!isSold && (item as any).__fulfilNote && (
              <p className="text-[11px] font-semibold text-indigo-600 mt-1">{(item as any).__fulfilNote}</p>
            )}
          </div>
          <div className="flex-shrink-0 flex flex-col items-end gap-2">
            <div className="font-bold text-base" style={{ color: theme.textColor }}>
              {item.hasVariants ? t("fromPrice", { price: fmt(basePrice) }) : fmt(basePrice)}
            </div>
            {!blocked && (
              <div className="w-9 h-9 rounded-full flex items-center justify-center shadow-sm transition" style={{ backgroundColor: theme.primaryColor }}>
                <Plus className="w-5 h-5 text-white" />
              </div>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

function ListCard({ item, theme, onOpen }: { item: MenuItem; theme: ReturnType<typeof parseTheme>; onOpen: (i: MenuItem) => void }) {
  const t = useTranslations("ordering");
  const fmt = useCurrencyFormat();
  const isSold = item.isSoldOut;
  const availNote = (item as any).__availabilityNote as string | undefined;
  const availBlocked = !!(item as any).__availabilityBlocked;
  const blocked = isSold || availBlocked;
  const basePrice = item.hasVariants && item.variants?.length
    ? Math.min(...item.variants.map(v => v.price))
    : item.price;
  return (
    <button
      id={`menu-item-${item.id}`}
      onClick={() => !blocked && onOpen(item)}
      disabled={blocked}
      className={`w-full text-left rounded-2xl border overflow-hidden shadow-sm transition group flex items-stretch ${blocked ? "opacity-60 cursor-not-allowed border-gray-100" : "hover:shadow-lg"}`}
      style={{ backgroundColor: theme.cardBackground, borderColor: "#e5e7eb" }}
    >
      {/* Photo on the LEFT — rendered ONLY when present (no blank placeholder). */}
      {item.imageUrl && (
        <div className="relative flex-shrink-0 w-24 sm:w-28 self-stretch overflow-hidden">
          <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
          {isSold && (
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
              <span className="bg-white text-gray-800 text-[10px] font-bold px-2 py-1 rounded-full">{t("soldOut")}</span>
            </div>
          )}
        </div>
      )}
      {/* Text on the RIGHT. */}
      <div className="flex-1 min-w-0 p-3 sm:p-4 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {(item.isFeatured || (isSold && !item.imageUrl) || (!isSold && availBlocked && availNote)) && (
            <div className="flex items-center gap-1.5 mb-1">
              {item.isFeatured && (
                <span className="inline-flex items-center gap-1 bg-yellow-100 text-yellow-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  <Star className="w-2.5 h-2.5 fill-yellow-800" /> {t("featured")}
                </span>
              )}
              {isSold && !item.imageUrl && (
                <span className="inline-block bg-gray-200 text-gray-700 text-[10px] font-bold px-2 py-0.5 rounded-full">{t("soldOut")}</span>
              )}
              {!isSold && availBlocked && availNote && (
                <span className="inline-block bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full">{availNote}</span>
              )}
            </div>
          )}
          <p className="font-semibold leading-snug transition" style={{ color: theme.textColor }}>{item.name}</p>
          {item.description && <p className="text-sm text-gray-500 mt-1 line-clamp-2 leading-relaxed">{item.description}</p>}
          {!isSold && !availBlocked && availNote && (
            <p className="text-[11px] font-medium text-amber-700 mt-1">{availNote}</p>
          )}
          {!isSold && (item as any).__fulfilNote && (
            <p className="text-[11px] font-semibold text-indigo-600 mt-1">{(item as any).__fulfilNote}</p>
          )}
          <div className="font-bold text-base mt-2" style={{ color: theme.textColor }}>
            {item.hasVariants ? t("fromPrice", { price: fmt(basePrice) }) : fmt(basePrice)}
          </div>
        </div>
        {!blocked && (
          <div className="flex-shrink-0 self-center w-9 h-9 rounded-full flex items-center justify-center shadow-sm transition" style={{ backgroundColor: theme.primaryColor }}>
            <Plus className="w-5 h-5 text-white" />
          </div>
        )}
      </div>
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function OrderingPageClient({
  restaurant,
  cardPaymentEnabled = false,
  paypalEnabled = false,
  shipdayPrepaidDelivery = false,
  stripePublishableKey = null,
  themeSettings = null,
  locale = "en",
  isEmbedded = false,
  paymentMethodsRaw = "[]",
  fromHostedSite = false,
  hostedSiteBackUrl,
  promoBanners = [],
  rewardPromoTiles = [],
  rewardSignupBanner = null,
  customerChannel = "website",
  marketplaceAccount = null,
  customerIsReturning = false,
  currentCustomer = null,
  todayHolidayName = null,
  todayHolidayMessage = null,
  todayHolidayIntervals = null,
  todayHolidayClosed = false,
  holidayClosedServices = [],
  holidayClosedWindows = [],
  holidayCustomHoursServices = [],
  holidayClosedWindowsGeneral = null,
  isTestPreview = false,
  poweredByCredit = { kind: "feefree" },
}: {
  restaurant: any;
  cardPaymentEnabled?: boolean;
  /** True when this restaurant dispatches delivery via ShipDay — delivery
   *  orders must then be PREPAID online (Luigi 2026-07-04: ShipDay drivers
   *  only pick up + drop off; no cash / card collection at the door), so the
   *  checkout hides at-door payment methods for delivery. */
  shipdayPrepaidDelivery?: boolean;
  /** Clickable platform credit at the bottom of the ordering page (free
   *  marketing + SEO backlink). Resolved server-side via
   *  resolvePoweredByCredit(restaurant.resellerProfile) — renders the Fee Free
   *  credit, a reseller's own credit, or nothing for a de-branded account.
   *  Luigi 2026-06-22. */
  poweredByCredit?: PoweredByCreditValue;
  /** Name of today's one-off holiday closure (restaurant tz), or null. When
   *  set, the live open/closed status is forced to "closed today" so the
   *  customer sees the closed banner + must schedule for the next open day. */
  todayHolidayName?: string | null;
  /** Optional customer-facing note attached to today's special day (Gloriafood
   *  parity, Luigi 2026-06-11). Shown in the holiday banner. */
  todayHolidayMessage?: string | null;
  /** When today's special day is OPEN with custom hours, the intervals that
   *  replace the weekly schedule (general / all-services rule). */
  todayHolidayIntervals?: Array<{ open: string; close: string }> | null;
  /** TRUE when a holiday rule fully closes the restaurant today. Explicit —
   *  name + message are both optional, so their absence proves nothing. */
  todayHolidayClosed?: boolean;
  /** Canonical service keys (pickup/delivery/dine_in/take_out/…) that are
   *  holiday-CLOSED today by a service-specific rule while the restaurant is
   *  otherwise open. Disables those service buttons + shows a banner. */
  holidayClosedServices?: string[];
  /** Services open today but CLOSED during specific time windows (the "Closed
   *  hours" rule) — shows a partial-closure banner line. */
  holidayClosedWindows?: Array<{ service: string; intervals: { open: string; close: string }[] }>;
  /** Services with per-service custom OPEN hours today — special-hours banner line. */
  holidayCustomHoursServices?: Array<{ service: string; intervals: { open: string; close: string }[] }>;
  /** A general all-services "Closed hours" rule's windows for today — one line. */
  holidayClosedWindowsGeneral?: { open: string; close: string }[] | null;
  /** Owner "Preview & test ordering" mode (reseller report cmq3red6b): true
   *  only when ?testing=1 AND the viewer has an admin session for THIS
   *  restaurant (verified server-side). Orders placed are marked TEST- and
   *  excluded from all reports; a banner makes the mode obvious. */
  isTestPreview?: boolean;
  /** Active promotions to display as banners above the menu (per Fabrizio
   *  2026-05-28). Server-filtered for visibility (active, in date range,
   *  matches today's day-of-week, showOnBanner=true). The hour-of-day
   *  USABILITY window is NOT filtered here — that gate runs at order
   *  calculation. So a 12-3 PM lunch promo still shows at 9 AM so the
   *  customer can pre-order for tomorrow's lunch. */
  promoBanners?: Array<{
    id: string;
    name: string;
    description: string | null;
    promotionType: string;
    bannerHeadline: string | null;
    daysOfWeek: string | null;
    usableHourStart: number | null;
    usableHourEnd: number | null;
    minimumOrder: number;
    highlightThreshold?: number | null;
    /** Pin this promo as a STRIP CARD. The strip filters on this; the nudge +
     *  free-item auto-prompt ignore it (they fire for any Visible auto-apply
     *  promo). Luigi 2026-06-26. */
    showOnBanner?: boolean;
    orderType: string;
    couponCode: string | null;
    /** Type-specific config (Phase 2a). Drives the PromoDetailModal's
     *  per-type panel (eligible items, bundle slots, freebie pool). */
    ruleConfig?: unknown;
    /** Legacy stringified config — fallback when ruleConfig is empty. */
    rules?: string | null;
    /** Optional promo image URL set in Step 3 → Display details. When
     *  set, the banner card shows the image instead of the plain black
     *  background — owners can theme each promo card individually. */
    imageUrl?: string | null;
    /** Restriction columns surfaced by the GloriaFood-style summary
     *  panel inside the customer detail modal — "What you get /
     *  Conditions". All optional. Server-side `page.tsx` selects
     *  them via the Promotion select clause. */
    autoApply?: boolean;
    customerType?: string;
    startsAt?: Date | string | null;
    endsAt?: Date | string | null;
    paymentMethodSlugs?: string | null;
    deliveryZoneIds?: string | null;
    onceLifetimePerClient?: boolean;
    /** Owning campaign (null = self-made). The Kickstarter first-buy promo
     *  (campaignRef === "kickstarter_first_buy") is rendered as a prominent
     *  hero above the regular promo strip. */
    campaignRef?: string | null;
  }>;
  /** Reward Dollars earn rules the owner flagged to advertise as Promos-section
   *  tiles ("Earn $5 on your first order"). Informational. Luigi 2026-06-28. */
  rewardPromoTiles?: Array<{
    id: string;
    triggerType: string;
    earnAmount: number | null;
    earnPercent: number | null;
    orderThreshold: number | null;
    nthInterval: number | null;
    label: string | null;
  }>;
  /** Set (non-null) only for LOGGED-OUT viewers when the owner enabled the
   *  "sign up to earn" banner. rewardName is the store's reward label (null →
   *  localized default). Luigi 2026-06-30. */
  rewardSignupBanner?: { rewardName: string | null } | null;
  /** True when the viewer is a LOGGED-IN customer with a prior fulfilled order
   *  here — used to hide the first-buy hero from returning customers (computed
   *  server-side in page.tsx). Anonymous guests default false + get the
   *  client-side same-device guard. */
  customerIsReturning?: boolean;
  /** Acquisition channel resolved server-side ("marketplace" only when the
   *  customer arrived via the marketplace AND the restaurant is listed).
   *  Forwarded to apply-promos so the cart preview matches what the order route
   *  will actually apply. */
  customerChannel?: "website" | "marketplace";
  /** Marketplace-wide account (CustomerAccount) for the marketplace-view sign-in
   *  button. Null when the visitor isn't on the marketplace channel or isn't
   *  signed into a marketplace account. */
  marketplaceAccount?: { name: string | null } | null;
  /** The logged-in per-restaurant customer at this restaurant, if any.
   *  Server-resolved via getCurrentRestaurantCustomer in page.tsx and
   *  passed in so the header can render the right Sign-in vs. Hi-name
   *  state without a client-side fetch flash. Null = guest visitor. */
  currentCustomer?: { id: string; name: string; email: string | null; phone: string | null; marketingConsent?: boolean | null } | null;
  /** True when the restaurant has connected PayPal AND has the
   *  card_payments entitlement. Drives whether PayPal works at
   *  checkout vs. shows a "not yet ready" notice. */
  paypalEnabled?: boolean;
  stripePublishableKey?: string | null;
  themeSettings?: string | null;
  locale?: string;
  /** True when rendered inside the iframe widget. Strips marketing
   *  chrome (banner photo, info link, restaurant-info bar buttons,
   *  social footer) so the widget is a minimal ordering surface and
   *  the SEO website (full marketing page) remains the paid upgrade
   *  differentiator. */
  isEmbedded?: boolean;
  /** Raw `Restaurant.paymentMethods` JSON (legacy flat array OR per-order-type
   *  object). The client derives the accepted method slugs for the SELECTED
   *  order type via methodsForOrderType() — so a restaurant can accept, e.g.,
   *  cash for pickup but online-card-only for delivery. Luigi 2026-06-08. */
  paymentMethodsRaw?: string;
  /** Customer arrived via ?from=hosted — they clicked an "Order Online"
   *  link on this restaurant's Sales Optimized Website (subdomain
   *  marketing page). Show a "Back to <restaurant>'s site" breadcrumb
   *  at the top so they're not stuck on /order with no way back. */
  fromHostedSite?: boolean;
  /** Pre-computed URL the back-link should point at. On a branded host
   *  this is just "/" (proxy rewrites it to the hosted site root); on
   *  the platform domain it's the explicit `/site/${slug}` path. */
  hostedSiteBackUrl?: string;
}) {
  const t = useTranslations("ordering");
  const tT = useTranslations("ordering.toasts");
  const tCombo = useTranslations("customer.combo");
  const tAddr = useTranslations("checkout.addressFields");
  const tCheckout = useTranslations("checkout");
  const tPromoDetail = useTranslations("customer.promoDetail");
  // Promo popup (Fabrizio 2026-06-25): the owner's configured popup, shown ONCE per browser
  // session on this device. Additive — no config / not enabled ⇒ nothing renders. Default
  // closed (no SSR flash); the effect opens it after mount if eligible + not yet dismissed.
  const orderingPopup = ((restaurant as any).orderingPopup ?? null) as OrderingPopupConfig | null;
  const [popupClosed, setPopupClosed] = useState(true);
  useEffect(() => {
    if (!orderingPopup?.enabled) return;
    try {
      if (sessionStorage.getItem(`ff-popup-${restaurant.id}`) !== "1") setPopupClosed(false);
    } catch { /* sessionStorage blocked ⇒ stay closed */ }
  }, [orderingPopup?.enabled, restaurant.id]);
  const dismissPopup = () => {
    setPopupClosed(true);
    try { sessionStorage.setItem(`ff-popup-${restaurant.id}`, "1"); } catch { /* ignore */ }
  };
  const theme = parseTheme(themeSettings);
  // Owner's chosen clock display format ("12h" → AM/PM, "24h" → 14:30).
  // Applied wherever times are shown to customers: header hours, info
  // page, promo usable hours, schedule-for-later picker.
  const hoursFmt: HoursFormat = restaurant.hoursFormat === "12h" ? "12h" : "24h";
  // Resolved customizable delivery-address form config (null on the restaurant
  // → default preset). Drives which fields render + are required at checkout.
  const deliveryFormConfig = resolveDeliveryAddressConfig((restaurant as any).deliveryAddressConfig);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Auto-open the reservation modal when the customer arrived from the info
  // page (or any link) with ?reservation=1 in the URL.
  useEffect(() => {
    if (searchParams.get("reservation") === "1" && restaurant.acceptsReservations) {
      setReservationOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  const [cart, setCart] = useState<CartItem[]>([]);
  // Same-device "ordered here before" guard for the first-buy hero — a repeat
  // GUEST (not logged in, so the server can't flag them) who has already placed
  // an order on THIS device stops seeing the new-customer enticement. Written in
  // placeOrder() on a successful submit; read once on mount. Best-effort
  // (cleared storage / a new device falls back to showing it) — the discount is
  // always enforced new-customers-only at checkout regardless. Luigi 2026-06-09.
  const [hasOrderedHere, setHasOrderedHere] = useState(false);
  useEffect(() => {
    // Channel-aware (H2): a website order doesn't hide the MARKETPLACE first-buy
    // hero, and vice-versa. Luigi 2026-06-09.
    try { if (localStorage.getItem(`ff-ordered-${restaurant.id}-${customerChannel}`) === "1") setHasOrderedHere(true); } catch {}
  }, [restaurant.id, customerChannel]);
  // Silent guest "remember me" (Luigi 2026-06-10): true once we've pre-filled the
  // checkout form from contact/address saved on THIS device by a prior order
  // (any restaurant / marketplace — it's the customer's own info). Drives the
  // "Not you? Clear" affordance for shared devices. A logged-in account always
  // wins over this; card data is NEVER stored here.
  const [hasSavedGuestInfo, setHasSavedGuestInfo] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  /** When non-null, the customer has tapped a promo banner card and the
   *  detail modal is showing. The promo object is the same shape we
   *  receive on the `promoBanners` prop (passed through verbatim). */
  const [activePromoModal, setActivePromoModal] = useState<typeof promoBanners[number] | null>(null);
  // Free-item promos that have already auto-prompted this session, so the
  // "claim your free item" modal pops once (not on every cart change). Cleared
  // implicitly when the page reloads. Fabrizio/Luigi 2026-06-07.
  const [autoPromptedFreebies, setAutoPromptedFreebies] = useState<Set<string>>(new Set());
  // True once the promo engine has evaluated the cart at least once — guards the
  // stale-freebie cleanup from firing during the initial (un-evaluated) render.
  const promosEvaluatedRef = useRef(false);
  // Promo IDs applied as of the last evaluation — so we can toast the moment a
  // NEW promo unlocks (e.g. adding the 2nd pizza fires BOGO). null = not yet
  // evaluated (so a page load / restored cart doesn't toast). Luigi 2026-06-27.
  const seenPromoIdsRef = useRef<Set<string> | null>(null);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [mods, setMods] = useState<Record<string, string[]>>({});
  const [selectedVariant, setSelectedVariant] = useState<ItemVariant | null>(null);
  const [itemNotes, setItemNotes] = useState("");
  /** Quantity stepper on the item modal — lets customers pick "I want 3"
   *  before clicking Add to Cart, instead of having to add then increment
   *  in the cart drawer. Resets to 1 when a new item opens; preserved
   *  when editing an existing cart line. */
  const [itemQuantity, setItemQuantity] = useState(1);
  const [orderType, setOrderType] = useState<"pickup" | "delivery" | "dine_in" | "take_out">(
    restaurant.acceptsPickup ? "pickup"
      : restaurant.acceptsDelivery ? "delivery"
      : (restaurant as any).acceptsDineIn ? "dine_in"
      : (restaurant as any).acceptsTakeOut ? "take_out"
      : "pickup",
  );
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  // "These items can't be ordered together" prompt — opens when the cart holds
  // two fulfilment-restricted items whose windows don't overlap. Luigi 2026-06-14.
  const [fulfilConflictOpen, setFulfilConflictOpen] = useState(false);
  const fulfilConflictShownRef = useRef(false);
  // "Not available for your reservation" prompt — opens when the reservation
  // cart holds an item that isn't offered on the booking day (remove it / rebook
  // a day it's offered), instead of dead-ending at checkout. Luigi 2026-06-16.
  const [reservationCartOpen, setReservationCartOpen] = useState(false);
  const reservationCartShownRef = useRef(false);
  const [reservationOpen, setReservationOpen] = useState(false);
  // Reserve-then-order (Luigi 2026-06-08): when set, the customer is building
  // an order that will be submitted TOGETHER with this table booking (one
  // combined checkout). Carries the booking the server needs to create the
  // linked Reservation, plus the date/time/party for the on-screen banner.
  const [reservationDraft, setReservationDraft] = useState<
    { date: string; time: string; partySize: number; notes: string } | null
  >(null);
  const [couponCode, setCouponCode] = useState("");
  // A code-less personal gift chosen from the account page ("Use this offer" →
  // ?grant=<id>). Forwarded to the preview + order; the server resolves it
  // identity-scoped. Luigi 2026-07-01.
  const [pendingGrantId, setPendingGrantId] = useState<string | null>(null);
  // Live-preview flag: the typed code matches an assigned promo registered to a
  // DIFFERENT email than the one entered at checkout, so it can't apply. Shown
  // as an inline cart note instead of silently dropping (audit confusing#13).
  const [codeEmailMismatch, setCodeEmailMismatch] = useState(false);
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponId, setCouponId] = useState<string | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [promoResults, setPromoResults] = useState<any[]>([]);
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [hasFreeDelivery, setHasFreeDelivery] = useState(false);
  // Promos that qualified but were blocked by the winning exclusive (bumped
  // exclusives + dropped standards). Drives the "can't combine / use this
  // instead" UX and the clearer freebie-removed message. Luigi 2026-06-07.
  const [blockedPromos, setBlockedPromos] = useState<Array<{ promoId: string; name: string; discount: number; winnerName: string; wasExclusive: boolean; couponCode?: string }>>([]);
  // Reward Dollars (store credit) — a signed-in customer's spendable balance +
  // redeem settings (from apply-promos), and how much they chose to apply on this
  // order (default 0 = none; they can also let it accumulate). Luigi 2026-06-27.
  const [rewardInfo, setRewardInfo] = useState<{ balance: number; minRedeemBalance: number; maxRedeemPercent: number; labelSingular: string | null; labelPlural: string | null; redeemExcludedTotal?: number } | null>(null);
  const [creditToApply, setCreditToApply] = useState(0);
  // Cart preview: the first-buy discount was dropped because the email/phone the
  // customer entered turns out to be a returning customer. Drives the gentle
  // "new customers only" note — shown ONLY when the hero banner was visible to
  // them (i.e. they looked new), per Luigi's rule. Luigi 2026-06-09.
  const [firstBuyUnavailable, setFirstBuyUnavailable] = useState(false);
  // Debounced checkout identity → re-evaluate promos ~500ms after they stop
  // typing, so the previewed total settles to the real charge without firing a
  // request per keystroke.
  const [debouncedIdentity, setDebouncedIdentity] = useState({ email: "", phone: "" });
  // Promo IDs the customer manually removed (X) from the cart, so a different
  // non-stackable deal can take over. Sent to apply-promos + order placement.
  const [suppressedPromoIds, setSuppressedPromoIds] = useState<string[]>([]);

  // Remove an applied promo from the cart (X button). Suppressing it re-runs the
  // engine so the next-best deal can take over. Luigi 2026-06-07.
  const removePromo = (promoId: string) =>
    setSuppressedPromoIds((prev) => (prev.includes(promoId) ? prev : [...prev, promoId]));

  // "Use this deal instead" — make a blocked deal apply by removing every
  // exclusive that's keeping it out. A standard deal is blocked by ALL
  // exclusives; an exclusive by every OTHER exclusive. We collect every
  // eligible exclusive (the applied winner + the blocked exclusives) and
  // suppress all of them except the target.
  const useThisPromoInstead = (targetId: string) => {
    const exclusiveIds = new Set<string>();
    for (const r of promoResults) if (r?.stackingRule === "exclusive" && r.promoId) exclusiveIds.add(r.promoId);
    for (const b of blockedPromos) if (b.wasExclusive) exclusiveIds.add(b.promoId);
    exclusiveIds.delete(targetId);
    if (exclusiveIds.size === 0) return;
    setSuppressedPromoIds((prev) => [...new Set([...prev, ...exclusiveIds])]);
  };

  // Re-add a previously removed promo (un-suppress) — e.g. tapping its banner.
  const restorePromo = (promoId: string) =>
    setSuppressedPromoIds((prev) => prev.filter((id) => id !== promoId));

  // A coupon-code promo awaiting the next engine evaluation, so we can tell the
  // customer the TRUTH — "applied" vs "can't combine with your other deal" —
  // instead of an optimistic "applied!" that may be wrong. Luigi 2026-06-07.
  const [pendingCoupon, setPendingCoupon] = useState<string | null>(null);
  // The coupon code the LAST completed apply-promos evaluation was sent with —
  // lets the pending-coupon resolver tell "the engine saw this code and it
  // discounted nothing" apart from "the engine hasn't evaluated it yet"
  // (avoids a false message from a stale in-flight response). Luigi 2026-07-03:
  // a valid code on a cart of promo-EXCLUDED items (gift cards) previously got
  // NO feedback at all — the Apply button just flashed.
  const lastEvalCouponRef = useRef<string>("");

  // Tapping a promo banner: if the customer previously removed (suppressed) it,
  // tapping re-adds it (the "re-apply normally" path); otherwise open its
  // detail/claim modal as usual. Luigi 2026-06-07.
  const openPromoBanner = (promo: typeof promoBanners[number]) => {
    if (suppressedPromoIds.includes(promo.id)) {
      restorePromo(promo.id);
      toast.success(tT("promoReadded", { name: promo.name }));
      return;
    }
    setActivePromoModal(promo);
  };
  const [orderLoading, setOrderLoading] = useState(false);
  // Duplicate-submission guards (Luigi 2026-07-05, after a slow checkout let
  // multiple "Place order" clicks create 2-3 real orders):
  //  - placingRef: SYNCHRONOUS latch — a fast double-tap can fire two click
  //    events before React re-renders the disabled button; a ref can't lose
  //    that race.
  //  - orderIdemKeyRef: per-checkout-attempt idempotency key sent to
  //    /api/orders. Kept across RETRIES of the same attempt (timeout, error,
  //    re-click) so the server maps them all to ONE order; reset when the
  //    cart changes or an order succeeds.
  const placingRef = useRef(false);
  const orderIdemKeyRef = useRef<string | null>(null);
  useEffect(() => { orderIdemKeyRef.current = null; }, [cart]);
  const [activeCategory, setActiveCategory] = useState<string>("");
  /** Transient banner shown after a "Reorder" handshake from the order
   *  status page. Tells the customer "we added N items from your last
   *  order — review and check out." Auto-clears after a few seconds. */
  const [reorderBanner, setReorderBanner] = useState<string | null>(null);
  // Pizza builder state
  const [pizzaItem, setPizzaItem] = useState<MenuItem | null>(null);
  const [activePizzaConfig, setActivePizzaConfig] = useState<PizzaConfig | null>(null);
  // Combo item currently being composed (opens ComboComposerModal).
  const [comboItem, setComboItem] = useState<MenuItem | null>(null);
  // When set, the next "Add to Cart" replaces this index instead of appending.
  const [editingCartIndex, setEditingCartIndex] = useState<number | null>(null);
  // Drives the "Adjust this item?" confirmation dialog.
  const [pendingEditIndex, setPendingEditIndex] = useState<number | null>(null);
  // Default payment method: pick the FIRST accepted method so the
  // checkout picker doesn't start on something the restaurant doesn't
  // actually take. "cash" if accepted (the most common case), otherwise
  // whatever's first in the array.
  //
  // CRITICAL: `acceptedMethods` uses SLUGS ("online_card") but the rest
  // of the codebase (paymentMethod state, placeOrder() Stripe branch,
  // server /api/orders accept check) uses the LEGACY VALUE for the
  // online-card option — which is "card", not "online_card". Without
  // this translation, a marketplace order (acceptedMethods=["online_card"])
  // would default paymentMethod to "online_card" — a value the
  // CheckoutModal summary doesn't recognize, so it falls back to
  // "Cash on Pickup". That was visible to customers as a paradox: the
  // picker showed online card but the summary said cash.
  const slugToValue = (slug: string): string =>
    slug === "online_card" ? "card" : slug;
  // Accepted payment-method SLUGS for the CURRENTLY-selected order type. Per-
  // order-type config (Luigi 2026-06-08): a restaurant can accept different
  // methods for pickup vs delivery vs dine-in. Marketplace orders are online-
  // card-only by platform rule. Reactive to orderType so switching the order
  // type re-filters the checkout's payment options. See lib/payment-methods.ts.
  const acceptedMethods = useMemo(() => {
    if (searchParams.get("from") === "marketplace") return ["online_card"];
    const methods = methodsForOrderType(paymentMethodsRaw, orderType);
    // ShipDay-dispatched delivery MUST be prepaid online (Luigi 2026-07-04):
    // the driver only picks up + drops off — nobody collects cash or taps a
    // card at the door. Strip at-door methods for delivery; the server
    // enforces the same rule (code delivery_prepaid_required).
    if (shipdayPrepaidDelivery && orderType === "delivery") {
      return methods.filter((m) => m === "online_card" || m === "paypal");
    }
    return methods;
  }, [searchParams, paymentMethodsRaw, orderType, shipdayPrepaidDelivery]);
  const defaultPaymentMethod =
    acceptedMethods.includes("cash")
      ? "cash"
      : slugToValue(acceptedMethods[0] ?? "cash");
  const [customerInfo, setCustomerInfo] = useState({
    // Auto-fill from the per-restaurant signed-in customer (set by
    // page.tsx via getCurrentRestaurantCustomer). Avoids retyping
    // name/email/phone on every order if they're logged in.
    name: currentCustomer?.name ?? "",
    email: currentCustomer?.email ?? "",
    phone: currentCustomer?.phone ?? "",
    address: "", city: "", zip: "",
    // Delivery-only extras — apt/unit, buzzer code, and delivery
    // instructions. Concatenated into deliveryAddress + notes at
    // submit time in buildOrderPayload(). Optional.
    unit: "", buzzer: "", deliveryNotes: "",
    // Extra structured address fields for the customizable delivery form
    // (GloriaFood-style). Shown only when the restaurant's config enables
    // them. neighbourhood/building/floor/parking are new; street→address,
    // city→city, postcode→zip, apartment→unit, intercom→buzzer.
    neighbourhood: "", building: "", floor: "", parking: "",
    notes: "", paymentMethod: defaultPaymentMethod, scheduledFor: "", scheduledStyle: "",
    // Marketing-consent opt-in checkbox on the contact section
    // (GloriaFood-parity, Luigi 2026-06-02). Default = TRUE per
    // Luigi's spec — matches the GloriaFood/Toast/Square pattern of
    // pre-ticking the box so the average customer opts in unless they
    // actively uncheck. The customer can still opt OUT at checkout
    // (uncheck) and at any later point from their /account profile or
    // an email-unsubscribe link.
    //
    // Legal note for future reviewers: CASL (Canada) and GDPR (EU)
    // technically require *unticked* defaults. CASL §10 + GDPR
    // Recital 32 both single out "pre-checked boxes" as not valid
    // consent. We're following the US/GloriaFood convention; if a
    // CASL/GDPR complaint ever lands, flip this back to false and
    // the rest of the pipeline (server-side marketingConsentAt stamp)
    // keeps working unchanged.
    //
    // Pre-fill from the signed-in customer's STORED choice so a known
    // opted-out customer sees the box unchecked instead of being
    // silently re-opted-in. Guests (and unknown logged-in state) keep
    // the pre-ticked default; a returning guest's box is corrected once
    // they type a recognised email (see the consent-lookup effect below).
    // Luigi 2026-06-03.
    marketingConsent: currentCustomer?.marketingConsent ?? true,
    // Precise delivery pin coords (Google-maps restaurants only). Set when the
    // customer picks an autocomplete suggestion or drags the map marker; sent
    // to the order so the driver gets an exact location, overriding the
    // server-side address geocode. Null when no pin chosen.
    lat: null as number | null,
    lng: null as number | null,
  });
  const [editingSection, setEditingSection] = useState<null | "contact" | "ordering" | "time" | "payment" | "tips" | "notes">(null);
  // Signed-in customer's saved delivery addresses (RestaurantCustomerAddress) —
  // powers the checkout saved-address picker + the default auto-fill below.
  const [savedAddresses, setSavedAddresses] = useState<Array<{ id: string; label: string | null; street: string; city: string; state: string | null; zip: string | null; lat: number | null; lng: number | null; isDefault: boolean }>>([]);
  // Debounce the entered email/phone so the promo preview re-evaluates ~500ms
  // after the customer stops typing (not on every keystroke). Luigi 2026-06-09.
  useEffect(() => {
    const h = setTimeout(
      () => setDebouncedIdentity({ email: customerInfo.email || "", phone: customerInfo.phone || "" }),
      500,
    );
    return () => clearTimeout(h);
  }, [customerInfo.email, customerInfo.phone]);

  // Silent guest "remember me" (Luigi 2026-06-10): pre-fill the checkout form
  // from contact + delivery details this device saved on a prior order — so a
  // returning guest who never made an account doesn't retype name / email /
  // phone / address every time (GloriaFood-parity). The store is device-global
  // (key `ff-guest-info`, NOT per-restaurant) because it's the customer's own
  // info — so it carries across the marketplace AND every restaurant's direct
  // site, exactly as Luigi asked. A signed-in account always wins (we skip when
  // currentCustomer is set). We only ever fill EMPTY fields, so we never clobber
  // something already typed, the account pre-fill, or the consent-lookup effect.
  // Card data is never stored here (Stripe owns that — PCI-safe). Runs once on
  // mount; best-effort (storage disabled/cleared just means an empty form).
  useEffect(() => {
    if (currentCustomer) return; // signed-in account takes precedence
    try {
      const raw = localStorage.getItem("ff-guest-info");
      if (!raw) return;
      const s = JSON.parse(raw) as Record<string, unknown>;
      const str = (v: unknown) => (typeof v === "string" ? v : "");
      if (!str(s.name) && !str(s.email) && !str(s.phone)) return;
      setCustomerInfo((ci) => ({
        ...ci,
        name: ci.name || str(s.name),
        email: ci.email || str(s.email),
        phone: ci.phone || str(s.phone),
        address: ci.address || str(s.address),
        city: ci.city || str(s.city),
        zip: ci.zip || str(s.zip),
        unit: ci.unit || str(s.unit),
        buzzer: ci.buzzer || str(s.buzzer),
        deliveryNotes: ci.deliveryNotes || str(s.deliveryNotes),
        neighbourhood: ci.neighbourhood || str(s.neighbourhood),
        building: ci.building || str(s.building),
        floor: ci.floor || str(s.floor),
        parking: ci.parking || str(s.parking),
      }));
      setHasSavedGuestInfo(true);
    } catch {}
    // currentCustomer is a stable server prop; run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Signed-in customer → fetch their saved delivery addresses and auto-fill the
  // DEFAULT one. A signed-in account overrides the guest "remember me" effect
  // above, so WITHOUT this a logged-in customer got an EMPTY address box — the
  // exact gap Fabrizio reported (#4). Filling customerInfo.address triggers the
  // debounced geocode below, which resolves the zone + fee. Picking a different
  // saved address (or typing new) flows through the same path. Runs once on
  // mount when logged in; best-effort.
  useEffect(() => {
    if (!currentCustomer) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/public/restaurant-customer/addresses");
        if (!res.ok) return;
        const data = await res.json();
        const list = Array.isArray(data?.addresses) ? data.addresses : [];
        if (cancelled) return;
        setSavedAddresses(list);
        const def = list.find((a: { isDefault?: boolean }) => a.isDefault) ?? list[0];
        if (def) {
          setCustomerInfo((ci) =>
            ci.address ? ci : { ...ci, address: def.street ?? "", city: def.city ?? "", zip: def.zip ?? "", lat: def.lat ?? null, lng: def.lng ?? null },
          );
        }
      } catch {}
    })();
    return () => { cancelled = true; };
    // currentCustomer is a stable server prop; run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "Not you?" — wipe the device-saved guest details and blank the contact +
  // delivery fields so a different person on a shared device starts clean. We
  // keep order-type / payment / scheduling (those aren't identity). Luigi 2026-06-10.
  const clearSavedGuestInfo = () => {
    try { localStorage.removeItem("ff-guest-info"); } catch {}
    setHasSavedGuestInfo(false);
    setCustomerInfo((ci) => ({
      ...ci,
      name: "", email: "", phone: "", address: "", city: "", zip: "",
      unit: "", buzzer: "", deliveryNotes: "",
      neighbourhood: "", building: "", floor: "", parking: "",
      lat: null, lng: null,
    }));
  };

  // Per-order-type payment methods: if the customer switches order type and
  // their currently-selected payment method is no longer accepted for the new
  // type, snap it back to a valid default so checkout can't submit a method the
  // restaurant doesn't take for that type. Luigi 2026-06-08.
  useEffect(() => {
    setCustomerInfo((ci) => {
      if (acceptedMethods.includes(paymentValueToSlug(ci.paymentMethod))) return ci;
      return { ...ci, paymentMethod: defaultPaymentMethod };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acceptedMethods]);

  // Reserve-then-order: enter "ordering for a reservation" mode. Forces dine-in,
  // schedules the order for the booking time, prefills the contact details from
  // the booking, and stores the booking so buildOrderPayload() attaches it.
  // Shared by the on-page reservation modal AND the dedicated reservation page
  // (which hands the draft over via sessionStorage). Luigi 2026-06-08.
  const applyReservationDraft = (d: {
    date: string; time: string; partySize: number;
    name: string; phone: string; email: string; notes: string;
  }) => {
    setReservationDraft({ date: d.date, time: d.time, partySize: d.partySize, notes: d.notes });
    setOrderType("dine_in");
    setCustomerInfo((ci) => ({
      ...ci,
      name: d.name || ci.name,
      email: d.email || ci.email,
      phone: d.phone || ci.phone,
      // The food is for the table time — schedule the order to match.
      scheduledFor: `${d.date}T${d.time}`,
    }));
  };

  // Pick up a booking handed over from the dedicated reservation page
  // (/order/[slug]/reservation → "Add food to your booking"). One-shot: consume
  // + clear the sessionStorage key so a refresh doesn't re-enter reservation
  // mode. Luigi 2026-06-08.
  useEffect(() => {
    let raw: string | null = null;
    try { raw = sessionStorage.getItem("ff_reservation_draft"); } catch { /* ignore */ }
    if (!raw) return;
    try { sessionStorage.removeItem("ff_reservation_draft"); } catch { /* ignore */ }
    try {
      const d = JSON.parse(raw);
      if (d && typeof d.date === "string" && typeof d.time === "string" && Number.isFinite(d.partySize)) {
        applyReservationDraft({
          date: d.date, time: d.time, partySize: Number(d.partySize),
          name: d.name ?? "", phone: d.phone ?? "", email: d.email ?? "", notes: d.notes ?? "",
        });
      }
    } catch { /* malformed — ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Default starts at the SUGGESTED amount (15%). Customer can drag the
  // slider or click "No tip" to override. Luigi 2026-05-29.
  // When the restaurant has tipsEnabled=false, force 0 regardless of
  // client state and skip rendering the selector — see CheckoutDrawer.
  const tipsEnabled = (restaurant as any)?.tipsEnabled !== false;
  const [tipPercent, setTipPercent] = useState<number>(tipsEnabled ? 15 : 0);
  // Per-restaurant currency (ISO 4217). Default to USD so legacy
  // restaurants without the column set fall back to the old behaviour.
  // CarouselCard / GridCard / CheckoutModal pick this up from the
  // CurrencyProvider wrapping the return tree — we use a local helper
  // here because the provider sits inside this component, not above.
  const currencyCode: string = ((restaurant as any)?.currency || "usd").toLowerCase();
  const fmt = (amount: number) => formatCurrency(amount, currencyCode);

  // ── Cart persistence ────────────────────────────────────────────────
  // Save the cart to localStorage scoped per-restaurant-slug so a refresh
  // (or navigating to /account and back) doesn't blow away the in-progress
  // order. Each restaurant has its own cart key — a customer with carts
  // at two restaurants doesn't lose either by visiting the other.
  //
  // We persist on every change (small payload, fast write) and restore
  // once on mount. The cart can hold stale references if the menu
  // changes between save and restore, but order placement already
  // re-validates against the live menu server-side, so stale items would
  // be caught at /api/orders POST. We don't aggressively prune on
  // restore — if a restaurant edits their menu while a customer has
  // items in the cart, that customer sees the items they remembered
  // adding (and gets a clean error at checkout if anything's truly gone).
  //
  // 7-day implicit expiry via cart-stamp: we tag each save with `t`
  // and ignore saves older than 7d on restore. Stops a forgotten cart
  // from a year ago from popping up.
  const CART_STORAGE_KEY = `ff_cart_${restaurant.slug}`;
  const CART_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  // Restore once on mount. Done via a one-shot effect with an empty
  // dep array — we deliberately skip the persistence effect's first
  // run by gating on `cartRestoredRef` so we don't immediately overwrite
  // the just-restored cart with the empty initial state.
  const cartRestoredRef = useRef(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CART_STORAGE_KEY);
      if (!raw) { cartRestoredRef.current = true; return; }
      const parsed = JSON.parse(raw);
      if (
        parsed && typeof parsed === "object" &&
        Array.isArray(parsed.items) &&
        typeof parsed.t === "number" &&
        (Date.now() - parsed.t) < CART_TTL_MS
      ) {
        // Auto-prune SOLD-OUT lines from the restored cart (follow-up to the
        // 2026-07-04 sold-out bypass fix): the server rejects them at checkout,
        // but erroring AFTER the customer filled in their details is hostile —
        // drop the line up-front with a toast naming the dish. Covers the
        // top-level item AND combo/bundle children (the server now checks
        // components too). Other menu drift still follows the gentle rule in
        // the comment above (keep the line, clean error at checkout).
        const soldOutIds = new Set<string>();
        for (const c of (restaurant.menuCategories as Category[]) ?? []) {
          for (const mi of c.menuItems ?? []) if (mi.isSoldOut) soldOutIds.add(mi.id);
        }
        const removedNames: string[] = [];
        const kept = (parsed.items as CartItem[]).filter((ci) => {
          const hitParent = !!ci?.menuItem?.id && soldOutIds.has(ci.menuItem.id);
          const hitChild = Array.isArray(ci?.bundleItems) &&
            ci.bundleItems.some((b) => !!b?.menuItemId && soldOutIds.has(b.menuItemId));
          if (hitParent || hitChild) { removedNames.push(ci?.menuItem?.name ?? ""); return false; }
          return true;
        });
        setCart(kept);
        if (removedNames.length > 0) {
          // Persist the pruned cart NOW: when everything was pruned, kept ([])
          // equals the initial state, so the persistence effect never fires and
          // the stale save would re-toast on every visit.
          try {
            if (kept.length === 0) localStorage.removeItem(CART_STORAGE_KEY);
            else localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ items: kept, t: parsed.t }));
          } catch { /* storage disabled */ }
          for (const name of removedNames.filter(Boolean)) {
            toast.error(tT("itemSoldOutRemoved", { name }));
          }
        }
      }
    } catch { /* malformed — drop silently */ }
    cartRestoredRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!cartRestoredRef.current) return;
    try {
      if (cart.length === 0) {
        localStorage.removeItem(CART_STORAGE_KEY);
      } else {
        localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ items: cart, t: Date.now() }));
      }
    } catch {}
  }, [cart, CART_STORAGE_KEY]);

  // Ref used by the catering auto-fill effect — declared up here so the
  // hook order stays stable across renders. The effect itself lives
  // further down, after `cartHasCatering` / `cateringMinScheduledLocal`
  // are computed.
  const prevCateringRef = useRef(false);

  // ── Reorder handshake ───────────────────────────────────────────────
  // When the customer clicks "Reorder" on /order/[slug]/status/[orderId]
  // the status page navigates here with ?reorder=<orderId> AND writes
  // a sessionStorage key (ff_reorder_<slug> = orderId) so we know the
  // request was user-initiated (vs. a bookmarked URL with the param).
  //
  // We fetch the order, look up each line item in the current menu by
  // menuItemId (the canonical link — names get rewritten over time),
  // resolve the variant by NAME on the current MenuItem (variant IDs
  // can churn after menu edits), and push fresh CartItem rows. Modifiers
  // are intentionally NOT restored: order rows store the modifier name
  // snapshot, not the modifier_option_id, so we'd have to fuzzy-match
  // and risk mis-pricing. Better UX: pre-fill items, tell the customer
  // to re-pick modifiers if they had any.
  const reorderConsumedRef = useRef(false);
  useEffect(() => {
    if (reorderConsumedRef.current) return;
    if (!cartRestoredRef.current) return; // wait for initial cart restore
    const reorderId = searchParams.get("reorder");
    if (!reorderId) return;
    // Sessionstorage handshake — guards against someone pasting a URL
    // with ?reorder=X expecting items they didn't actually own. Still
    // safe even if bypassed (the status page is auth-by-orderId-only),
    // but the handshake gives a clean cancel path on refresh.
    let handshakeOk = false;
    try {
      const stored = sessionStorage.getItem(`ff_reorder_${restaurant.slug}`);
      if (stored === reorderId) {
        handshakeOk = true;
        sessionStorage.removeItem(`ff_reorder_${restaurant.slug}`);
      }
    } catch { /* private mode: skip handshake */ }
    if (!handshakeOk) {
      router.replace(`/order/${restaurant.slug}`, { scroll: false });
      return;
    }
    reorderConsumedRef.current = true;
    (async () => {
      try {
        const res = await fetch(`/api/orders/${encodeURIComponent(reorderId)}`);
        if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
        const ord = await res.json();
        const orderItems: any[] = Array.isArray(ord.items) ? ord.items : [];
        // Build a flat menuItemId → MenuItem index from the CURRENT
        // visibleCategories so a stale order doesn't smuggle hidden /
        // sold-out items back into the cart.
        const itemIndex = new Map<string, MenuItem>();
        for (const c of visibleCategories) for (const mi of c.menuItems) itemIndex.set(mi.id, mi);
        const newCart: CartItem[] = [];
        let dropped = 0;
        let hadMods = false;
        for (const oi of orderItems) {
          // Bundle wrapper rows have menuItemId === null — skip; we
          // don't try to re-trigger the bundle promo flow on reorder.
          if (!oi.menuItemId) { dropped++; continue; }
          const mi = itemIndex.get(oi.menuItemId);
          if (!mi) { dropped++; continue; }
          let variant: ItemVariant | undefined;
          if (oi.variantName) {
            variant = mi.variants?.find((v: ItemVariant) => v.name === oi.variantName) ?? undefined;
          }
          const unitPrice = variant?.price ?? mi.price;
          const qty = Math.max(1, parseInt(oi.quantity, 10) || 1);
          if (Array.isArray(oi.modifiers) && oi.modifiers.length > 0) hadMods = true;
          newCart.push({
            menuItem: mi,
            variant,
            quantity: qty,
            selectedMods: {},
            notes: oi.notes ?? "",
            lineTotal: unitPrice * qty,
            unitPrice,
          });
        }
        if (newCart.length > 0) {
          setCart((prev) => [...prev, ...newCart]);
          setCartOpen(true);
        }
        const parts: string[] = [];
        if (newCart.length > 0) {
          parts.push(`Added ${newCart.length} item${newCart.length === 1 ? "" : "s"} from your previous order.`);
        }
        if (dropped > 0) {
          parts.push(`${dropped} item${dropped === 1 ? "" : "s"} couldn't be re-added — no longer on the menu.`);
        }
        if (hadMods) {
          parts.push("Please review modifiers before checking out.");
        }
        if (parts.length > 0) {
          setReorderBanner(parts.join(" "));
          window.setTimeout(() => setReorderBanner(null), 9000);
        }
      } catch {
        setReorderBanner("Sorry — we couldn't restore that order. Try adding items manually.");
        window.setTimeout(() => setReorderBanner(null), 6000);
      } finally {
        // Strip the query param so a refresh doesn't re-trigger.
        router.replace(`/order/${restaurant.slug}`, { scroll: false });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // ── Cart-abandonment heartbeat ───────────────────────────────────────
  //
  // Pings /api/public/cart-session every time the cart changes (debounced
  // 3s). The server upserts a CartSession row keyed on sessionToken,
  // which the hourly autopilot cron sweeps for stale carts to recover
  // via email.
  //
  // Fire-and-forget — failures are silently dropped (the worst case is
  // a missed recovery email, never a broken cart). The token is stamped
  // into localStorage so a refresh keeps the same identity.
  const CART_SESSION_KEY = `ff_cart_session_${restaurant.slug}`;
  const sessionTokenRef = useRef<string | null>(null);
  const reachedCheckoutRef = useRef(false);
  // Read token on mount (preserved across refresh until order success).
  useEffect(() => {
    try {
      const existing = localStorage.getItem(CART_SESSION_KEY);
      if (existing) sessionTokenRef.current = existing;
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Ensure a token exists once the cart goes from empty to non-empty.
  useEffect(() => {
    if (cart.length === 0) return;
    if (sessionTokenRef.current) return;
    // Generate a token. crypto.randomUUID is broadly available in
    // modern browsers; fall back to Math.random for ancient ones.
    const token =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `ff-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    sessionTokenRef.current = token;
    try { localStorage.setItem(CART_SESSION_KEY, token); } catch {}
  }, [cart.length, CART_SESSION_KEY]);
  // Debounced ping. Re-arms 3 seconds after the LAST cart change.
  useEffect(() => {
    if (cart.length === 0) return;
    if (!sessionTokenRef.current) return;
    const token = sessionTokenRef.current;
    const timer = setTimeout(() => {
      // Snapshot of identity + cart shape — keep payload small so we
      // don't blow out request size on big carts.
      const itemCount = cart.reduce((s, i) => s + i.quantity, 0);
      const cartTotal = cart.reduce((s, i) => s + i.lineTotal, 0);
      const cartJson = cart.map(ci => ({
        name: ci.menuItem.name,
        variant: ci.variant?.name,
        quantity: ci.quantity,
        lineTotal: ci.lineTotal,
      }));
      // Fire-and-forget; never await, never block UI.
      void fetch("/api/public/cart-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantSlug: restaurant.slug,
          sessionToken: token,
          customerEmail: customerInfo.email || null,
          customerPhone: customerInfo.phone || null,
          itemCount,
          cartTotal,
          cartJson,
          reachedCheckout: reachedCheckoutRef.current,
        }),
        keepalive: true,
      }).catch(() => {});
    }, 3000);
    return () => clearTimeout(timer);
  }, [cart, customerInfo.email, customerInfo.phone, restaurant.slug]);

  // ── Reports funnel-step tracking ─────────────────────────────────────
  //
  // PURE SIDE EFFECTS — these useEffect blocks observe existing state
  // and fire fire-and-forget /api/track/event calls. trackEvent never
  // throws (catches internally) and the checkout/order logic is NOT
  // touched. If any of this code is buggy, the worst case is missing
  // analytics rows — the user can still place orders normally.
  //
  // Each step fires at most ONCE per session. The `firedSteps` ref
  // stores which steps have already been logged so re-renders don't
  // duplicate.
  const firedSteps = useRef(new Set<string>());
  const fireStep = useCallback((step: "menu_browsed" | "item_added" | "checkout_open" | "checkout_info" | "payment_open") => {
    if (firedSteps.current.has(step)) return;
    firedSteps.current.add(step);
    trackEvent({ restaurantId: restaurant.id, step });
  }, [restaurant.id]);

  // menu_browsed — fire on first meaningful scroll. 200px past the top
  // is a heuristic for "the customer engaged with the menu, not just
  // bounced." Listener self-removes once fired to avoid wasted work.
  useEffect(() => {
    const onScroll = () => {
      if (window.scrollY > 200) {
        fireStep("menu_browsed");
        window.removeEventListener("scroll", onScroll);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [fireStep]);

  // item_added — first time cart goes from 0 → 1+.
  // Also retroactively fires menu_browsed, since adding an item is
  // proof the customer browsed the menu even if our scroll listener
  // didn't trigger (e.g. menu fit on screen, or the page uses an
  // inner scroll container that doesn't bubble window.scroll). This
  // keeps the funnel internally consistent: item_added > menu_browsed
  // would otherwise be visually nonsensical.
  useEffect(() => {
    if (cart.length > 0) {
      fireStep("menu_browsed");
      fireStep("item_added");
    }
  }, [cart.length, fireStep]);

  // checkout_open — when the checkout modal opens (post-cart-review).
  useEffect(() => {
    if (checkoutOpen) fireStep("checkout_open");
  }, [checkoutOpen, fireStep]);

  // Tracks whether the customer has MANUALLY toggled the marketing checkbox
  // for the CURRENT email. While true, the async consent pre-fill below leaves
  // their choice alone (so an in-progress uncheck is never clobbered). It's
  // reset whenever the email changes — a new email is a fresh consent context.
  const marketingTouchedRef = useRef(false);

  // Called from the checkout checkbox. Records the manual toggle so the
  // pre-fill can't override it, then writes the new value.
  const handleMarketingToggle = useCallback((checked: boolean) => {
    marketingTouchedRef.current = true;
    setCustomerInfo((ci) => ({ ...ci, marketingConsent: checked }));
  }, []);

  // Consent pre-fill, keyed on the email. A CHANGED email is a fresh consent
  // decision, so the moment it changes we:
  //   1. clear the manual-toggle flag, and
  //   2. IMMEDIATELY reset the box to the pre-ticked default — this is what
  //      re-checks the box the instant you switch from an opted-out email to a
  //      new/different one (no waiting on the async lookup). It's effectively
  //      the "refresh the checkbox on every email change" behaviour.
  // The debounced lookup then ONLY un-checks the box if the new email turns out
  // to be a KNOWN opted-out customer. Once the customer manually ticks/unticks
  // for this email, the touched-guard makes their choice win so a late async
  // result can't clobber it. Luigi 2026-06-04.
  useEffect(() => {
    const email = customerInfo.email.trim();
    marketingTouchedRef.current = false;
    // Instant re-check on email change (idempotent — no-op if already checked).
    setCustomerInfo((ci) =>
      ci.marketingConsent === true ? ci : { ...ci, marketingConsent: true },
    );
    if (!email || !email.includes("@")) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      fetch(
        `/api/public/restaurant-customer/consent?slug=${encodeURIComponent(
          restaurant.slug,
        )}&email=${encodeURIComponent(email)}`,
      )
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (cancelled || marketingTouchedRef.current) return;
          // Only opt DOWN to unchecked for a known opted-out email; the
          // synchronous reset above already handles the re-check otherwise.
          if (d && d.marketingConsent === false) {
            setCustomerInfo((ci) =>
              ci.email.trim() === email ? { ...ci, marketingConsent: false } : ci,
            );
          }
        })
        .catch(() => {});
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [customerInfo.email, restaurant.slug]);

  // checkout_info — once name + phone are minimally valid. Lightweight
  // validation matches the server's required fields without redoing
  // the regex (saves needing to import a validator).
  useEffect(() => {
    if (customerInfo.name.trim().length >= 2 && customerInfo.phone.trim().length >= 7) {
      fireStep("checkout_info");
    }
  }, [customerInfo.name, customerInfo.phone, fireStep]);
  // ────────────────────────────────────────────────────────────────────

  // Delivery-zone resolution for the customer's address.
  const deliveryZones: ZoneLike[] = (restaurant.deliveryZones ?? []) as ZoneLike[];
  const hasZones = deliveryZones.length > 0 && restaurant.lat != null && restaurant.lng != null;
  const [customerCoords, setCustomerCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const categoryRefs = useRef<Record<string, HTMLElement>>({});
  const pillRef = useRef<HTMLDivElement>(null);
  // Menu search query (Luigi 2026-05-31). Drives client-side filtering
  // of categories + items by name + description. CloudWaitress-style
  // always-visible search bar above the category pills.
  const [menuSearchQuery, setMenuSearchQuery] = useState("");
  // Track whether the category pill row can scroll further left/right so
  // we can show/hide the desktop nav arrows. Recomputed on scroll +
  // resize so the arrows accurately reflect overflow state at all
  // times. Mobile users still use touch/swipe — arrows are a hover
  // affordance for mouse + trackpad users.
  const [pillScrollState, setPillScrollState] = useState<{ left: boolean; right: boolean }>({ left: false, right: false });
  useEffect(() => {
    const el = pillRef.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      setPillScrollState({ left: el.scrollLeft > 2, right: el.scrollLeft < max - 2 });
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", update); ro.disconnect(); };
  }, []);
  const nudgePills = (dir: -1 | 1) => {
    const el = pillRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(200, el.clientWidth * 0.7), behavior: "smooth" });
  };

  // Day-of-week in the RESTAURANT's local timezone — NOT the customer's
  // browser TZ. A customer in PST ordering from an EST restaurant at
  // 9:55 PM PST sees Wednesday-night hours from a Wed→Thu overnight row
  // when the actual current day at the restaurant is already Thursday.
  // Luigi 2026-05-30: "restaurant hours should be consistent EVERYWHERE."
  const restaurantTz = restaurant.timezone ?? undefined;
  const { dow: today } = localDowAndHHMM(new Date(), restaurantTz);
  // GENERAL (service=null) row drives the header hours — NOT the first matching
  // row, which could be a per-service override (e.g. Pickup 14:00) and made the
  // header show the wrong opening time (Fabrizio 2026-06-22). Fall back to any row
  // for the day only if no general row exists.
  const todayHours =
    restaurant.openingHours?.find((h: any) => h.dayOfWeek === today && !h.service)
    ?? restaurant.openingHours?.find((h: any) => h.dayOfWeek === today);

  // Visible categories and items, merging category-level modifier groups into each item.
  // Visibility (show/hide, scheduled) is the GloriaFood-style isVisibleNow model;
  // a separate availability path below still gates ordering (Phase 2 territory).
  const visNow = new Date();
  // Reserve-then-order LOCKS the order time to the booking moment (there's no
  // schedule picker — the food is for the table). So a day/time-restricted item
  // must be judged against that booking moment, NOT "now", and if it doesn't fit
  // it can't be ordered at all (it can't be rescheduled to a valid slot). Built
  // from the booking's restaurant-local wall clock so the day/time match the
  // reservation regardless of the customer's own timezone. null = not ordering
  // for a reservation (ASAP / order-ahead keep the schedule-to-a-valid-slot
  // behaviour). Luigi 2026-06-16.
  const reservationMoment: Date | null = (() => {
    if (!reservationDraft) return null;
    const [hh, mm] = reservationDraft.time.split(":").map((s) => parseInt(s, 10));
    return parseLocalDateTimeInTz(
      reservationDraft.date,
      Number.isFinite(hh) ? hh : 0,
      Number.isFinite(mm) ? mm : 0,
      restaurantTz,
    );
  })();
  // Service-restriction display mode (Fabrizio cmr803ovq): "hide" (historic
  // behavior) removes a pickup-/delivery-only dish from the other service's
  // menu; "label" keeps it visible but greyed with an "Available for … only"
  // note (rides the existing __availabilityBlocked card pipeline). Category-
  // level restriction composes with the item flags: a dish is orderable for
  // this service only when BOTH its own flag AND its category's flag allow it.
  const showServiceLabel = theme.serviceRestrictedDisplay === "label";
  const catServiceOk = (c: Category) =>
    orderType === "delivery" ? (c.forDelivery ?? true) : (c.forPickup ?? true);
  const visibleCategories: Category[] = (restaurant.menuCategories as Category[])
    .filter(c => isVisibleNow(c, visNow, restaurantTz))
    // A fully service-restricted category disappears in "hide" mode; in
    // "label" mode it stays and every dish inside renders the notice.
    .filter(c => catServiceOk(c) || showServiceLabel)
    .map(c => {
      const catGroups: ModGroup[] = (c.modifierGroups ?? []).filter((g: ModGroup) => !g.isHidden);
      return {
        ...c,
        menuItems: c.menuItems
          .filter(i =>
            isVisibleNow(i, visNow, restaurantTz) &&
            // Delivery uses forDelivery; pickup / dine-in / take-out all use
            // the pickup availability flag (they're pickup-style channels).
            // Item flag AND category flag; "label" mode keeps the dish
            // visible (greyed + noted in the map below).
            (((orderType === "delivery" ? i.forDelivery : i.forPickup) && catServiceOk(c)) || showServiceLabel) &&
            // availabilityMode "show" keeps the item VISIBLE outside its TIME
            // window — greyed with an "Available …" note, not addable — but
            // only on days it's actually sold: on an excluded DAY it hides
            // entirely (reseller report cmpxec829 + Fabrizio's follow-up).
            (isItemAvailableNow(i, restaurantTz) ||
              ((i as any).availabilityMode === "show" && isItemDayAvailable(i, restaurantTz)) ||
              // Phase 2 Fulfilment Time: visible EVERY day regardless of the
              // legacy time gate — the customer schedules the order for a valid
              // slot (forced, like catering), so it must always be addable.
              hasFulfilWindow(i))
          )
          .map(item => {
            // Merge: item-level groups first (in their sortOrder), then category-level
            // Skip category groups whose libraryGroupId is already in item groups
            const itemLibraryIds = new Set(
              item.modifierGroups.map((g: any) => g.libraryGroupId).filter(Boolean)
            );
            const uniqueCatGroups = catGroups.filter(
              cg => !(itemLibraryIds.has((cg as any).libraryGroupId ?? cg.id) || itemLibraryIds.has(cg.id))
            );
            // Day/time-limited items always carry their human-readable
            // window ("Available Mon, Fri · 12:00 – 15:00") so customers see
            // WHEN a special is sold even while it's currently purchasable
            // (Fabrizio's follow-up on cmpxec829). A separate blocked flag
            // drives the grey-out + add-to-cart gate — the note alone no
            // longer implies "blocked".
            const window = itemAvailabilityWindow(item, hoursFmt);
            const availabilityNote = window
              ? t("availableOnlyLabel", { window })
              : undefined;
            // Phase 2 Fulfilment Time badge — shown on the item whenever it
            // carries a fulfilment window so customers see "Order ahead —
            // available Tue" before adding. The item stays addable; the cart's
            // combine-logic forces a valid scheduled slot (like catering).
            const fulfilWin = hasFulfilWindow(item) ? itemFulfilWindow(item, hoursFmt) : "";
            // In reservation mode judge the fulfilment window against the BOOKING
            // moment: true/false = fits / doesn't fit the booking; null = not in
            // reservation mode (so the normal "order ahead" path applies).
            const reservationFulfilable =
              reservationMoment && hasFulfilWindow(item)
                ? isFulfilableAt(item, reservationMoment, restaurantTz)
                : null;
            const fulfilNote = !fulfilWin
              ? undefined
              : reservationMoment
                // Reservation: flag it only when it DOESN'T fit the booking (then
                // it's blocked below); if it fits, it's a normal addable item.
                ? (reservationFulfilable ? undefined : t("fulfilNotForReservationLabel", { window: fulfilWin }))
                // ASAP / order-ahead: ALWAYS show just the availability window
                // ("Available · days · times"), never "Order ahead" — the window
                // already says WHEN it's available, and "order ahead" is
                // misleading (Fabrizio 2026-06-16, esp. when inside a valid
                // window). If today isn't in the window, the cart's forced
                // scheduling still guides the customer to a valid slot.
                : t("availableOnlyLabel", { window: fulfilWin });
            // Service restriction note (Fabrizio cmr803ovq): only in "label"
            // mode — the dish (or its whole category) isn't offered for the
            // selected service, so it renders greyed with "Available for …
            // only" instead of vanishing. The note names the service the dish
            // IS available for.
            const itemServiceOk = orderType === "delivery" ? item.forDelivery : item.forPickup;
            const serviceOk = itemServiceOk && catServiceOk(c);
            const serviceNote = !serviceOk && showServiceLabel
              ? (orderType === "delivery" ? t("pickupOnlyLabel") : t("deliveryOnlyLabel"))
              : undefined;
            return {
              ...item,
              categoryId: c.id,
              modifierGroups: [...item.modifierGroups, ...uniqueCatGroups],
              // The categorical service note wins over the time-window note.
              __availabilityNote: serviceNote ?? availabilityNote,
              // Blocked (greyed + not addable) by a service restriction, the
              // legacy time gate OR, in reservation mode, when the item can't
              // be made for the booking day/time — there's no picker to
              // reschedule it onto a valid slot.
              __availabilityBlocked:
                (!serviceOk || !isItemAvailableNow(item, restaurantTz) || reservationFulfilable === false) || undefined,
              __fulfilNote: fulfilNote,
              // Greyed (but addable) when an ASAP order couldn't be fulfilled
              // right now — signals "you'll need to schedule this". Only OUTSIDE
              // reservation mode, where a valid future slot can actually be picked.
              __fulfilNeedsSchedule:
                (!reservationMoment && fulfilWin && !isFulfilableAt(item, visNow, restaurantTz)) || undefined,
            };
          }),
      };
    })
    // Apply menu search filter. Case-insensitive substring match
    // against item name + description + category name. If the query
    // matches the category name itself, all items in the category
    // are kept (so searching "pizza" shows the whole Pizza section).
    .map(c => {
      const q = menuSearchQuery.trim().toLowerCase();
      if (!q) return c;
      if (c.name.toLowerCase().includes(q)) return c;
      return {
        ...c,
        menuItems: c.menuItems.filter((i) => {
          const hay = `${i.name} ${i.description ?? ""}`.toLowerCase();
          return hay.includes(q);
        }),
      };
    })
    .filter(c => c.menuItems.length > 0);

  // Set first visible category active
  useEffect(() => {
    if (visibleCategories.length && !activeCategory) setActiveCategory(visibleCategories[0].id);
  }, [visibleCategories.length]);

  // ── Collapsible categories (GloriaFood-style accordion) ──────────────────
  // Opt-in per restaurant (theme.mobileCollapsibleCategories) — on BOTH mobile
  // AND desktop (Luigi 2026-06-30). The customer expands/collapses category
  // sections, with Expand all / Collapse all controls. Every category starts
  // COLLAPSED on both devices (see the seed effect) so the customer lands on a
  // compact list of category banners and opens the ones they want. Luigi 2026-07-01.
  const isMobile = useIsMobile();
  // Suspended while a search is active so matching items are always visible
  // (a collapsed header would hide the very results they want).
  const collapsibleActive =
    !!(theme as any).mobileCollapsibleCategories && !menuSearchQuery.trim();
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());
  // Customer can collapse the promo strip so the specials don't eat the whole page
  // (mobile + desktop). Mirrors the collapsible-category chevron. Luigi 2026-06-22.
  const [promosCollapsed, setPromosCollapsed] = useState(false);
  // Seed "all collapsed" the first time the accordion becomes active (so it
  // doesn't fight the customer if they later expand things). When a search
  // filters the menu we leave their open/closed choices intact.
  const collapseSeededRef = useRef(false);
  useEffect(() => {
    // Seed "all collapsed" on BOTH mobile and desktop the first time the
    // accordion turns on — the customer opens the categories they want rather
    // than scrolling a fully-expanded menu. `isMobile` stays in the deps so the
    // effect re-checks on a breakpoint change (the seededRef guards re-seeding).
    // Luigi 2026-07-01 (was mobile-only before).
    if (collapsibleActive && !collapseSeededRef.current && visibleCategories.length) {
      collapseSeededRef.current = true;
      setCollapsedCats(new Set(visibleCategories.map((c) => c.id)));
    }
    if (!collapsibleActive) collapseSeededRef.current = false;
  }, [collapsibleActive, isMobile, visibleCategories.length]);
  const toggleCatCollapsed = (id: string) =>
    setCollapsedCats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const expandAllCats = () => setCollapsedCats(new Set());
  const collapseAllCats = () => setCollapsedCats(new Set(visibleCategories.map((c) => c.id)));

  // Debounced geocode + zone lookup whenever the delivery address changes.
  useEffect(() => {
    if (orderType !== "delivery" || !hasZones) {
      setCustomerCoords(null);
      setGeocodeError(null);
      return;
    }
    const addressParts = [customerInfo.address, customerInfo.city, customerInfo.zip].filter(Boolean);
    if (addressParts.length === 0) {
      setCustomerCoords(null);
      setGeocodeError(null);
      return;
    }
    const fullAddress = addressParts.join(", ");
    const handle = setTimeout(async () => {
      setGeocoding(true);
      setGeocodeError(null);
      const coords = await geocodeAddress(fullAddress);
      setGeocoding(false);
      if (!coords) {
        setCustomerCoords(null);
        setGeocodeError("We couldn't locate that address — please double-check the spelling.");
        return;
      }
      setCustomerCoords(coords);
    }, 700);
    return () => clearTimeout(handle);
  }, [customerInfo.address, customerInfo.city, customerInfo.zip, orderType, hasZones]);

  const resolvedZone = hasZones && customerCoords
    ? findZoneForPoint(deliveryZones, restaurant.lat, restaurant.lng, customerCoords.lat, customerCoords.lng)
    : null;

  // Auto-apply promos when cart changes (or when the resolved delivery
  // zone changes — a delivery-area-restricted promo only activates once
  // we know which zone the address is in, which happens after the
  // geocode lookup above).
  useEffect(() => {
    if (cart.length === 0) { setPromoDiscount(0); setPromoResults([]); setHasFreeDelivery(false); promosEvaluatedRef.current = true; seenPromoIdsRef.current = new Set(); return; }
    const sub = cart.reduce((s, i) => s + i.lineTotal, 0);
    // Captured per-request so the response handler can record WHICH code this
    // evaluation actually included (see lastEvalCouponRef).
    const evalCoupon = couponCode.trim().toUpperCase();
    fetch("/api/public/apply-promos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurantSlug: restaurant.slug, orderType, subtotal: sub,
        // Skip bundle line items — their price is the owner's fixed bundle
        // price, and feeding the synthetic `bundle:<id>` menuItemId into
        // the public promo engine would either no-op (lookup fails) or
        // double-discount. Bundles are self-contained discounts.
        items: cart.map((ci, i) => ({ ci, i })).filter((x) => !x.ci.isBundle).map(({ ci, i }) => ({
          menuItemId: ci.menuItem.id,
          categoryId: ci.menuItem.categoryId,
          variantId: ci.variant?.id ?? null,
          // Stable per-cart-line key = the ORIGINAL cart index (assigned before the
          // bundle filter shifts positions). Lets the engine attribute each
          // discounted unit back to the exact line, so "You saved" no longer lands
          // only on the first line when the same dish is on two lines. Luigi 2026-06-30.
          lineKey: String(i),
          // Effective per-unit price = lineTotal / qty, which is ALWAYS
          // modifier-inclusive and consistent with subtotal. Using unitPrice/
          // variant/base here omitted paid modifiers for standard modal items
          // (which don't set unitPrice), so a per-unit promo (BOGO / free item /
          // free dish / once-per-order %) previewed the discount off the base
          // price while the charge route nets base+mods — preview != charge
          // (audit confusing#8). The charge route stays authoritative; this only
          // makes the PREVIEW match it. Luigi 2026-06-26.
          price: ci.quantity > 0
            ? Math.round((ci.lineTotal / ci.quantity) * 100) / 100
            : (ci.unitPrice ?? ci.variant?.price ?? ci.menuItem.price),
          quantity: ci.quantity,
          subtotal: ci.lineTotal,
          // Tag promo-freebie lines so free_item frees the CLAIMED item + the
          // freed unit doesn't unlock its own trigger (audit). Luigi 2026-06-27.
          isFreebie: typeof ci.notes === "string" && ci.notes.startsWith("Free with promo:"),
        })),
        // Phase 2a restriction input — forward the resolved delivery
        // zone (so Delivery Area-restricted promos like "Free delivery
        // in Zone 1-7" trigger). Undefined when not applicable —
        // e.g. pickup orders skip deliveryZoneId. (The member flag is no
        // longer sent: the server derives it from the session cookie, the
        // same canonical signal the charge uses — Blocker #7.)
        deliveryZoneId: orderType === "delivery" && resolvedZone?.inside ? resolvedZone.zone.id : undefined,
        // Acquisition channel → the preview only applies promos channelled to
        // this customer's channel (website vs marketplace). Luigi 2026-06-09.
        channel: customerChannel,
        // First-buy preview gating: optimistically treat the visitor as NEW
        // unless we can already tell they're returning (same rule as the hero
        // banner) — so the first-order discount shows in the cart. The server
        // re-derives this authoritatively once email/phone are entered, so the
        // shown total always matches the real charge. Luigi 2026-06-09.
        isNewCustomer: !customerIsReturning && !hasOrderedHere,
        email: debouncedIdentity.email || undefined,
        phone: debouncedIdentity.phone || undefined,
        // Customer-typed coupon code — engine matches it against
        // Promotion.couponCode in the couponPromos branch. Required
        // for autoApply=false promos to fire. Empty string is fine
        // (engine ignores). Auto-apply promos don't need this.
        couponCode: couponCode.trim() || undefined,
        // Scheduled fulfillment time → Happy-Hour windows are evaluated against
        // WHEN the order is for, so the banner + discount match what actually
        // applies at order time. ASAP carts send nothing. Fabrizio cmpxejjev.
        scheduledFor: customerInfo.scheduledFor || undefined,
        // Selected payment method → payment-restricted promos ("5% when you
        // pay online") only apply once the customer actually picks an
        // eligible method. Without this the discount applied even with Cash
        // selected. The engine normalizes the legacy "card" value. Fabrizio
        // 2026-06-07.
        paymentMethod: customerInfo.paymentMethod || undefined,
        // Deals the customer manually removed from the cart — excluded so a
        // different non-stackable deal can apply instead.
        suppressedPromoIds,
        // Code-less personal gift (?grant=): server re-resolves it identity-
        // scoped and forces its promo into the engine so it competes. Undefined
        // for normal carts.
        grantId: pendingGrantId || undefined,
      }),
    })
      .then(r => r.json())
      .then(data => {
        const applied = (data.applied ?? []) as Array<{ promoId: string; name: string; discount: number }>;
        // Toast the moment a NEW promo unlocks (e.g. adding the 2nd pizza fires
        // BOGO) — instant "you got a deal!" feedback, GloriaFood-style. Only on a
        // genuinely new promo (not on page load / restored cart, and not on every
        // re-eval of the same deal). Luigi 2026-06-27.
        const prevSeen = seenPromoIdsRef.current;
        if (prevSeen) {
          for (const p of applied) {
            if (p.discount > 0 && !prevSeen.has(p.promoId)) {
              toast.success(tT("promoUnlocked", { name: p.name }), { icon: "🎉", duration: 4000 });
            }
          }
        }
        seenPromoIdsRef.current = new Set(applied.map((p) => p.promoId));
        setPromoResults(applied);
        setPromoDiscount(data.totalDiscount ?? 0);
        setHasFreeDelivery(data.hasFreeDelivery ?? false);
        setBlockedPromos(Array.isArray(data.blockedPromos) ? data.blockedPromos : []);
        setFirstBuyUnavailable(!!data.newCustomerOfferUnavailable);
        setCodeEmailMismatch(!!data.promoCodeEmailMismatch);
        setRewardInfo(data.reward ?? null);
        // Keep the chosen credit within the new spendable ceiling as the cart /
        // identity changes (e.g. balance only known after sign-in/email).
        if (!data.reward) setCreditToApply(0);
        lastEvalCouponRef.current = evalCoupon;
        promosEvaluatedRef.current = true;
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, orderType, resolvedZone?.zone.id, resolvedZone?.inside, currentCustomer, couponCode, customerInfo.scheduledFor, customerInfo.paymentMethod, suppressedPromoIds, debouncedIdentity, customerIsReturning, hasOrderedHere, pendingGrantId]);

  const subtotal = cart.reduce((s, i) => s + i.lineTotal, 0);

  // Per-line "You saved X" badges for the CART drawer (Fabrizio cmqv33v2o
  // follow-up, 2026-07-03 — they only showed at checkout; useful in the cart
  // too when only SOME items are discounted). Identical attribution to
  // CheckoutModal's savedForLine: precise engine lineKey first, legacy
  // sum-by-menuItemId-on-first-matching-line fallback. Whole-cart promos have
  // no breakdown → no per-line badge (they show in the totals).
  const drawerSavedForLine = useMemo(() => {
    const byKey = new Map<string, number>();
    const byItem = new Map<string, number>();
    for (const p of promoResults as any[]) {
      if (!p?.breakdown) continue;
      for (const b of p.breakdown) {
        if (b.lineKey != null) byKey.set(String(b.lineKey), (byKey.get(String(b.lineKey)) ?? 0) + b.amount);
        else byItem.set(b.menuItemId, (byItem.get(b.menuItemId) ?? 0) + b.amount);
      }
    }
    const shown = new Set<string>();
    return cart.map((ci, i) => {
      const k = byKey.get(String(i));
      if (k != null && k > 0) return k;
      const id = ci.menuItem?.id;
      if (!id) return 0;
      const amt = byItem.get(id);
      if (!amt || shown.has(id)) return 0;
      shown.add(id);
      return amt;
    });
  }, [promoResults, cart]);
  // ── Promo time-window helpers (shared with the engine via promo-window) ──
  // Is a promo redeemable for the customer's CURRENT order time — ASAP now, or
  // their chosen "order for later" time? Drives the nudge, the free-item
  // auto-prompt, and the claim modal's gating so the customer is never offered
  // a discount they can't actually get for this order. Luigi 2026-06-07.
  // (restaurantTz is declared above for the hours logic.)
  const promoIsUsable = (p: { daysOfWeek?: string | null; usableHourStart?: number | null; usableHourEnd?: number | null }) =>
    promoUsableNow(p, { scheduledFor: customerInfo.scheduledFor || null, tz: restaurantTz });
  const promoWindowLabelFor = (p: { usableHourStart?: number | null; usableHourEnd?: number | null }): string | null =>
    typeof p.usableHourStart === "number" && typeof p.usableHourEnd === "number"
      ? `${formatMinutes(p.usableHourStart, hoursFmt)}–${formatMinutes(p.usableHourEnd, hoursFmt)}`
      : null;

  // "Add €X more to unlock!" nudge. highlightThreshold is the cart value at
  // which to START nudging (Luigi 2026-06-07: NOT "within €X of the minimum" —
  // a single small item shouldn't trigger it). Among auto-apply promos that are
  // usable for the current order time and order-type, show the one closest to
  // unlocking once the cart has reached its highlight value.
  const promoNudge = (() => {
    if (subtotal <= 0) return null;
    // Canonical order-type matching — handles "both", single values, JSON-array
    // multi-channel promos, and dine_in/take_out spelling. The old naive
    // `p.orderType !== orderType` silently skipped every multi-channel promo.
    const canon = (t: string) => {
      const k = String(t).toLowerCase().replace(/[\s-]+/g, "_");
      return k === "takeout" ? "take_out" : k === "dinein" ? "dine_in" : k;
    };
    const allowsOrderType = (raw: string | undefined, ot: string) => {
      if (!raw || raw === "both") return true;
      let set: string[] = [];
      if (String(raw).trim().startsWith("[")) {
        try { const a = JSON.parse(raw); set = Array.isArray(a) ? a.map(String) : []; } catch { set = []; }
      } else set = [String(raw)];
      return set.length === 0 || set.map(canon).includes(canon(ot));
    };
    let best: { name: string; remaining: number } | null = null;
    for (const p of promoBanners) {
      const ht = p.highlightThreshold ?? 0;
      if (!p.autoApply || ht <= 0) continue;
      if (!allowsOrderType(p.orderType, orderType)) continue;
      // Don't nudge toward a promo that can't be redeemed for this order time.
      if (!promoIsUsable(p)) continue;
      // Effective threshold to unlock: the cart minimum, or a free-item spend
      // trigger (so "spend $100, get a free item" promos nudge too).
      let rc: any = p.ruleConfig;
      if (!rc || typeof rc !== "object") { try { rc = JSON.parse((p as any).rules || "{}"); } catch { rc = {}; } }
      const trigger = typeof rc?.triggerAmount === "number" ? rc.triggerAmount : 0;
      const threshold = Math.max(p.minimumOrder ?? 0, trigger);
      if (threshold <= 0) continue;
      const remaining = threshold - subtotal;
      // Start nudging once the cart REACHES the highlight value (and is still
      // below the unlock minimum) — count down the remaining from there.
      if (subtotal >= ht && remaining > 0 && (!best || remaining < best.remaining)) {
        best = { name: p.name, remaining };
      }
    }
    return best;
  })();

  // Auto-prompt for unlocked "Get a free item" promos (Luigi 2026-06-07). A
  // free_item promo can't auto-apply its discount until the free item is in the
  // cart — so when the cart crosses the promo's threshold AND the order type
  // matches, pop the promo's claim modal ONCE so the customer doesn't miss it.
  useEffect(() => {
    if (activePromoModal) return; // a modal is already open
    const canon = (t: string) => {
      const k = String(t).toLowerCase().replace(/[\s-]+/g, "_");
      return k === "takeout" ? "take_out" : k === "dinein" ? "dine_in" : k;
    };
    const allowsOrderType = (raw: string | undefined, ot: string) => {
      if (!raw || raw === "both") return true;
      let set: string[] = [];
      if (String(raw).trim().startsWith("[")) {
        try { const a = JSON.parse(raw); set = Array.isArray(a) ? a.map(String) : []; } catch { set = []; }
      } else set = [String(raw)];
      return set.length === 0 || set.map(canon).includes(canon(ot));
    };
    const target = promoBanners.find((p) => {
      if (p.promotionType !== "free_item" || !p.autoApply) return false;
      if (autoPromptedFreebies.has(p.id)) return false;
      if (!allowsOrderType(p.orderType, orderType)) return false;
      // Don't auto-prompt a free item the customer can't redeem for this order
      // time — it would only apply if they scheduled into the promo's window.
      if (!promoIsUsable(p)) return false;
      let rc: any = p.ruleConfig;
      if (!rc || typeof rc !== "object") { try { rc = JSON.parse((p as any).rules || "{}"); } catch { rc = {}; } }
      const trigger = typeof rc?.triggerAmount === "number" ? rc.triggerAmount : 0;
      const threshold = Math.max(p.minimumOrder ?? 0, trigger);
      if (threshold <= 0 || subtotal < threshold) return false;
      // Already claimed? addFreebieToCart tags the free line with the promo name.
      if (cart.some((ci) => ci.notes === `Free with promo: ${p.name}`)) return false;
      return true;
    });
    if (target) {
      setActivePromoModal(target);
      setAutoPromptedFreebies((prev) => new Set(prev).add(target.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal, orderType, cart, promoBanners, activePromoModal, autoPromptedFreebies, customerInfo.scheduledFor]);

  // Remove "Free with promo" lines whose promo no longer applies (e.g. the cart
  // dropped below the threshold). Otherwise the customer is charged for an item
  // they only added because it was free — and a variant-required freebie blocks
  // checkout. Only runs after the engine has evaluated the cart at least once.
  // Luigi 2026-06-07.
  useEffect(() => {
    if (!promosEvaluatedRef.current) return;
    const PREFIX = "Free with promo: ";
    const appliedNames = new Set(promoResults.map((r: { name: string }) => r.name));
    // A freebie can fall off for two different reasons; the message should say
    // which. If its promo is in blockedPromos, it DID qualify but lost to a
    // bigger non-stackable deal — don't tell the customer they "no longer
    // qualify" (they do). Luigi 2026-06-07.
    const bumpedWinner = new Map(blockedPromos.map((b) => [b.name, b.winnerName]));
    const stale = (ci: { notes?: string }) =>
      typeof ci.notes === "string" && ci.notes.startsWith(PREFIX) && !appliedNames.has(ci.notes.slice(PREFIX.length));
    const removed = cart.find(stale);
    if (removed) {
      setCart((prev) => prev.filter((ci) => !stale(ci)));
      const promoName = (removed.notes ?? "").slice(PREFIX.length);
      const winner = bumpedWinner.get(promoName);
      toast(
        winner
          ? tT("freebieRemovedExclusive", { name: removed.menuItem.name, winner })
          : tT("freebieRemovedThreshold", { name: removed.menuItem.name }),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promoResults]);

  // Resolve a just-applied coupon code once the engine has re-evaluated: tell
  // the customer the truth — "applied" vs "can't combine with your other deal"
  // (with a one-tap swap in the cart). Replaces the old optimistic "applied!"
  // toast that lied when an exclusive won. Luigi 2026-06-07.
  useEffect(() => {
    if (!pendingCoupon) return;
    const code = pendingCoupon;
    const applied = promoResults.find((r: any) => String(r.couponCode ?? "").toUpperCase() === code);
    if (applied) {
      toast.success(tT("couponPromoApplied", { name: applied.name }));
      setPendingCoupon(null);
      return;
    }
    const blocked = blockedPromos.find((b) => String(b.couponCode ?? "").toUpperCase() === code);
    if (blocked) {
      // Compare REAL savings before claiming anything. The applied (winning)
      // deal doesn't always save more — an exclusive blocks a standard by rule,
      // not by amount. If the coupon the customer just entered saves MORE, do
      // the right thing: switch to it (removing the blockers). Only when the
      // applied deal genuinely saves more do we keep it + say so. Either way the
      // customer can still swap manually in the cart. Luigi 2026-06-08.
      const winnerDiscount = promoResults.find((r: any) => r.name === blocked.winnerName)?.discount ?? 0;
      if (blocked.discount > winnerDiscount + 0.005) {
        useThisPromoInstead(blocked.promoId);
        toast.success(tT("couponSwitchedSavesMore", { name: blocked.name, winner: blocked.winnerName }));
      } else {
        toast(tT("couponBlocked", { name: blocked.name, winner: blocked.winnerName }), { duration: 6000 });
      }
      setPendingCoupon(null);
      return;
    }
    // The engine HAS evaluated this exact code (the last completed pass was
    // sent with it) and the promo is in neither list → the code is valid but
    // discounts nothing on THIS cart (promo-excluded items like gift cards,
    // an unmet minimum, wrong order type/time…). Say so instead of staying
    // silent — Luigi 2026-07-03: Apply just "flashed" on a gift-card-only cart.
    if (lastEvalCouponRef.current === code) {
      toast(tT("couponNoEffect", { code }), { icon: "ℹ️", duration: 7000 });
      setPendingCoupon(null);
    }
    // Otherwise the engine hasn't evaluated this code yet; a later
    // promoResults/blockedPromos update resolves it. (No false message.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promoResults, blockedPromos, pendingCoupon]);

  // ── Catering detection ─────────────────────────────────────────────
  // An item is treated as catering when EITHER its own isCatering flag
  // is set OR it lives in a category with isCatering set. We build a
  // Set of catering menuItem IDs from the current visible menu (cheap
  // — a few hundred ids at most) and probe the cart against it.
  const cateringNoticeHours: number =
    typeof restaurant.cateringNoticeHours === "number" && restaurant.cateringNoticeHours > 0
      ? restaurant.cateringNoticeHours
      : 24;
  const cateringItemIds = new Set<string>();
  for (const c of (restaurant.menuCategories as any[] ?? [])) {
    const catIsCatering = !!c.isCatering;
    for (const it of (c.menuItems ?? [])) {
      if (catIsCatering || !!it.isCatering) cateringItemIds.add(it.id);
    }
  }
  const cartHasCatering = cart.some((ci) => cateringItemIds.has(ci.menuItem.id));
  // Format an absolute moment as a "YYYY-MM-DDTHH:MM" wall-clock string in
  // the RESTAURANT's timezone — the same convention the server applies when
  // it parses scheduledFor (parseLocalDateTimeInTz). Computing these picker
  // bounds in the browser's timezone instead shifted every min/max by the
  // tz difference for remote customers: the picker offered times the server
  // then rejected (browser behind restaurant) or hid valid ones (ahead).
  // Falls back to the browser wall clock when no timezone is set. The
  // optional 15-min round-up happens on the absolute moment BEFORE
  // formatting — every real-world tz offset is a multiple of 15 minutes,
  // so the rounded value stays on a quarter-hour boundary in any timezone.
  const toRestaurantWallClock = (msAbsolute: number, roundUp15 = false): string => {
    let ms = msAbsolute;
    if (roundUp15) {
      const q = 15 * 60 * 1000;
      ms = Math.ceil(ms / q) * q;
    }
    const d = new Date(ms);
    const pad = (n: number) => String(n).padStart(2, "0");
    if (restaurantTz) {
      try {
        const parts = new Intl.DateTimeFormat("en-US", {
          timeZone: restaurantTz,
          year: "numeric", month: "2-digit", day: "2-digit",
          hour: "2-digit", minute: "2-digit", hour12: false,
        }).formatToParts(d);
        const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
        let h = get("hour");
        if (h === "24") h = "00";
        return `${get("year")}-${get("month")}-${get("day")}T${h}:${get("minute")}`;
      } catch { /* invalid tz id — fall through to browser-local */ }
    }
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  // Earliest schedulable slot — now + cateringNoticeHours, rounded UP to
  // the next 15-minute boundary so the datetime-local picker doesn't land
  // on an odd minute value the customer didn't choose.
  const cateringMinScheduledLocal = toRestaurantWallClock(
    Date.now() + cateringNoticeHours * 3600 * 1000,
    true,
  );

  // ── Closed-now detection (Luigi 2026-05-30) ─────────────────────────
  // When the restaurant is closed RIGHT NOW, we don't let customers
  // place ASAP orders — they have to schedule for the next opening
  // slot or later. (Catering items have a stricter min already; the
  // two rules combine — we use whichever pushes the picker further
  // into the future.)
  // Keyed on the explicit closed flag — NOT on the name. Name and message are
  // optional, so a blank-name full closure must still reach the logic (2026-06-12).
  const holidayForStatus =
    todayHolidayClosed || (todayHolidayIntervals?.length ?? 0) > 0
      ? { name: todayHolidayName ?? undefined, intervals: todayHolidayIntervals ?? undefined }
      : undefined;
  // GENERAL status — drives the header open/closed chip + the sound trigger
  // ("is the kitchen open at all?"). Reads the default (service=null) hours.
  const liveStatusForClient = liveOpenStatus(
    (restaurant.openingHours ?? []) as any, new Date(), hoursFmt, holidayForStatus, restaurantTz,
  );
  const generalIsClosedNow = liveStatusForClient.kind !== "open";
  // Today's hours label for the header — SPLIT HOURS aware: shows
  // "12:00 – 15:00, 18:00 – 23:00" when the day has a break; a single-window day
  // keeps the live closesAt behaviour (shows the current window's close).
  const todayIvsForHeader = todayHours ? rowIntervals(todayHours as any) : [];
  const todayHoursLabel = todayIvsForHeader.length > 1
    ? todayIvsForHeader.map((iv) => `${formatHHMM(iv.open, hoursFmt)} – ${formatHHMM(iv.close, hoursFmt)}`).join(", ")
    : `${formatHHMM(todayHours?.openTime ?? "", hoursFmt)} – ${liveStatusForClient.kind === "open" ? liveStatusForClient.closesAt : formatHHMM(todayHours?.closeTime ?? "", hoursFmt)}`;
  // SERVICE status — the ORDERING GATE (Fabrizio report): per-service hours decide
  // whether ASAP is allowed for the CHOSEN method. e.g. Pickup 14:00–21:00 must
  // block an ASAP pickup at 11:50 even when the kitchen's general hours are open.
  // resolveServiceHours() returns the per-service-resolved 7-day rows (service row →
  // default fallback → closed), matching CheckoutModal's serviceKind map so the ASAP
  // check and the schedule picker agree on the same hours.
  // dine_in / take_out have NO service-specific hours rows → resolve to null so
  // pickHoursForService falls back to the GENERAL row (open now), not pickup's. They used to
  // collapse to "pickup" and wrongly inherit pickup's later start + "Pickup" label. Luigi 2026-06-25.
  const orderServiceKind: ServiceKind | null =
    orderType === "delivery" ? "delivery" : orderType === "pickup" ? "pickup" : null;
  const serviceHoursForClient = resolveServiceHours((restaurant.openingHours ?? []) as any, orderServiceKind);
  // Per-SERVICE special-day (extraordinary) hours for TODAY: an OPEN window set
  // for JUST this service (e.g. delivery 10:00–20:00 today) must drive its
  // open-now status + earliest slot, taking precedence over the weekly row.
  // Falls back to the general holiday effect when this service has no special
  // rule today, so general custom-hours + full closures still apply. Luigi 2026-07-02.
  const canonicalSvc = canonicalHolidayService(orderType);
  const todaySvcSpecial = holidayEffectForDay(
    (restaurant.holidays ?? []) as any,
    dateKeyInTimezone(new Date(), restaurantTz || "UTC"),
    canonicalSvc,
  );
  const serviceHolidayForStatus =
    todaySvcSpecial?.kind === "closed" ? { name: todaySvcSpecial.name ?? undefined }
    : todaySvcSpecial?.kind === "custom_hours" ? { name: todaySvcSpecial.name ?? undefined, intervals: todaySvcSpecial.intervals }
    : holidayForStatus;
  const serviceHasSpecialToday = todaySvcSpecial?.kind === "custom_hours" && todaySvcSpecial.intervals.length > 0;
  const serviceStatusForClient = liveOpenStatus(
    serviceHoursForClient as any, new Date(), hoursFmt, serviceHolidayForStatus, restaurantTz,
  );
  const restaurantIsClosedNow = serviceStatusForClient.kind !== "open";
  // Per-service "opens at" for the tab hints — when a service starts later than now
  // (the restaurant is general-open), its tab shows "(opens 3:00 PM)" so the customer
  // sees it while choosing. Reuses the same resolveServiceHours + liveOpenStatus as the
  // gate above; opensAt is already in the restaurant's 12h/24h format. dine-in/take-out
  // have no service rows (they follow general), so they get no hint. Luigi 2026-06-22.
  const serviceOpensAtLabel = (kind: ServiceKind): string | null => {
    // Each tab's "(opens HH:MM)" hint reflects THAT service's own extraordinary
    // hours today (resolved per-kind, never the active order type's). Luigi 2026-07-02.
    const sp = holidayEffectForDay(
      (restaurant.holidays ?? []) as any,
      dateKeyInTimezone(new Date(), restaurantTz || "UTC"),
      canonicalHolidayService(kind),
    );
    const hol =
      sp?.kind === "closed" ? { name: sp.name ?? undefined }
      : sp?.kind === "custom_hours" ? { name: sp.name ?? undefined, intervals: sp.intervals }
      : holidayForStatus;
    const st = liveOpenStatus(
      resolveServiceHours((restaurant.openingHours ?? []) as any, kind) as any,
      new Date(), hoursFmt, hol, restaurantTz,
    );
    return st.kind === "opens_at" ? st.opensAt : null;
  };
  const pickupOpensAt = serviceOpensAtLabel("pickup");
  const deliveryOpensAt = serviceOpensAtLabel("delivery");
  // Header open/closed chip — drive off the GENERAL status (general hours are the
  // display + sound; per-service hours gate ordering only). When we know the next
  // opening, show it ("Closed · Opens 10:00 AM") instead of a flat label.
  const headerIsOpenNow = !generalIsClosedNow && !todayHolidayClosed;
  const headerClosedText =
    liveStatusForClient.kind === "opens_at"
      ? `${t("closed")} · ${t("opensAtLabel", { time: liveStatusForClient.opensAt })}`
      : t("closedToday");
  // Next opening for the CHOSEN service → the earliest schedulable slot when that
  // service is closed now (e.g. pickup's 14:00, not the kitchen's 9:00).
  const nextOpenDate = restaurantIsClosedNow
    ? nextOpenAt(
        serviceHoursForClient as any,
        new Date(),
        restaurantTz,
        // Skip holiday-closed days so the "order for later" minimum never
        // lands on a date the server will reject.
        (restaurant.holidays ?? []) as any,
        // Honour THIS service's special-day OPEN window (e.g. delivery 10:00
        // today) so the earliest slot lands on it, not the weekly start. Luigi 2026-07-02.
        canonicalSvc,
      )
    : null;
  // Convert nextOpenDate (a UTC Date that represents the local opening
  // moment) to a "YYYY-MM-DDTHH:MM" string in the restaurant's local
  // timezone so the datetime-local picker shows the right wall clock.
  const closedMinScheduledLocal = nextOpenDate
    ? toRestaurantWallClock(nextOpenDate.getTime())
    : "";

  // ── Phase 2 Fulfilment Time (Luigi 2026-06-12) ──────────────────────
  // Cart items with a fulfilment window (visible all week, orderable only
  // for certain days/times) force scheduling — exactly like catering. We
  // find the earliest slot at which EVERY such item is simultaneously
  // orderable, starting no earlier than the other minimums (catering /
  // lead / closed) so the one forced slot satisfies all constraints. If
  // they're already orderable now, no extra minimum is added (ASAP is fine).
  const cartFulfilItems = cart.map((ci) => ci.menuItem).filter(hasFulfilWindow);
  const cartHasFulfil = cartFulfilItems.length > 0;
  // Distinct dish names of the time-restricted items in the cart — used to
  // NAME them in the "only available certain days/times" heads-up (cart +
  // checkout), per reseller R4. Shown whenever a restricted item is in the
  // cart, even when it's orderable right now (so the customer understands
  // why the order time is constrained before they schedule).
  const fulfilItemNames = Array.from(new Set(cartFulfilItems.map((i) => i.name)));
  // Two restricted items whose windows can't overlap can't be made for one order
  // (e.g. Monday-only + Tuesday-only). Detect that and prompt to drop one rather
  // than dead-end at checkout. Only scans when 2+ restricted items are present.
  const fulfilConflictItems =
    cartFulfilItems.length >= 2 ? conflictingFulfilItems(cartFulfilItems, new Date(), restaurantTz) : [];
  const hasFulfilConflict = fulfilConflictItems.length >= 2;
  const removeConflictItem = (menuItemId: string) =>
    setCart((prev) => prev.filter((ci) => ci.menuItem.id !== menuItemId));
  // Empty the whole cart in one tap (Luigi 2026-06-30) — available in the cart
  // drawer + at checkout so you don't have to remove items one by one. Confirm
  // first so nobody nukes an order by accident; also drop the persisted copy.
  const clearCart = () => {
    if (cart.length === 0) return;
    if (!confirm(t("emptyCartConfirm"))) return;
    setCart([]);
    try { localStorage.removeItem(CART_STORAGE_KEY); } catch { /* ignore */ }
  };
  // Surface the prompt the moment a conflict appears (covers every add path) and
  // auto-close when resolved. The ref makes it open once per onset, not per render.
  useEffect(() => {
    if (hasFulfilConflict) {
      if (!fulfilConflictShownRef.current) { setFulfilConflictOpen(true); fulfilConflictShownRef.current = true; }
    } else {
      fulfilConflictShownRef.current = false;
      setFulfilConflictOpen(false);
    }
  }, [hasFulfilConflict]);
  // Reserve-then-order: a cart item that ISN'T offered on the booking day can't
  // be fulfilled (the order time is locked to the table). Prompt to remove it or
  // rebook a day it's offered — rather than dead-ending at "Place order". Mirrors
  // the conflict prompt above; `reservationMoment` is null outside reservation
  // mode so this is inert for normal/ASAP/order-ahead orders. Luigi 2026-06-16.
  const reservationCartConflictItems = reservationMoment
    ? cartFulfilItems.filter((mi) => !isFulfilableAt(mi, reservationMoment, restaurantTz))
    : [];
  const hasReservationCartConflict = reservationCartConflictItems.length > 0;
  useEffect(() => {
    if (hasReservationCartConflict) {
      if (!reservationCartShownRef.current) { setReservationCartOpen(true); reservationCartShownRef.current = true; }
    } else {
      reservationCartShownRef.current = false;
      setReservationCartOpen(false);
    }
  }, [hasReservationCartConflict]);
  const fulfilBaseMs = (() => {
    let ms = Date.now();
    if (cartHasFulfil) {
      if (cateringItemIds.size > 0 && cartHasCatering) ms = Math.max(ms, Date.now() + cateringNoticeHours * 3600 * 1000);
      if (restaurantIsClosedNow && nextOpenDate) ms = Math.max(ms, nextOpenDate.getTime());
    }
    return ms;
  })();
  const fulfilEarliestSlot = cartHasFulfil
    ? earliestCombinedFulfilSlot(cartFulfilItems, new Date(fulfilBaseMs), restaurantTz)
    : null;
  // Empty when the items are already orderable at the base moment (no forced slot).
  const fulfilMinScheduledLocal = fulfilEarliestSlot
    ? toRestaurantWallClock(fulfilEarliestSlot.getTime(), true)
    : "";

  // Scheduled-orders master controls (GloriaFood parity, Fabrizio cmq14gy64).
  // allowScheduledOrders=false → no time picker (ASAP only) unless catering /
  // closed-now forces it. requireScheduledOrders=true → ASAP hidden.
  const schedulingAllowed = (restaurant as any).allowScheduledOrders !== false;
  const hideAsap = schedulingAllowed && (restaurant as any).requireScheduledOrders === true;
  // Pre-order advance limits for the ACTIVE service — only when scheduling is on.
  // Per-service advance limits: delivery → delivery fields, dine-in → dine-in
  // fields, pickup / take-out → pickup fields (take-out is pickup-style).
  const leadFieldPrefix = orderType === "delivery" ? "delivery" : orderType === "dine_in" ? "dineIn" : "pickup";
  const orderMinLeadMinutes = !schedulingAllowed ? 0 : ((restaurant as any)[`${leadFieldPrefix}MinLeadMinutes`] ?? 0);
  const orderMaxAdvanceDays = !schedulingAllowed ? 0 : ((restaurant as any)[`${leadFieldPrefix}MaxAdvanceDays`] ?? 0);
  // Earliest schedulable slot when a min lead is set: now + lead, rounded up
  // to the next 15-min boundary (same shape as the catering min).
  const leadMinScheduledLocal =
    orderMinLeadMinutes > 0
      ? toRestaurantWallClock(Date.now() + orderMinLeadMinutes * 60 * 1000, true)
      : "";
  // Latest schedulable DATE (date-only, restaurant wall clock) when a max
  // advance is set.
  const maxScheduledDate =
    orderMaxAdvanceDays > 0
      ? toRestaurantWallClock(Date.now() + orderMaxAdvanceDays * 86400 * 1000).slice(0, 10)
      : "";

  // Combined "schedule required" reasoning. If ANY condition pushes the
  // customer into schedule mode, we honor the stricter (latest) min slot.
  // A min-lead > 0 means ASAP isn't offered — the order must be placed at
  // least that far ahead.
  // A fulfilment item that isn't orderable now forces scheduling (fulfilMin set).
  const fulfilForcesSchedule = cartHasFulfil && !!fulfilMinScheduledLocal;
  // The cart's combined order-window so the checkout picker offers ONLY valid
  // days/times (e.g. a Monday-only item → only Mondays selectable).
  const cartFulfilConstraint = combinedFulfilConstraint(cartFulfilItems);
  // Per-(date, slot) check for MULTI-WINDOW items (cmr803ovq c): the flattened
  // from/to band above can't express per-day time differences (Tue 10–15 vs
  // Wed 15–20). Args are restaurant wall-clock strings — same convention the
  // picker's own validDates math uses.
  const cartFulfilSlotAllowed = (dateStr: string, hhmm: string): boolean => {
    const dow = new Date(`${dateStr}T12:00:00`).getDay();
    return cartFulfilItems.every((mi) => {
      const ws = fulfilWindowsOf(mi);
      return ws.length === 0 || ws.some((w) => windowMatches(w, dow, hhmm));
    });
  };
  const scheduleRequired = cartHasCatering || restaurantIsClosedNow || orderMinLeadMinutes > 0 || hideAsap || fulfilForcesSchedule;
  // Whether the schedule picker is shown at all. Off only when the owner
  // disabled scheduling AND nothing forces it (catering / closed now / fulfilment).
  const schedulingEnabled = schedulingAllowed || cartHasCatering || restaurantIsClosedNow || fulfilForcesSchedule;
  const effectiveMinScheduledLocal = (() => {
    const candidates: string[] = [];
    if (cartHasCatering && cateringMinScheduledLocal) candidates.push(cateringMinScheduledLocal);
    if (restaurantIsClosedNow && closedMinScheduledLocal) candidates.push(closedMinScheduledLocal);
    if (orderMinLeadMinutes > 0 && leadMinScheduledLocal) candidates.push(leadMinScheduledLocal);
    if (fulfilMinScheduledLocal) candidates.push(fulfilMinScheduledLocal);
    if (candidates.length === 0) return "";
    // Pick the LATEST (string comparison works because both are zero-padded ISO-shaped).
    return candidates.sort()[candidates.length - 1];
  })();
  // Fulfilment is the most specific date constraint ("only Tuesdays"), so it
  // names the schedule prompt when present — the picker minimum still honours
  // every other constraint via effectiveMinScheduledLocal above.
  // "closed" = restaurant shut by GENERAL hours. "service_later" = the restaurant is
  // OPEN (general hours) but the CHOSEN service starts later today (e.g. Pickup 14:00)
  // — show a service-specific "starts at" note, NOT "we're closed" (Fabrizio
  // 2026-06-22). Both still force scheduling to the service's next opening.
  const scheduleReason: "catering" | "closed" | "service_later" | "service_special_later" | "both" | "lead" | "fulfil" | null =
    fulfilForcesSchedule ? "fulfil"
    : cartHasCatering && restaurantIsClosedNow ? "both"
    : cartHasCatering ? "catering"
    // A per-service EXTRAORDINARY/special-day OPEN start wins over the generic
    // "closed" reason (so we can say "opens TODAY at …" for it) — ABOVE the
    // general-closed check, which would otherwise mask it when the general
    // kitchen reads closed-now. General header/chip/sound stay on the general
    // status (untouched). Luigi 2026-07-02 (Fabrizio cmqnm3hv0).
    : (restaurantIsClosedNow && serviceHasSpecialToday) ? "service_special_later"
    : generalIsClosedNow ? "closed"
    : restaurantIsClosedNow ? "service_later"
    : (orderMinLeadMinutes > 0 || hideAsap) ? "lead"
    : null;

  // ── Catering: auto-fill schedule when activated ─────────────────────
  // Flip from "no catering" → "has catering" defaults the schedule
  // picker to the earliest valid catering slot. Customer can bump
  // later if they want — but never sees an empty ASAP state with a
  // catering item in the cart. Removing catering items DOESN'T clear
  // the schedule — their explicit "Friday at 7pm" still applies.
  useEffect(() => {
    // Auto-fill triggers whenever EITHER the schedule-required condition
    // becomes true OR the effective minimum slot moves later than the
    // current scheduledFor. Closed-now restaurants get the same default-
    // fill UX as catering — customer never sees an invalid empty-ASAP
    // state when the rule is in effect.
    // FUNCTIONAL updater — reads the FRESH ci so it only ever touches
    // scheduledFor and never clobbers fields another mount effect just set
    // (the device-remembered guest name/email/phone). The old `{ ...customerInfo }`
    // closure snapshotted the initial EMPTY form and, when scheduling was forced
    // on mount (closed-now / lead / catering / fulfilment), wrote that stale
    // empty identity back — wiping the guest prefill. (Reseller report cmq3l14kq.)
    setCustomerInfo((ci) => {
      if (scheduleRequired && effectiveMinScheduledLocal) {
        if (!ci.scheduledFor) return { ...ci, scheduledFor: effectiveMinScheduledLocal };
        try {
          if (new Date(ci.scheduledFor) < new Date(effectiveMinScheduledLocal)) {
            return { ...ci, scheduledFor: effectiveMinScheduledLocal };
          }
        } catch { /* malformed — ignore */ }
        return ci;
      }
      // Scheduling turned off (and nothing forces it) — drop any stale slot so
      // the order goes through as ASAP.
      if (!schedulingEnabled && ci.scheduledFor) return { ...ci, scheduledFor: "" };
      return ci;
    });
    prevCateringRef.current = cartHasCatering;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleRequired, effectiveMinScheduledLocal, schedulingEnabled]);

  // Switching the order TYPE re-defaults the scheduled slot to the NEW service's
  // earliest valid slot — or clears to ASAP when the new service is open now.
  // Without this, a slot picked for Pickup (e.g. 6 PM) carries over to Delivery
  // (which opens 7 PM) and the order is rejected at checkout. Only fires on an
  // ACTUAL type change (the ref guard), so it never clobbers a time the customer
  // deliberately set for the service they're on. (Luigi 2026-06-25.)
  const prevOrderTypeRef = useRef(orderType);
  useEffect(() => {
    if (prevOrderTypeRef.current === orderType) return;
    prevOrderTypeRef.current = orderType;
    setCustomerInfo((ci) => {
      if (scheduleRequired && effectiveMinScheduledLocal) {
        return { ...ci, scheduledFor: effectiveMinScheduledLocal };
      }
      // New service is open now → ASAP (drop any carried-over slot).
      if (ci.scheduledFor) return { ...ci, scheduledFor: "" };
      return ci;
    });
  }, [orderType, scheduleRequired, effectiveMinScheduledLocal]);
  const zoneFee = resolvedZone?.zone.deliveryFee;
  const zoneMin = resolvedZone?.zone.minimumOrder;
  const zoneMinutes = resolvedZone?.zone.estimatedMinutes;
  const baseDeliveryFee = orderType === "delivery"
    ? (zoneFee !== undefined ? zoneFee : restaurant.deliveryFee)
    : 0;
  const minimumOrderForType = orderType === "delivery"
    ? (zoneMin !== undefined ? zoneMin : restaurant.minimumOrder)
    : restaurant.minimumOrder;
  // Delivery estimate semantics (Luigi 2026-07-04, DO NOT "fix" again): a
  // delivery zone's minutes are the TOTAL estimated delivery time (prep +
  // travel) for addresses in that zone — a deliberate per-zone refinement
  // that OVERRIDES the service's default "Estimated time". The service value
  // is only the fallback when no zone matched yet. The confusion behind
  // Fabrizio's cmqqxerxs/cmqt99i8s reports was zones configured at ~5 min;
  // the ADMIN-side explanation now lives in the Delivery Zones editor.
  const estimatedDeliveryMinutes = orderType === "delivery"
    ? (zoneMinutes !== undefined ? zoneMinutes : restaurant.estimatedDelivery)
    : restaurant.estimatedDelivery;
  // Fabrizio 2026-06-25: hide the per-service estimated time ("· 20 min") on the order-page
  // service buttons when the owner turns it off (it still shows at checkout). Default show —
  // only an explicit false hides it, so existing stores are unaffected.
  const showServiceTimes = (restaurant as any).showServiceTimesOnOrderPage !== false;
  const deliveryFee = hasFreeDelivery ? 0 : baseDeliveryFee;
  // When tipping is disabled at the restaurant level, force zero
  // regardless of any leftover client state. Belt-and-suspenders to
  // the gated UI — if a customer kept the page open across a settings
  // change, we still don't surcharge them.
  const tipAmount = tipsEnabled ? Math.round((subtotal * (tipPercent / 100)) * 100) / 100 : 0;
  const totalDiscount = couponDiscount + promoDiscount;
  const feeOrderType: "pickup" | "delivery" = orderType === "delivery" ? "delivery" : "pickup";
  // serviceSettings JSON key for the ACTIVE order type. Fees use feeOrderType
  // (dine-in/take-out are pickup-priced), but scheduling settings are per
  // actual service: dine-in and take-out have their own slot interval/mode.
  const serviceSettingsKey =
    orderType === "delivery" ? "delivery" :
    orderType === "dine_in" ? "dineIn" :
    orderType === "take_out" ? "takeOut" : "pickup";
  // Per-service scheduling slot interval: each service can override the
  // restaurant-wide default (Restaurant.scheduledOrderInterval) via its
  // serviceSettings entry — e.g. 30-min delivery slots, 15-min pickup. Falls
  // back to the global value, then 15. Reactive to orderType so the schedule
  // picker re-buckets when the customer flips services.
  const perServiceSlotInterval = (() => {
    try {
      const raw = (restaurant as any).serviceSettings;
      const ss = raw ? JSON.parse(raw) : null;
      const v = ss?.[serviceSettingsKey]?.slotInterval;
      if (typeof v === "number" && v > 0) return v;
    } catch { /* malformed serviceSettings — fall back to the global default */ }
    return (restaurant as any).scheduledOrderInterval ?? 15;
  })();
  // Per-service time-selection styles (Luigi 2026-07-04: any combination of
  // "bands" fixed times / "range" ≤15-min windows / "exact" free minute —
  // the customer toggles at checkout when several are enabled). Reads the
  // slotModes array with legacy slotMode fallback via resolveSlotModes.
  // Reactive to orderType like the interval above. Fabrizio cmpxdtl9m/cmqqxerxs.
  const perServiceSlotModes: ("bands" | "range" | "exact")[] = (() => {
    try {
      const raw = (restaurant as any).serviceSettings;
      const ss = raw ? JSON.parse(raw) : null;
      return resolveSlotModes(ss?.[serviceSettingsKey]);
    } catch { /* malformed serviceSettings — fall back to bands */ }
    return ["bands"];
  })();
  const appliedServiceFees = evaluateApplicableFees(
    (restaurant.serviceFees ?? []) as ServiceFeeRow[],
    { subtotal, type: feeOrderType, at: new Date() },
  );
  const serviceFeesTotal = appliedServiceFees.reduce((s, f) => s + f.amount, 0);
  const taxBase = Math.max(0, subtotal - totalDiscount + deliveryFee + serviceFeesTotal);
  const taxAmount = taxBase * (restaurant.taxRate / 100);
  const total = taxBase + taxAmount + tipAmount;

  const getModPrice = (item: MenuItem, selectedMods: Record<string, string[]>) =>
    item.modifierGroups.reduce((sum, g) => {
      return sum + (selectedMods[g.id] || []).reduce((s2, optId) => {
        const opt = g.options.find(o => o.id === optId);
        return s2 + (opt?.priceAdjustment ?? 0);
      }, 0);
    }, 0);

  const openItem = (item: MenuItem) => {
    // Combo items open the slot composer (takes precedence over pizza/normal).
    if (parseComboConfig((item as any).comboConfig)) {
      setComboItem(item);
      return;
    }
    // Detect pizza items and route to the pizza builder instead
    const pc = parsePizzaConfig(item.pizzaConfig);
    if (pc) {
      setPizzaItem(item);
      setActivePizzaConfig(pc);
      return;
    }

    const defaultMods: Record<string, string[]> = {};
    for (const g of item.modifierGroups) {
      const defs = g.options.filter(o => o.isDefault && o.isAvailable).map(o => o.id);
      if (defs.length) defaultMods[g.id] = defs;
    }
    const defaultVariant = item.variants?.find(v => v.isDefault) ?? item.variants?.[0] ?? null;
    setMods(defaultMods);
    setSelectedVariant(defaultVariant);
    setItemNotes("");
    setItemQuantity(1);
    setSelectedItem(item);
  };

  const handlePizzaAdd = useCallback((result: PizzaAddResult) => {
    if (!pizzaItem) return;
    const unitPrice = result.lineTotal / Math.max(result.quantity, 1);
    const newEntry: CartItem = {
      menuItem: pizzaItem,
      variant: result.variant ? { ...result.variant, isDefault: false, sortOrder: 0 } : undefined,
      quantity: result.quantity,
      selectedMods: {},
      notes: result.notes,
      lineTotal: result.lineTotal,
      pizzaCustomization: result.customization,
      unitPrice,
    };
    const isEdit = editingCartIndex !== null;
    setCart(prev =>
      isEdit
        ? prev.map((it, i) => (i === editingCartIndex ? newEntry : it))
        : [...prev, newEntry]
    );
    setPizzaItem(null);
    setActivePizzaConfig(null);
    if (isEdit) {
      setEditingCartIndex(null);
      setCartOpen(true);
      toast.success(tT("itemUpdated"));
    } else {
      toast.success(tT("itemAddedNamed", { name: pizzaItem.name }) + " 🍕");
    }
  }, [pizzaItem, editingCartIndex, tT]);

  // Combo composed → drop a single combo line into the cart (reuses the bundle
  // parent+children rendering; isCombo distinguishes it from a promo bundle).
  const addComboToCart = (result: ComboCartResult) => {
    // The composer already produced each child's display modifiers (flattened
    // selections / pizza toppings), per-item upcharge, and add-on surcharge —
    // pass them straight through to the cart line.
    const newEntry: CartItem = {
      menuItem: result.comboItem,
      variant: undefined,
      quantity: 1,
      selectedMods: {},
      notes: "",
      lineTotal: result.lineTotal,
      unitPrice: result.lineTotal,
      isBundle: true,
      isCombo: true,
      bundlePromoName: result.comboItem.name,
      bundleItems: result.children.map((c) => ({
        menuItemId: c.menuItemId,
        name: c.name,
        variantId: c.variantId,
        variantName: c.variantName,
        modifiers: c.modifiers,
        pizzaCustomization: c.pizzaCustomization,
        specialityFee: c.upcharge,
        extrasFee: c.extrasFee,
      })),
    };
    setCart((prev) => [...prev, newEntry]);
    setComboItem(null);
    toast.success(tT("itemAddedNamed", { name: result.comboItem.name }) + " 🧩");
  };

  // Open the appropriate editor pre-seeded with the cart entry's current selections.
  const beginEdit = (idx: number) => {
    const ci = cart[idx];
    if (!ci) return;
    setPendingEditIndex(null);
    setEditingCartIndex(idx);
    setCartOpen(false);

    const pc = parsePizzaConfig(ci.menuItem.pizzaConfig);
    if (pc && ci.pizzaCustomization) {
      setActivePizzaConfig(pc);
      setPizzaItem(ci.menuItem);
    } else {
      setMods({ ...ci.selectedMods });
      setSelectedVariant(ci.variant ?? null);
      setItemNotes(ci.notes ?? "");
      setItemQuantity(Math.max(1, ci.quantity ?? 1));
      setSelectedItem(ci.menuItem);
    }
  };

  // Cancel an edit without saving — drop the edit pointer, reopen the drawer.
  const cancelEdit = () => {
    setEditingCartIndex(null);
    setCartOpen(true);
  };

  const toggleMod = (group: ModGroup, optId: string) => {
    const current = mods[group.id] || [];
    if (group.maxSelect === 1) {
      setMods({ ...mods, [group.id]: [optId] });
    } else if (current.includes(optId)) {
      setMods({ ...mods, [group.id]: current.filter(id => id !== optId) });
    } else if (current.length < group.maxSelect) {
      setMods({ ...mods, [group.id]: [...current, optId] });
    }
  };

  /**
   * Per-option quantity setter, used when group.maxPerOption > 1 (i.e. the
   * same option can be selected multiple times — "2× So Good Chocolate
   * Cake" inside a 2-slice combo group, "3× Pepperoni" on a topping that
   * allows stacking, etc.). Duplicates are stored as repeated entries in
   * the mods array, which getModPrice and the API payload both handle
   * natively. Caps at maxPerOption per option AND at maxSelect total
   * across the whole group (counting duplicates).
   */
  const setOptionQty = (group: ModGroup, optId: string, newQty: number) => {
    const current = mods[group.id] || [];
    const otherIds = current.filter(id => id !== optId);
    const perCap = Math.max(1, group.maxPerOption ?? 1);
    const totalRoom = Math.max(0, group.maxSelect - otherIds.length);
    const finalQty = Math.max(0, Math.min(newQty, perCap, totalRoom));
    const next = finalQty === 0 ? otherIds : [...otherIds, ...Array(finalQty).fill(optId)];
    setMods({ ...mods, [group.id]: next });
  };

  const currentItemPrice = selectedItem
    ? (selectedVariant ? selectedVariant.price : selectedItem.price) + getModPrice(selectedItem, mods)
    : 0;

  const addToCart = () => {
    if (!selectedItem) return;
    // Visible-but-purchase-restricted (reseller report cmpxec829): the cards
    // block opening, but belt-and-suspenders here too (deep links, kept-open
    // modals across a window boundary). Server-side validation re-checks.
    // Gate on the BLOCKED flag, not the note — the note now also renders
    // informationally while the item is purchasable.
    const availNote = (selectedItem as any).__availabilityNote as string | undefined;
    if ((selectedItem as any).__availabilityBlocked) {
      // Prefer the specific note (legacy window, or the reservation "not on your
      // booking day" message) over the generic fallback.
      toast.error(availNote || (selectedItem as any).__fulfilNote || tT("itemUnavailable"));
      return;
    }
    if (selectedItem.hasVariants && !selectedVariant) { toast.error(tT("chooseSize")); return; }
    for (const g of selectedItem.modifierGroups) {
      const selected = mods[g.id] || [];
      if (g.required && selected.length === 0) {
        toast.error(tT("pleaseSelect", { name: g.name })); return;
      }
      if (g.minSelect > 0 && selected.length < g.minSelect) {
        toast.error(tT("chooseAtLeast", { name: g.name, n: g.minSelect })); return;
      }
    }
    const lineTotal = currentItemPrice;
    // Quantity comes from the in-modal stepper. On edit, the stepper
    // was preseeded with the cart line's existing qty in beginEdit().
    const qty = Math.max(1, itemQuantity || 1);
    const newEntry: CartItem = {
      menuItem: selectedItem,
      variant: selectedVariant || undefined,
      quantity: qty,
      selectedMods: { ...mods },
      notes: itemNotes,
      lineTotal: lineTotal * qty,
    };
    const isEdit = editingCartIndex !== null;
    setCart(prev =>
      isEdit
        ? prev.map((it, i) => (i === editingCartIndex ? newEntry : it))
        : [...prev, newEntry]
    );
    setSelectedItem(null);
    if (isEdit) {
      setEditingCartIndex(null);
      setCartOpen(true);
      toast.success(tT("itemUpdated"));
    } else {
      toast.success(tT("itemAddedNamed", { name: selectedItem.name }));
    }
  };

  const updateQty = (idx: number, delta: number) => {
    const updated = [...cart];
    updated[idx] = { ...updated[idx], quantity: updated[idx].quantity + delta };
    if (updated[idx].quantity <= 0) { updated.splice(idx, 1); setCart(updated); return; }
    if (updated[idx].unitPrice != null) {
      // Pizza item: pricing was computed by the builder; scale by qty
      updated[idx].lineTotal = updated[idx].unitPrice! * updated[idx].quantity;
    } else {
      const basePrice = updated[idx].variant ? updated[idx].variant.price : updated[idx].menuItem.price;
      updated[idx].lineTotal = (basePrice + getModPrice(updated[idx].menuItem, updated[idx].selectedMods)) * updated[idx].quantity;
    }
    setCart(updated);
  };

  const applyCoupon = async (codeArg?: string) => {
    // codeArg lets callers apply a specific code without waiting for the
    // couponCode state to flush (used by the ?coupon= URL auto-apply). The
    // typed-input callers pass nothing and fall back to the state.
    // HARDENED (Fabrizio cmqtllluu, 2026-07-03): only a STRING arg counts.
    // The checkout Apply button was wired `onClick={applyCoupon}`, which
    // passed the click EVENT as codeArg — `.trim()` on it threw before the
    // fetch, so the button silently did nothing at checkout while the cart's
    // `() => applyCoupon()` wiring worked. Type-guarding here makes every
    // call-site shape safe.
    const codeToApply = (typeof codeArg === "string" ? codeArg : couponCode).trim();
    if (!codeToApply) return;
    setCouponLoading(true);
    try {
      const res = await fetch(`/api/public/coupon?code=${encodeURIComponent(codeToApply)}&restaurantSlug=${restaurant.slug}&subtotal=${subtotal}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || tT("invalidCoupon"));
      // Two code sources (Phase 2 marketing suite):
      //   "coupon"      → legacy Coupon row, fixed discount returned now
      //   "promotion"   → Promotion.couponCode match; engine computes
      //                   the dynamic discount on next apply-promos call.
      //                   We keep the typed couponCode in state so the
      //                   apply-promos useEffect picks it up.
      if (data.source === "promotion") {
        setCouponId(null);
        setCouponDiscount(0);
        // Re-applying a code un-suppresses its promo (the "re-add" path), then
        // we wait for the engine to say whether it actually applied or is
        // blocked by a non-stackable deal — see the pendingCoupon effect. No
        // optimistic "applied!" toast (it was lying when an exclusive won).
        if (data.promoId) restorePromo(String(data.promoId));
        setPendingCoupon(codeToApply.toUpperCase());
        // Force a refresh of the auto-apply effect by re-setting cart
        // (cheap — same reference). The cart-change useEffect calls
        // /api/public/apply-promos with the live couponCode and the
        // engine matches it against Promotion.couponCode.
        setCart((c) => [...c]);
      } else {
        setCouponDiscount(data.discount);
        setCouponId(data.id);
        toast.success(tT("couponAppliedAmount", { amount: fmt(data.discount) }));
      }
    } catch (e: any) { toast.error(e.message); }
    setCouponLoading(false);
  };

  // Auto-apply a coupon passed in the URL (?coupon=CODE). The cart-recovery +
  // WIN-ladder marketing emails link their "Order with coupon" CTA here so the
  // discount is pre-applied — the customer shouldn't have to retype the code.
  // Runs once; also fills the coupon input so the code is visible. Without this
  // the email links silently did nothing (the engine never saw the code).
  // Luigi 2026-06-11.
  const couponUrlConsumedRef = useRef(false);
  useEffect(() => {
    if (couponUrlConsumedRef.current) return;
    const urlCoupon = searchParams.get("coupon");
    if (!urlCoupon) return;
    couponUrlConsumedRef.current = true;
    const code = urlCoupon.trim().toUpperCase().slice(0, 40);
    if (!code) return;
    setCouponCode(code);
    applyCoupon(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // A CODE-LESS personal gift arrives as ?grant=<id> from the account page's
  // "Use this offer" button (the grant's promotion has no couponCode, so there's
  // nothing to put in the coupon field). Forward the opaque id to BOTH the cart
  // preview and the order — each re-resolves it identity-scoped and forces its
  // promo into the engine. One-shot. Luigi 2026-07-01.
  const grantUrlConsumedRef = useRef(false);
  useEffect(() => {
    if (grantUrlConsumedRef.current) return;
    const g = searchParams.get("grant");
    if (!g) return;
    grantUrlConsumedRef.current = true;
    const id = g.trim().slice(0, 40);
    if (id) setPendingGrantId(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Marketplace attribution: when the customer arrived via /marketplace/[slug]
  // (which redirects here with ?from=marketplace), forward the flag to the
  // server so the order gets stamped + marketplace counters bump. Server
  // verifies the entitlement before honoring the claim — see /api/orders POST.
  const fromMarketplace = searchParams.get("from") === "marketplace";

  const buildOrderPayload = () => {
    // Compose the full delivery address: street + unit/apt + buzzer.
    // Stored as one string on the Order row so the kitchen receipt + the
    // ShipDay dispatch see everything in one place. Pickup/dine-in orders
    // skip this entirely.
    const unitPart = customerInfo.unit?.trim();
    const buzzerPart = customerInfo.buzzer?.trim();
    // Non-delivery orders carry NO address. Previously this fell back to
    // customerInfo.address, so a pickup placed after the customer had typed (or
    // autofilled) an address saved that address on a pickup order — the kitchen
    // then showed a pickup with a delivery address (Luigi 2026-06-13). The
    // server enforces this too, but we must not send it in the first place.
    const fullDeliveryAddress = orderType === "delivery"
      ? [customerInfo.address, unitPart ? `Unit ${unitPart}` : null, buzzerPart ? `Buzz ${buzzerPart}` : null]
          .filter(Boolean)
          .join(", ")
      : "";
    // Structured per-field address for the customizable delivery form. Only
    // fields the restaurant's config SHOWS are included; the server recomposes
    // the flat columns from this. Maps each canonical field to its customerInfo
    // slot (street→address, postcode→zip, apartment→unit, intercom→buzzer).
    const fieldToValue: Record<DeliveryFieldKey, string> = {
      street: customerInfo.address,
      city: customerInfo.city,
      postcode: customerInfo.zip,
      neighbourhood: customerInfo.neighbourhood,
      building: customerInfo.building,
      intercom: customerInfo.buzzer,
      floor: customerInfo.floor,
      apartment: customerInfo.unit,
      parking: customerInfo.parking,
    };
    let deliveryAddressData: DeliveryAddressData | null = null;
    if (orderType === "delivery") {
      const d: DeliveryAddressData = {};
      for (const key of DELIVERY_FIELD_KEYS) {
        if (!deliveryFormConfig[key].show) continue;
        const v = (fieldToValue[key] || "").trim();
        if (v) d[key] = v;
      }
      deliveryAddressData = Object.keys(d).length ? d : null;
    }
    // Combine delivery instructions with order notes — both flow into
    // `notes`. Delivery notes go FIRST so drivers see them at the top.
    const deliveryNotesPart = customerInfo.deliveryNotes?.trim();
    const combinedNotes = [
      deliveryNotesPart ? `Delivery: ${deliveryNotesPart}` : null,
      customerInfo.notes?.trim() || null,
    ].filter(Boolean).join("\n");
    return {
    restaurantSlug: restaurant.slug, type: orderType,
    customerName: customerInfo.name, customerEmail: customerInfo.email,
    customerPhone: customerInfo.phone, deliveryAddress: fullDeliveryAddress,
    deliveryCity: orderType === "delivery" ? customerInfo.city : "",
    deliveryZip: orderType === "delivery" ? customerInfo.zip : "",
    deliveryAddressData,
    // Precise map-pin coords (delivery only) — driver gets an exact spot.
    deliveryLat: orderType === "delivery" ? customerInfo.lat : null,
    deliveryLng: orderType === "delivery" ? customerInfo.lng : null,
    notes: combinedNotes, paymentMethod: customerInfo.paymentMethod,
    scheduledFor: customerInfo.scheduledFor || null,
    // Which time-selection style the customer used ("bands"|"range"|"exact")
    // — the server only stamps a range window when this is "range" AND the
    // service actually enables ranges. Luigi 2026-07-04.
    scheduledStyle: customerInfo.scheduledFor
      ? (customerInfo.scheduledStyle || perServiceSlotModes[0] || "bands")
      : undefined,
    // Only honour the consent flag if we actually have an email to send
    // to AND the user kept the box checked. With the box pre-ticked by
    // default (Luigi 2026-06-02), an email-less guest would otherwise
    // get stamped as "opted in" with nothing to send.
    marketingConsent: customerInfo.marketingConsent === true && customerInfo.email.trim().length > 0,
    from: fromMarketplace ? "marketplace" : undefined,
    // Owner "Preview & test ordering" mode (reseller report cmq3red6b): the
    // server only honours this when the caller has an ADMIN session for this
    // restaurant — it then marks the order TEST- so reports exclude it.
    isTest: isTestPreview || undefined,
    // Reports attribution — server-side join from this hash back to
    // the WebsiteVisit row written when the session started. Server
    // validates format + ignores unknown sessions; safe to include
    // unconditionally. Read directly from sessionStorage (the visit
    // beacon already populated it) to avoid plumbing through props.
    sessionHash: typeof window !== "undefined"
      ? (window.sessionStorage.getItem("ff_session_hash") || undefined)
      : undefined,
    couponId, couponDiscount,
    // Typed coupon code (Phase 2 marketing suite) — server uses this to
    // match Promotion.couponCode in the engine's couponPromos branch.
    // Required for autoApply=false promos to fire on the server-side
    // recompute. Empty → engine ignores.
    couponCode: couponCode.trim() || undefined,
    // Promos the customer removed from the cart — server excludes them so the
    // charged discount matches what they saw. Luigi 2026-06-07.
    suppressedPromoIds,
    // Same code-less gift signal as the preview so the CHARGE forces the same
    // promo into the engine → previewed discount == charged discount. Luigi 2026-07-01.
    grantId: pendingGrantId || undefined,
    // Reserve-then-order: when the customer came through "Add food to your
    // booking", attach the table booking so the server creates the linked
    // Reservation together with this (paid) order — one combined submission.
    // Undefined for every normal order. Luigi 2026-06-08.
    reservation: reservationDraft
      ? {
          date: reservationDraft.date,
          time: reservationDraft.time,
          partySize: reservationDraft.partySize,
          notes: reservationDraft.notes || undefined,
        }
      : undefined,
    subtotal, taxAmount, deliveryFee, tip: tipAmount, total,
    // Reward Dollars the customer chose to spend (server re-validates + claims
    // atomically; never trusted as final). Luigi 2026-06-27.
    creditToApply: rewardInfo && creditToApply > 0 ? creditToApply : undefined,
    items: cart.map(ci => {
      // Defensive: a variant-required item must carry a valid variant or the
      // server rejects it ("Invalid variant"). Normal items always have one
      // (the menu forces the choice); this covers freebies / legacy cart lines
      // for items with hasVariants. Falls back to the default/first variant.
      const effVariant = ci.variant
        ?? (((ci.menuItem as any).hasVariants && (ci.menuItem.variants?.length ?? 0) > 0)
          ? (ci.menuItem.variants!.find((v) => (v as any).isDefault) ?? ci.menuItem.variants![0])
          : undefined);
      return {
      menuItemId: ci.menuItem.id,
      variantId: effVariant?.id ?? null,
      variantName: effVariant?.name ?? null,
      name: ci.menuItem.name + (effVariant ? ` (${effVariant.name})` : ""),
      price: ci.unitPrice != null
        ? ci.unitPrice
        : (ci.variant ? ci.variant.price : ci.menuItem.price) + getModPrice(ci.menuItem, ci.selectedMods),
      quantity: ci.quantity, notes: ci.notes, subtotal: ci.lineTotal,
      modifiers: ci.pizzaCustomization
        ? pizzaCustomizationToModifiers(ci.pizzaCustomization, ci.menuItem.modifierGroups as any)
        : ci.menuItem.modifierGroups.flatMap(g =>
            (ci.selectedMods[g.id] || []).map(optId => {
              const opt = g.options.find(o => o.id === optId)!;
              return { modifierOptionId: opt.id, name: opt.name, priceAdjustment: opt.priceAdjustment };
            })
          ),
      // Bundle line items (Promo Type 8 / 13) carry their child picks
      // through to the server, which persists them on OrderItem.bundleItems
      // (Json column). Null for normal items — server treats null as a
      // standard line and re-validates price from the menu.
      isBundle: ci.isBundle ? true : undefined,
      isCombo: ci.isCombo ? true : undefined,
      bundlePromoId: ci.bundlePromoId ?? undefined,
      bundlePromoName: ci.bundlePromoName ?? undefined,
      bundleItems: ci.bundleItems ?? null,
      };
    }),
    };
  };

  const placeOrder = async () => {
    // Block ordering while the cart holds items that can't share a fulfilment
    // slot — re-surface the conflict prompt instead. (Backstop; the cart's
    // checkout buttons are already guarded.) Luigi 2026-06-14.
    if (hasFulfilConflict) { setFulfilConflictOpen(true); return; }
    if (hasReservationCartConflict) { setReservationCartOpen(true); return; }
    // Mark the cart-session as having reached checkout — the next
    // heartbeat will persist this flag so cart-abandonment reporting
    // can distinguish "browsed only" vs "entered details but didn't pay."
    reachedCheckoutRef.current = true;
    // Guided validation (Luigi 2026-05-29): when the customer hits Place
    // Order with a missing field, expand the relevant section + focus
    // the specific input instead of just popping a toast. Saves the
    // hunt-and-peck for what's wrong.
    const focusField = (id: string) => {
      // Scroll target into view + try to put the caret in it. setTimeout
      // gives React one tick to render the now-expanded section before
      // we look up the DOM node.
      setTimeout(() => {
        const el = document.getElementById(id) as HTMLInputElement | null;
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        try { el.focus({ preventScroll: true }); } catch { /* iOS quirks */ }
      }, 50);
    };
    const nameTokens = customerInfo.name.trim().split(/\s+/).filter(Boolean);
    if (nameTokens.length === 0 || !customerInfo.phone) {
      setEditingSection("contact");
      focusField(nameTokens.length === 0 ? "checkout-contact-first-name" : "checkout-contact-phone");
      toast.error(tT("nameAndPhone"));
      return;
    }
    // Last name is required — both name inputs show a "*". A single token means
    // only a first name was entered; block and point at the last-name box. (R6)
    if (nameTokens.length < 2) {
      setEditingSection("contact");
      focusField("checkout-contact-last-name");
      toast.error(tT("fullNameRequired"));
      return;
    }
    // Phone must be a real number — no letters, at least 6 digits. Catches
    // autofill / saved-profile values that bypass the field's keystroke filter
    // (mirrors the server guard). Fabrizio report cmq0vafk5.
    {
      const digits = (customerInfo.phone.match(/\d/g) || []).length;
      if (/[a-z]/i.test(customerInfo.phone) || digits < 6) {
        setEditingSection("contact");
        focusField("checkout-contact-phone");
        toast.error(tT("phoneInvalid"));
        return;
      }
    }
    // Email is required — customers need it for order confirmation, receipts,
    // refund handling, and disputes. We also use it as the unique key in our
    // customer DB so we can detect returning vs new customers.
    if (!customerInfo.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerInfo.email)) {
      setEditingSection("contact");
      focusField("checkout-contact-email");
      toast.error(tT("emailRequired"));
      return;
    }
    // Delivery required-field validation is CONFIG-DRIVEN (customizable form).
    // We walk the canonical fields in order; the first shown+required field
    // that's empty fails validation, focuses its input, and shows a localized
    // toast. Mirrored server-side (firstMissingRequiredField). Luigi 2026-06-04.
    if (orderType === "delivery") {
      const fieldToValue: Record<DeliveryFieldKey, string> = {
        street: customerInfo.address,
        city: customerInfo.city,
        postcode: customerInfo.zip,
        neighbourhood: customerInfo.neighbourhood,
        building: customerInfo.building,
        intercom: customerInfo.buzzer,
        floor: customerInfo.floor,
        apartment: customerInfo.unit,
        parking: customerInfo.parking,
      };
      // Inputs that have a focusable id (the others share the generic section).
      const fieldToFocusId: Partial<Record<DeliveryFieldKey, string>> = {
        street: "checkout-delivery-address",
        city: "checkout-delivery-city",
        postcode: "checkout-delivery-zip",
      };
      let missingField: DeliveryFieldKey | null = null;
      for (const key of DELIVERY_FIELD_KEYS) {
        const setting = deliveryFormConfig[key];
        if (setting.show && setting.required && !(fieldToValue[key] || "").trim()) {
          missingField = key;
          break;
        }
      }
      if (missingField) {
        setEditingSection("ordering");
        const focusId = fieldToFocusId[missingField];
        if (focusId) focusField(focusId);
        toast.error(tT("fieldRequired", { field: tAddr(missingField) }));
        return;
      }
    }
    // Block delivery orders to a geocoded address that falls OUTSIDE every
    // delivery zone — UNLESS the restaurant has opted to accept out-of-zone
    // orders (Delivery → Advanced settings). Only blocks when we positively
    // know it's out of zone (resolvedZone exists but inside=false);
    // ungeocodable addresses are handled separately. Luigi 2026-06-04.
    if (
      orderType === "delivery" &&
      resolvedZone &&
      !resolvedZone.inside &&
      !(restaurant as any).acceptOutsideZoneOrders
    ) {
      setEditingSection("ordering");
      focusField("checkout-delivery-address");
      toast.error(tT("outOfArea"));
      return;
    }
    if (cart.length === 0) { toast.error(tT("cartEmpty")); return; }
    if (placingRef.current) return; // double-tap can beat the disabled re-render
    placingRef.current = true;
    setOrderLoading(true);
    if (!orderIdemKeyRef.current) {
      orderIdemKeyRef.current =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `idem-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    }
    try {
      const orderRes = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...buildOrderPayload(), idempotencyKey: orderIdemKeyRef.current }),
      });
      const orderData = await orderRes.json();
      if (!orderRes.ok) {
        // Localized message for the past-schedule rejection; everything else
        // falls back to the server's English error string (existing pattern).
        if (orderData.code === "scheduled_in_past") throw new Error(tT("scheduledInPast"));
        // Per-item fulfilment window — the item can only be ordered for certain
        // days/times. In reservation mode the order time is LOCKED to the booking,
        // so the wording tells them to remove it / rebook (not "schedule your
        // order"). Localized client-side from the code + item name so it's never
        // an English-only string. Luigi 2026-06-16.
        if (orderData.code === "item_fulfilment_window_reservation")
          throw new Error(tT("fulfilWindowReservationError", { name: orderData.itemName ?? "" }));
        if (orderData.code === "item_fulfilment_window")
          throw new Error(tT("fulfilWindowOrderError", { name: orderData.itemName ?? "" }));
        // Sold out between adding-to-cart and ordering (Fabrizio 2026-07-04) —
        // tell the customer WHICH item so they can remove the line and proceed.
        if (orderData.code === "item_sold_out")
          throw new Error(tT("itemSoldOutError", { name: orderData.itemName ?? "" }));
        // Service-restricted dish in a stale cart (Fabrizio cmr803ovq) — name
        // the service it IS available for so the customer knows what to do.
        if (orderData.code === "item_service_unavailable")
          throw new Error(
            orderData.service === "delivery"
              ? tT("itemNotForDeliveryError", { name: orderData.itemName ?? "" })
              : tT("itemNotForPickupError", { name: orderData.itemName ?? "" }),
          );
        // ShipDay-dispatched delivery must be prepaid online (Luigi 2026-07-04) —
        // the checkout hides at-door methods, so this only fires on a stale tab
        // or a tampered request.
        if (orderData.code === "delivery_prepaid_required")
          throw new Error(tT("deliveryPrepaidRequired"));
        // Holiday closure — name the affected service when it's a
        // single-service closure (the restaurant is still open otherwise),
        // and append the owner's optional message. Luigi 2026-06-12.
        if (orderData.code === "holiday_closed") {
          const svcLabel = (() => {
            switch (orderData.service) {
              case "delivery": return t("delivery");
              case "dine_in": return t("dineIn");
              case "take_out": return t("takeOut");
              case "catering": return t("catering");
              case "reservation": return t("tableReservation");
              default: return t("pickup");
            }
          })();
          const note = orderData.holidayMessage ? ` ${orderData.holidayMessage}` : "";
          throw new Error(
            (orderData.fullyClosed
              ? tT("holidayClosedFull")
              : tT("holidayServiceClosed", { service: svcLabel })) + note,
          );
        }
        // Customer-assigned code entered with a non-matching email/phone.
        if (orderData.code === "promo_email_mismatch") throw new Error(tT("promoEmailMismatch"));
        throw new Error(orderData.error || tT("orderFailed"));
      }

      // Order landed → this checkout attempt is DONE; the next attempt (e.g.
      // "Place another order") must be a fresh logical order, not a replay.
      orderIdemKeyRef.current = null;
      // Order accepted by the API → clear the persisted cart so a return
      // visit doesn't show the same items they just ordered. The in-memory
      // `cart` state stays as-is (the next route owns the UI) — only the
      // localStorage copy is wiped. Also drop the cart-session token —
      // a fresh visit starts a fresh CartSession.
      try { localStorage.removeItem(CART_STORAGE_KEY); } catch {}
      try { localStorage.removeItem(CART_SESSION_KEY); } catch {}
      // Remember on THIS device that an order was placed here, so the first-buy
      // hero stops showing to a repeat guest. Cosmetic only — the discount is
      // gated new-customers-only server-side, so an over-eager hide (e.g. a
      // card payment later abandoned) never costs a genuine new customer the
      // offer. Luigi 2026-06-09.
      try { localStorage.setItem(`ff-ordered-${restaurant.id}-${customerChannel}`, "1"); } catch {}
      // Silent "remember me" (Luigi 2026-06-10): stash this guest's contact +
      // delivery details on the device so their next order — here OR on any
      // other Fee Free restaurant / the marketplace — pre-fills automatically,
      // no account required. Device-global key (it's the customer's own info).
      // NEVER stores card data (Stripe owns that — PCI-safe). Only when they
      // actually gave a name+contact, so we don't persist a blank shell.
      try {
        if (customerInfo.name.trim() && (customerInfo.email.trim() || customerInfo.phone.trim())) {
          localStorage.setItem("ff-guest-info", JSON.stringify({
            name: customerInfo.name, email: customerInfo.email, phone: customerInfo.phone,
            address: customerInfo.address, city: customerInfo.city, zip: customerInfo.zip,
            unit: customerInfo.unit, buzzer: customerInfo.buzzer, deliveryNotes: customerInfo.deliveryNotes,
            neighbourhood: customerInfo.neighbourhood, building: customerInfo.building,
            floor: customerInfo.floor, parking: customerInfo.parking,
          }));
        }
      } catch {}
      sessionTokenRef.current = null;
      // Reserve-then-order: the booking went in with the order — leave
      // reservation mode so a fresh visit starts clean.
      setReservationDraft(null);
      try { sessionStorage.removeItem("ff_reservation_draft"); } catch {}

      // Reward Dollars: the card/PayPal charge is the total MINUS the credit the
      // server actually applied. When credit covers the whole order there's
      // nothing to charge → skip the payment surface and go straight to
      // confirmation (the order is already settled paid-by-credit). Luigi 2026-06-27.
      const chargeAmount = Math.round((orderData.total - (orderData.creditApplied ?? 0)) * 100) / 100;
      const needsOnline = chargeAmount > 0.005;

      if (customerInfo.paymentMethod === "card" && cardPaymentEnabled && needsOnline) {
        // Reports funnel — fire payment_open just before we navigate
        // to the payment screen. Fires on card orders only; cash /
        // in-person orders skip straight to confirmation and never
        // see a payment surface, so this step doesn't apply to them.
        fireStep("payment_open");
        // Create payment intent and go to payment page
        const piRes = await fetch("/api/public/payment-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            restaurantSlug: restaurant.slug,
            amount: chargeAmount,
            // Send the restaurant's configured currency so Stripe charges
            // in the right denomination (server overrides anyway, but
            // sending the correct value avoids the "client said USD,
            // server says EUR" rejection path).
            currency: currencyCode,
            metadata: { orderId: orderData.id },
          }),
        });
        const piData = await piRes.json();
        if (!piRes.ok) throw new Error(piData.error || tT("paymentSetupFailed"));
        const params = new URLSearchParams({
          orderId: orderData.id,
          clientSecret: piData.clientSecret,
          pk: piData.publishableKey,
          // Direct-charge PaymentIntents need Stripe.js to be told which
          // connected account they belong to. piData.stripeAccount is set
          // by /api/public/payment-intent — forward it through.
          stripeAccount: piData.stripeAccount ?? "",
        });
        router.push(`/order/${restaurant.slug}/payment?${params.toString()}`);
      } else if (customerInfo.paymentMethod === "paypal" && paypalEnabled && needsOnline) {
        // PayPal flow — create a PayPal Order, get the approve URL,
        // redirect customer there. Customer signs in + approves on
        // PayPal, then PayPal redirects them back to /order/<slug>/paypal/return
        // which authorizes + flips status. Fire funnel step before
        // redirect (mirrors the card branch above).
        fireStep("payment_open");
        const ppRes = await fetch("/api/public/paypal-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            restaurantSlug: restaurant.slug,
            amount: total,
            // Server overrides with the restaurant's stored currency; sending
            // the right value here keeps the client in sync and avoids a
            // round-trip rejection on currency mismatch.
            currency: currencyCode.toUpperCase(),
            orderId: orderData.id,
          }),
        });
        const ppData = await ppRes.json();
        if (!ppRes.ok || !ppData.approveUrl) {
          throw new Error(ppData.error || "PayPal setup failed");
        }
        // Full-page redirect — PayPal doesn't render inside an iframe.
        window.location.href = ppData.approveUrl;
      } else {
        router.push(`/order/${restaurant.slug}/confirmation?orderId=${orderData.id}`);
      }
    } catch (e: any) { toast.error(e.message); }
    placingRef.current = false;
    setOrderLoading(false);
  };

  const scrollToCategory = (catId: string) => {
    setActiveCategory(catId);
    // In the mobile accordion, tapping a category pill expands that category
    // so the customer lands on its items, not a collapsed header.
    if (collapsibleActive) {
      setCollapsedCats((prev) => {
        if (!prev.has(catId)) return prev;
        const next = new Set(prev);
        next.delete(catId);
        return next;
      });
    }
    const el = categoryRefs.current[catId];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const infoLink = `/order/${restaurant.slug}/info`;

  // ── Promo modal helpers ─────────────────────────────────────────────
  // Flatten the visible menu so the PromoDetailModal can look up items
  // by id (eligible-items rows + bundle slot pools) without re-walking
  // the category tree. Cheap; menu sizes are bounded.
  const flatMenuItems = visibleCategories.flatMap((c) =>
    c.menuItems.map((mi) => ({
      id: mi.id,
      name: mi.name,
      price: mi.price,
      imageUrl: mi.imageUrl,
      categoryId: mi.categoryId,
      // Carry the sold-out flag so every promo/bundle/combo picker can show
      // the dish DISABLED + "Sold out" (matches the menu card). Display-only:
      // the orders route is the real gate (rejects with item_sold_out).
      isSoldOut: !!mi.isSoldOut,
      variants: (mi.variants ?? []).map((v) => ({ id: v.id, name: v.name, price: v.price })),
      // "+ Add" quick-add is only offered for truly-simple items (no size choice + no modifier
      // groups at all); anything with options opens the customizer. Fabrizio 2026-06-25.
      requiresChoice: !!(mi as any).hasVariants || (((mi as any).modifierGroups?.length) ?? 0) > 0,
    })),
  );

  // A "plain" cart line is exactly what the promo screen's quick-add creates: no size,
  // no modifiers, no note, not a bundle/freebie/pizza-builder line. Only these are safe
  // for the promo-screen −/qty/+ stepper to count and decrement — a customized line
  // can't be reduced without knowing WHICH configuration to drop. (cmqtmfp2n, 2026-07-03.)
  const isPlainCartLine = (ci: (typeof cart)[number]) =>
    !ci.variant &&
    Object.keys(ci.selectedMods ?? {}).length === 0 &&
    !ci.notes &&
    !(ci as any).isBundle &&
    (ci as any).unitPrice == null;
  const promoCartQuantities = useMemo(() => {
    const out: Record<string, number> = {};
    for (const ci of cart) {
      if (!isPlainCartLine(ci)) continue;
      out[ci.menuItem.id] = (out[ci.menuItem.id] ?? 0) + ci.quantity;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart]);

  /** Add a freebie item (Promo Type 7) to the cart at $0. The engine
   *  re-validates eligibility on every cart change — if the customer
   *  drops below the trigger threshold the discount falls off, but the
   *  line item stays (charged at the freebie's normal price). */
  const addFreebieToCart = (
    item: { id: string; name: string; price: number; imageUrl?: string; categoryId?: string },
    promoName: string,
    variantId?: string | null,
  ) => {
    const fullItem = visibleCategories
      .flatMap((c) => c.menuItems)
      .find((mi) => mi.id === item.id);
    if (!fullItem) {
      toast.error(tT("itemUnavailable") ?? "Item unavailable");
      return;
    }
    // The customer may have picked a specific size variant for the freebie.
    let chosenVariant = variantId
      ? (fullItem.variants ?? []).find((v) => v.id === variantId)
      : undefined;
    // If the item REQUIRES a variant (hasVariants) but none was picked, fall
    // back to its default (or first) variant — otherwise the order fails server
    // validation ("Invalid variant"). The picker forces a choice for items with
    // listed variants; this covers default-only items. Luigi 2026-06-07.
    if (!chosenVariant && (fullItem as any).hasVariants && (fullItem.variants?.length ?? 0) > 0) {
      chosenVariant = fullItem.variants!.find((v) => (v as any).isDefault) ?? fullItem.variants![0];
    }
    // Add the freebie at its NORMAL price — the promo engine then applies a
    // matching discount so exactly ONE nets to $0 (and the line reverts to
    // full price if the cart later drops below the trigger). Adding it at $0
    // double-discounted (free line + separate promo discount) AND let the
    // customer stack unlimited free units. Luigi 2026-06-07.
    const unit = chosenVariant?.price ?? fullItem.price;
    setCart((prev) => {
      // If this exact freebie (same item + variant) is already in the cart,
      // bump its quantity instead of adding a second line — only ONE unit is
      // free, the rest are charged.
      const existingIdx = prev.findIndex((ci) =>
        ci.notes === `Free with promo: ${promoName}` &&
        ci.menuItem.id === fullItem.id &&
        (ci.variant?.id ?? null) === (chosenVariant?.id ?? null));
      if (existingIdx >= 0) {
        const next = [...prev];
        const ex = next[existingIdx];
        const qty = ex.quantity + 1;
        next[existingIdx] = { ...ex, quantity: qty, unitPrice: unit, lineTotal: unit * qty };
        return next;
      }
      return [
        ...prev,
        {
          menuItem: fullItem,
          variant: chosenVariant,
          quantity: 1,
          selectedMods: {},
          notes: `Free with promo: ${promoName}`,
          lineTotal: unit,
          unitPrice: unit,
        },
      ];
    });
    toast.success(`Added ${fullItem.name}${chosenVariant ? ` (${chosenVariant.name})` : ""}`);
  };

  /** Add a fully-built bundle (Promo Type 8 / 13) to the cart as ONE
   *  consolidated parent line item. The bundle's price is the owner's
   *  fixed bundlePrice + summed speciality fees (computed by the
   *  composer). Server validates the bundle composition at /api/orders. */
  const addBundleToCart = (bundle: BundleCartItem) => {
    // Synthesize a minimal MenuItem so the existing CartItem.menuItem
    // shape is satisfied. The id is prefixed `bundle:` so backend +
    // receipt rendering can detect it.
    const syntheticMenuItem: MenuItem = {
      id: bundle.syntheticMenuItemId,
      name: bundle.promoName,
      description: "",
      price: bundle.bundlePrice,
      imageUrl: undefined,
      isFeatured: false,
      isSoldOut: false,
      isHidden: false,
      hasVariants: false,
      forPickup: true,
      forDelivery: true,
      modifierGroups: [],
      variants: [],
    };
    setCart((prev) => [
      ...prev,
      {
        menuItem: syntheticMenuItem,
        variant: undefined,
        quantity: 1,
        selectedMods: {},
        notes: "",
        lineTotal: bundle.lineTotal,
        unitPrice: bundle.lineTotal,
        isBundle: true,
        bundlePromoId: bundle.promoId,
        bundlePromoName: bundle.promoName,
        bundleItems: bundle.children.map((c) => ({
          menuItemId: c.menuItemId,
          variantId: c.variantId,
          name: c.name,
          variantName: c.variantName,
          notes: c.notes,
          specialityFee: c.specialityFee,
        })),
      },
    ]);
    toast.success(`Added bundle: ${bundle.promoName}`);
  };

  /** Complete a guided multi-group promo (bogo / buy_n_get_free /
   *  free_dish_meal / fixed_combo / percentage_combo). Drops every chosen item
   *  into the cart in ONE batch: paid-group picks at their normal price, and
   *  free-group picks tagged "Free with promo: <name>" so the engine nets
   *  exactly one to $0 (and the existing cleanup reverts them if the qualifying
   *  items are later removed). The discount is always engine-driven — this only
   *  assembles the qualifying cart so the customer never has to back out to the
   *  full menu. Luigi 2026-06-07. */
  const addGuidedPromoToCart = (
    picks: Array<{ menuItemId: string; variantId: string | null; isFree: boolean }>,
    promoName: string,
  ) => {
    const fullItems = visibleCategories.flatMap((c) => c.menuItems);
    const additions: CartItem[] = [];
    for (const p of picks) {
      const fullItem = fullItems.find((mi) => mi.id === p.menuItemId);
      if (!fullItem) continue;
      // Resolve the chosen size; fall back to the default/first variant when the
      // item requires one but the picker didn't capture it (mirrors freebie).
      let chosenVariant = p.variantId
        ? (fullItem.variants ?? []).find((v) => v.id === p.variantId)
        : undefined;
      if (!chosenVariant && (fullItem as any).hasVariants && (fullItem.variants?.length ?? 0) > 0) {
        chosenVariant = fullItem.variants!.find((v) => (v as any).isDefault) ?? fullItem.variants![0];
      }
      const unit = chosenVariant?.price ?? fullItem.price;
      additions.push({
        menuItem: fullItem,
        variant: chosenVariant,
        quantity: 1,
        selectedMods: {},
        notes: p.isFree ? `Free with promo: ${promoName}` : "",
        lineTotal: unit,
        unitPrice: unit,
      });
    }
    if (additions.length === 0) {
      toast.error(tT("itemUnavailable") ?? "Item unavailable");
      return;
    }
    setCart((prev) => {
      const next = [...prev];
      for (const add of additions) {
        // Free lines merge with an identical existing freebie (one free, rest
        // charged) — same rule as addFreebieToCart. Paid lines always append.
        if (typeof add.notes === "string" && add.notes.startsWith("Free with promo:")) {
          const idx = next.findIndex((ci) =>
            ci.notes === add.notes &&
            ci.menuItem.id === add.menuItem.id &&
            (ci.variant?.id ?? null) === (add.variant?.id ?? null));
          if (idx >= 0) {
            const ex = next[idx];
            const qty = ex.quantity + 1;
            next[idx] = { ...ex, quantity: qty, lineTotal: (ex.unitPrice ?? 0) * qty };
            continue;
          }
        }
        next.push(add);
      }
      return next;
    });
    toast.success(tT("promoItemsAdded") ?? "Items added — your discount applies at checkout");
  };

  const bannerH = bannerHeightPx(theme.bannerHeight);

  return (
    <CurrencyProvider currency={(restaurant as any)?.currency}>
    <div className="min-h-screen" style={{ backgroundColor: theme.backgroundColor, color: theme.textColor }}>
      {/* Reserve-then-order: persistent banner while building an order that
          will be submitted together with a table booking. Cancel drops back to
          a normal order. Luigi 2026-06-08. */}
      {reservationDraft && (
        <div className="sticky top-0 z-40 w-full px-4 py-2.5 flex items-center justify-between gap-3 text-sm text-white shadow" style={{ backgroundColor: theme.primaryColor }}>
          <div className="flex items-center gap-2 min-w-0">
            <span aria-hidden>🪑</span>
            <span className="truncate">
              <strong>{t("reservationOrderingTitle")}</strong>
              {" — "}
              {t("reservationOrderingDetail", {
                date: reservationDraft.date,
                time: formatHHMM(reservationDraft.time, hoursFmt),
                n: reservationDraft.partySize,
              })}
            </span>
          </div>
          <button
            onClick={() => {
              setReservationDraft(null);
              try { sessionStorage.removeItem("ff_reservation_draft"); } catch {}
            }}
            className="flex-shrink-0 underline font-semibold hover:no-underline"
          >
            {t("reservationOrderingCancel")}
          </button>
        </div>
      )}
      {/* Reorder feedback banner. Fires after the customer hits "Reorder"
          on the status page; tells them how many items came back, what
          couldn't, and to review modifiers. Auto-dismisses in ~9s. */}
      {reorderBanner && (
        <div
          role="status"
          className="fixed left-1/2 -translate-x-1/2 z-50 max-w-sm w-[calc(100%-2rem)] mt-3 sm:mt-4 px-4 py-3 rounded-xl shadow-lg border bg-emerald-50 border-emerald-200 text-emerald-900 text-sm"
          style={{ top: 0 }}
        >
          <div className="flex items-start justify-between gap-2">
            <span>{reorderBanner}</span>
            <button
              onClick={() => setReorderBanner(null)}
              className="text-emerald-700 hover:text-emerald-900 font-bold leading-none"
              aria-label="Dismiss"
            >×</button>
          </div>
        </div>
      )}
      {/* Marketplace ribbon — visible only when the customer arrived from
          /marketplace. Tells them they're paying exactly what's on the menu
          (no aggregator markup) and offers a one-tap back link. Hidden in
          embedded mode (the widget user came from the restaurant's own
          site, not the marketplace channel). */}
      {fromMarketplace && !isEmbedded && (
        <div className="bg-gradient-to-r from-emerald-600 to-slate-900 text-white text-xs sm:text-sm py-2 px-4 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true">✨</span>
            <span>
              Ordering via the <strong>Fee Free Marketplace</strong> — same menu prices, no extra customer fees.
            </span>
          </span>
          <a href="/marketplace" className="hidden sm:inline underline opacity-90 hover:opacity-100 whitespace-nowrap">
            ← Browse other restaurants
          </a>
        </div>
      )}

      {/* Hosted-site breadcrumb — visible only when the customer arrived
          via ?from=hosted (a click on "Order Online" from the restaurant's
          Sales Optimized Website). Without this they hit a dead-end on
          /order with no obvious way back to the marketing page they were
          on. Hidden in embedded mode (the iframe widget has its own
          close-overlay UX) and in marketplace mode (those customers came
          from /marketplace which has its own ribbon above). */}
      {fromHostedSite && !isEmbedded && !fromMarketplace && (
        <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-2 text-xs sm:text-sm">
          <a
            href={hostedSiteBackUrl ?? `/site/${restaurant.slug}`}
            className="inline-flex items-center gap-1.5 text-gray-700 hover:text-gray-900 hover:underline font-medium"
          >
            <span aria-hidden="true">←</span>
            <span>Back to {restaurant.name}&apos;s site</span>
          </a>
        </div>
      )}

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      {/* In embedded mode we replace the big photo hero with a compact
          name+logo strip — the widget is supposed to be the minimal
          ordering surface, not a marketing page. */}
      {isEmbedded ? (
        <div
          className="px-4 py-3 flex items-center gap-3"
          style={{ backgroundColor: theme.cardBackground, borderBottom: "1px solid rgba(0,0,0,0.08)" }}
        >
          {restaurant.logoUrl && (
            <img
              src={restaurant.logoUrl}
              alt="logo"
              className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
            />
          )}
          <h1 className="text-lg font-bold truncate" style={{ color: theme.textColor }}>
            {restaurant.name}
          </h1>
        </div>
      ) : (
        <div className="relative" style={{ height: bannerH }}>
          {restaurant.bannerUrl ? (
            <div className="absolute inset-0 overflow-hidden">
              <img
                src={restaurant.bannerUrl}
                alt="banner"
                className="w-full h-full object-cover"
                style={{ objectPosition: theme.bannerPosition }}
              />
              <div className="absolute inset-0" style={{ backgroundColor: `rgba(0,0,0,${theme.bannerOpacity / 100})` }} />
            </div>
          ) : (
            <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${theme.primaryColor}, ${theme.accentColor})` }} />
          )}
          <div className="absolute bottom-0 left-0 right-0 px-4 pb-6">
            <div
              className="max-w-5xl mx-auto flex items-end gap-4"
              style={{ justifyContent: theme.headerLayout === "center" ? "center" : "flex-start" }}
            >
              {restaurant.logoUrl && (
                <img src={restaurant.logoUrl} alt="logo" className="w-20 h-20 rounded-2xl border-4 border-white shadow-lg object-cover flex-shrink-0" />
              )}
              <div className={`text-white ${theme.headerLayout === "center" ? "text-center" : ""}`}>
                <h1 className="text-3xl md:text-4xl font-bold drop-shadow-lg">{restaurant.name}</h1>
                {restaurant.slogan && <p className="text-white/80 mt-1">{restaurant.slogan}</p>}
                {restaurant.description && !restaurant.slogan && <p className="text-white/70 mt-1 text-sm line-clamp-1">{restaurant.description}</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Info bar ─────────────────────────────────────────────────────── */}
      {/* In embedded mode this collapses to JUST the open/closed status —
          no address, no phone, no language switcher, no Reservation /
          Restaurant Info buttons. Those things belong on the SEO website
          (paid upgrade), not on the free widget. */}
      {isEmbedded ? (
        todayHours && (
          <div className="border-b border-gray-100" style={{ backgroundColor: theme.cardBackground }}>
            <div className="px-4 py-2 text-xs">
              {/* Holiday closure overrides the weekly row (live-test bug
                  2026-06-12: chip said "Open" on a holiday-closed day). */}
              <span className={`flex items-center gap-1.5 ${headerIsOpenNow ? "text-green-600" : "text-red-600"}`}>
                <Clock className="w-3.5 h-3.5" />
                {headerIsOpenNow
                  ? `${t("open")} · ${todayHoursLabel}`
                  : headerClosedText}
              </span>
            </div>
          </div>
        )
      ) : (
        <div className="border-b border-gray-100 shadow-sm" style={{ backgroundColor: theme.cardBackground }}>
          <div className="max-w-5xl mx-auto px-4 py-3 flex flex-wrap items-center gap-4 text-sm text-gray-600">
            {restaurant.address && (
              <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" style={{ color: theme.primaryColor }} />{restaurant.address}{restaurant.city ? `, ${restaurant.city}` : ""}</span>
            )}
            {restaurant.phone && (
              <a href={`tel:${restaurant.phone}`} className="flex items-center gap-1.5"><Phone className="w-4 h-4" style={{ color: theme.primaryColor }} />{restaurant.phone}</a>
            )}
            {todayHours && (
              // Holiday closure overrides the weekly row (live-test bug
              // 2026-06-12: chip said "Open" on a holiday-closed day).
              <span className={`flex items-center gap-1.5 ${headerIsOpenNow ? "text-green-600" : "text-red-600"}`}>
                <Clock className="w-4 h-4" />
                {headerIsOpenNow
                  ? `${t("open")}: ${todayHoursLabel}`
                  : headerClosedText}
              </span>
            )}
            {/* Action group — mobile-friendly (Luigi 2026-06-01):
                on phones the pill buttons collapsed text labels behind
                an overflowing flex row that got clipped at the right
                edge. Now labels hide below sm: so the buttons become
                compact icon-pills, padding shrinks, and ml-auto only
                kicks in once there's room (≥sm). The group also wraps
                if anything still doesn't fit, so even with translated
                labels (Italian "Prenotazione tavolo" is much longer
                than "Reservation") nothing gets cut off. */}
            <div className="w-full sm:w-auto sm:ml-auto flex flex-wrap items-center gap-1 sm:gap-2">
              <LanguageSwitcher currentLocale={locale} />
              {fromMarketplace ? (
                // Marketplace-wide account (CustomerAccount) — one identity
                // across all Fee Free restaurants, not the per-restaurant
                // account. Luigi 2026-06-09.
                <a
                  href={marketplaceAccount ? "/account" : "/account/login"}
                  className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-full border-2 transition hover:bg-gray-50"
                  style={{ borderColor: theme.primaryColor, color: theme.primaryColor }}
                  title={marketplaceAccount ? "View your Marketplace account" : t("signInTooltip")}
                >
                  {marketplaceAccount ? <UserCircle className="w-4 h-4 flex-shrink-0" /> : <LogIn className="w-4 h-4 flex-shrink-0" />}
                  <span className="hidden sm:inline">
                    {marketplaceAccount ? `Hi, ${(marketplaceAccount.name ?? "").split(/\s+/)[0] || ""}`.trim() : t("signIn")}
                  </span>
                </a>
              ) : (
                currentCustomer ? (
                  <a
                    href={`/order/${restaurant.slug}/account`}
                    className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-full border-2 transition hover:bg-gray-50"
                    style={{ borderColor: theme.primaryColor, color: theme.primaryColor }}
                    title="View your account, coupons, and order history"
                  >
                    <UserCircle className="w-4 h-4 flex-shrink-0" />
                    <span className="hidden sm:inline">Hi, {currentCustomer.name.split(/\s+/)[0]}</span>
                  </a>
                ) : (
                  <a
                    href={`/order/${restaurant.slug}/account/login`}
                    className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-full border-2 transition hover:bg-gray-50"
                    style={{ borderColor: theme.primaryColor, color: theme.primaryColor }}
                    title={t("signInTooltip")}
                  >
                    <LogIn className="w-4 h-4 flex-shrink-0" />
                    <span className="hidden sm:inline">{t("signIn")}</span>
                  </a>
                )
              )}
              {restaurant.acceptsReservations && (
                // Luigi 2026-06-01 v3: bump the Reserve chip to be the
                // visually dominant button in the action group on
                // mobile — bigger icon, bolder weight, deeper shadow,
                // longer "Book a Table" label so the customer can't
                // miss what it is. Other action pills stay compact
                // icon-only (Sign in, Restaurant Info) per Luigi's
                // explicit ask. Desktop keeps the longer
                // "Table Reservation" label it already used.
                // Book a Table opens the DEDICATED reservation screen
                // (separate from the takeout/delivery ordering flow), per
                // report cmpxeacks — not an overlay modal on the order page.
                <a
                  href={`/order/${restaurant.slug}/reservation`}
                  className="flex items-center gap-1.5 sm:gap-2 text-sm sm:text-sm font-bold px-3 sm:px-4 py-2.5 sm:py-2.5 rounded-full text-white transition hover:opacity-90 shadow-md ring-1 ring-white/10"
                  style={{ backgroundColor: theme.primaryColor }}
                  title={t("tableReservation")}
                >
                  <Calendar className="w-[18px] h-[18px] sm:w-4 sm:h-4 flex-shrink-0" />
                  <span className="sm:hidden">{t("bookATable")}</span>
                  <span className="hidden sm:inline">{t("tableReservation")}</span>
                </a>
              )}
              <a
                href={infoLink}
                className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-full border-2 transition hover:bg-gray-50"
                style={{ borderColor: theme.primaryColor, color: theme.primaryColor }}
                title={t("restaurantInfo")}
              >
                <Info className="w-4 h-4 flex-shrink-0" />
                <span className="hidden sm:inline">{t("restaurantInfo")}</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ── Special-day / holiday banner (Gloriafood parity) ─────────────
          Reseller report cmpxds2d2: a holiday closure must be VISIBLE on
          the customer page, not just enforced at checkout. Full-bleed
          strip spanning the page width in dark amber (Luigi 2026-06-12
          styling request), sitting ABOVE the menu container. The variant
          is keyed on the explicit todayHolidayClosed flag — deriving it
          from name/message presence rendered the wrong shape when the
          owner left the optional name blank. */}
      {(todayHolidayClosed || todayHolidayName || todayHolidayMessage || (todayHolidayIntervals?.length ?? 0) > 0 || holidayClosedServices.length > 0 || holidayClosedWindows.length > 0 || holidayCustomHoursServices.length > 0 || (holidayClosedWindowsGeneral?.length ?? 0) > 0) && (() => {
        const hasCustomHours = (todayHolidayIntervals?.length ?? 0) > 0;
        const serviceLabel = (s: string) =>
          s === "pickup" ? t("pickup")
          : s === "delivery" ? t("delivery")
          : s === "dine_in" ? t("dineIn")
          : s === "take_out" ? t("takeOut")
          : s === "reservation" ? t("tableReservation")
          : s === "catering" ? t("catering")
          : s.charAt(0).toUpperCase() + s.slice(1);
        const fmtWins = (ivs: Array<{ open: string; close: string }>) =>
          ivs.map((iv) => `${formatHHMM(iv.open, hoursFmt)} – ${formatHHMM(iv.close, hoursFmt)}`).join(", ");
        const nameSuffix = todayHolidayName ? ` — ${todayHolidayName}` : "";
        return (
          <div className="w-full bg-amber-500 border-b border-amber-600 px-4 sm:px-6 py-3 text-sm">
            <div className="max-w-5xl mx-auto space-y-0.5">
              {(todayHolidayClosed || hasCustomHours || holidayClosedServices.length > 0) && (
                <div className="font-bold text-amber-950">
                  {todayHolidayClosed
                    ? <>⛔ {t("holidayClosedToday")}{nameSuffix}</>
                    : hasCustomHours
                      ? <>🕒 {t("holidaySpecialHours")}{nameSuffix}: {fmtWins(todayHolidayIntervals!)}</>
                      : <>⛔ {t("holidayNotAvailableToday", { services: holidayClosedServices.map(serviceLabel).join(", ") })}{nameSuffix}</>}
                </div>
              )}
              {/* A general all-services "Closed hours" rule → ONE line (not six). */}
              {!todayHolidayClosed && (holidayClosedWindowsGeneral?.length ?? 0) > 0 && (
                <div className="font-bold text-amber-950">
                  ⏸ {t("holidayClosedHoursToday", { windows: fmtWins(holidayClosedWindowsGeneral!) })}
                </div>
              )}
              {/* Partial / per-service closures (Fabrizio): "Closed hours" ranges
                  and per-service custom open-hours each get their own banner line. */}
              {!todayHolidayClosed && holidayClosedWindows.map((g, i) => (
                <div key={`cw-${i}`} className="font-bold text-amber-950">
                  ⏸ {t("holidayServiceClosedWindows", { service: serviceLabel(g.service), windows: fmtWins(g.intervals) })}
                </div>
              ))}
              {!todayHolidayClosed && holidayCustomHoursServices.map((g, i) => (
                <div key={`ch-${i}`} className="font-bold text-amber-950">
                  🕒 {t("holidayServiceSpecialHours", { service: serviceLabel(g.service), windows: fmtWins(g.intervals) })}
                </div>
              ))}
              {todayHolidayMessage && (
                <div className="text-xs text-amber-900">{todayHolidayMessage}</div>
              )}
              {todayHolidayClosed && (
                <div className="text-xs text-amber-900 mt-0.5">{t("holidayOrderLater")}</div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Closed-now banner (regular weekly hours) — GloriaFood parity ──
          When the restaurant is closed by its WEEKLY schedule (opens at noon,
          it's 10 AM — or closed for the rest of today) we still want the
          prominent "you can order for later" strip, not just the small status
          chip in the info bar. The holiday/extraordinary-closure banner above
          only covered RestaurantHoliday days; this covers the ordinary case
          (reseller report). Gated to NOT fire when that holiday banner is
          showing, so the two never stack. liveStatusForClient already folds
          in holidays + timezone, so a custom-hours holiday between intervals
          shows the holiday banner (its gate is true) and suppresses this one. */}
      {!(todayHolidayClosed || todayHolidayName || todayHolidayMessage || (todayHolidayIntervals?.length ?? 0) > 0 || holidayClosedServices.length > 0 || holidayClosedWindows.length > 0 || holidayCustomHoursServices.length > 0 || (holidayClosedWindowsGeneral?.length ?? 0) > 0) &&
        (liveStatusForClient.kind === "opens_at" || liveStatusForClient.kind === "closed_today") && (
        <div className="w-full bg-amber-400 border-b border-amber-500 px-4 sm:px-6 py-3">
          <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
            <div className="flex items-center gap-2 text-amber-950 font-semibold text-xs sm:text-sm min-w-0">
              <Clock className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
              <span>{t("closedNowBanner")}</span>
            </div>
            <button
              type="button"
              onClick={() =>
                document.getElementById("ff-menu-start")?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
              className="self-start sm:self-auto flex-shrink-0 rounded-lg bg-white px-3.5 py-2 text-xs sm:text-sm font-bold text-amber-900 shadow-sm hover:bg-amber-50 transition"
            >
              {t("seeMenuOrderAhead")}
            </button>
          </div>
        </div>
      )}

      <div id="ff-menu-start" className="max-w-5xl mx-auto px-4 py-5">
        {/* ── Owner test-mode banner (reseller report cmq3red6b) ───────── */}
        {isTestPreview && (
          <div className="mb-4 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm">
            <div className="font-semibold text-violet-900">🧪 {t("testModeBanner")}</div>
            <div className="text-xs text-violet-800 mt-0.5">{t("testModeHint")}</div>
          </div>
        )}

        {/* ── Paused-service banner ──────────────────────────────────────
            Reads the per-service pausedUntil columns we added on
            Restaurant. When non-null AND in the future, that service
            is paused. Auto-clears the moment the timestamp passes
            (next render). Luigi 2026-06-01 GloriaFood-parity. */}
        {(() => {
          const r = restaurant as any;
          const nowMs = Date.now();
          // Translated service names (Fabrizio: the pause banner was English-only).
          const svcLabel = (s: string) =>
            s === "pickup" ? t("pickup")
            : s === "delivery" ? t("delivery")
            : s === "dine_in" ? t("dineIn")
            : s === "take_out" ? t("takeOut")
            : s === "reservation" ? t("tableReservation")
            : s === "catering" ? t("catering")
            : s.charAt(0).toUpperCase() + s.slice(1);
          const entries: Array<[string, unknown]> = [
            ["pickup", r.pickupPausedUntil],
            ["delivery", r.deliveryPausedUntil],
            ["dine_in", r.dineInPausedUntil],
            ["catering", r.cateringPausedUntil],
            ["take_out", r.takeOutPausedUntil],
            ["reservation", r.reservationsPausedUntil],
          ];
          const pausedNames: string[] = [];
          let bestMs: number | null = null;
          for (const [key, val] of entries) {
            if (!val) continue;
            const ms = new Date(val as string).getTime();
            if (ms > nowMs) {
              pausedNames.push(svcLabel(key));
              if (bestMs === null || ms < bestMs) bestMs = ms;
            }
          }
          if (pausedNames.length === 0) return null;
          const resumeTime = bestMs !== null
            ? new Date(bestMs).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hourCycle: hoursFmt === "24h" ? "h23" : "h12" })
            : null;
          return (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
              <div className="font-semibold text-amber-900 mb-0.5">
                ⏸ {t("pauseBannerTitle", { services: pausedNames.join(", ") })}
              </div>
              <div className="text-xs text-amber-800">
                {t("pauseBannerDescription")}
                {resumeTime && <> {t("pauseBannerResume", { time: resumeTime })}</>}
              </div>
            </div>
          );
        })()}

        {/* ── Order type ───────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-3 mb-5 [&>button]:min-w-[140px]">
          {restaurant.acceptsPickup && (() => {
            const until = (restaurant as any).pickupPausedUntil;
            const holClosed = holidayClosedServices.includes("pickup");
            const paused = (!!until && new Date(until).getTime() > Date.now()) || holClosed;
            let desc = "";
            try { desc = (JSON.parse((restaurant as any).serviceSettings || "null")?.pickup?.description || "").trim(); } catch {}
            return (
              <button
                onClick={() => !paused && setOrderType("pickup")}
                disabled={paused}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-3 px-2 rounded-xl font-semibold border-2 transition text-sm ${paused ? "opacity-50 cursor-not-allowed" : ""}`}
                style={orderType === "pickup"
                  ? { borderColor: theme.primaryColor, backgroundColor: `${theme.primaryColor}15`, color: theme.primaryColor }
                  : { borderColor: "#e5e7eb", backgroundColor: theme.cardBackground, color: "#6b7280" }
                }
              >
                <span className="flex items-center gap-2 flex-wrap justify-center">
                  <ShoppingBag className="w-4 h-4" /> {t("pickup")}{showServiceTimes && <> · {restaurant.estimatedPickup} {t("minutes")}</>}
                  {paused && <span className="text-xs">({holClosed ? t("closedToday") : t("servicePausedBadge")})</span>}
                  {!paused && pickupOpensAt && <span className="text-xs font-normal opacity-80">({t("opensAtLabel", { time: pickupOpensAt })})</span>}
                </span>
                {desc && <span className="text-xs font-normal opacity-70 leading-tight line-clamp-2 text-center">{desc}</span>}
              </button>
            );
          })()}
          {restaurant.acceptsDelivery && (() => {
            const until = (restaurant as any).deliveryPausedUntil;
            const holClosed = holidayClosedServices.includes("delivery");
            const paused = (!!until && new Date(until).getTime() > Date.now()) || holClosed;
            let desc = "";
            try { desc = (JSON.parse((restaurant as any).serviceSettings || "null")?.delivery?.description || "").trim(); } catch {}
            return (
              <button
                onClick={() => !paused && setOrderType("delivery")}
                disabled={paused}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-3 px-2 rounded-xl font-semibold border-2 transition text-sm ${paused ? "opacity-50 cursor-not-allowed" : ""}`}
                style={orderType === "delivery"
                  ? { borderColor: theme.primaryColor, backgroundColor: `${theme.primaryColor}15`, color: theme.primaryColor }
                  : { borderColor: "#e5e7eb", backgroundColor: theme.cardBackground, color: "#6b7280" }
                }
              >
                <span className="flex items-center gap-2 flex-wrap justify-center">
                  <Truck className="w-4 h-4" /> {t("delivery")}{showServiceTimes && <> · {estimatedDeliveryMinutes} {t("minutes")}</>}
                  {baseDeliveryFee > 0 && <span className="text-xs font-normal">(+{fmt(baseDeliveryFee)})</span>}
                  {paused && <span className="text-xs">({holClosed ? t("closedToday") : t("servicePausedBadge")})</span>}
                  {!paused && deliveryOpensAt && <span className="text-xs font-normal opacity-80">({t("opensAtLabel", { time: deliveryOpensAt })})</span>}
                </span>
                {desc && <span className="text-xs font-normal opacity-70 leading-tight line-clamp-2 text-center">{desc}</span>}
              </button>
            );
          })()}
          {/* Dine-In + Take-Out — pickup-style channels (no address, no delivery
              fee). Each shows its own estimated time from serviceSettings. */}
          {(restaurant as any).acceptsDineIn && (() => {
            const until = (restaurant as any).dineInPausedUntil;
            const holClosed = holidayClosedServices.includes("dine_in");
            const paused = (!!until && new Date(until).getTime() > Date.now()) || holClosed;
            let est = restaurant.estimatedPickup;
            let desc = "";
            try { const ss = JSON.parse((restaurant as any).serviceSettings || "null"); const v = ss?.dineIn?.estimatedTime; if (typeof v === "number" && v > 0) est = v; desc = (ss?.dineIn?.description || "").trim(); } catch {}
            return (
              <button
                onClick={() => !paused && setOrderType("dine_in")}
                disabled={paused}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-3 px-2 rounded-xl font-semibold border-2 transition text-sm ${paused ? "opacity-50 cursor-not-allowed" : ""}`}
                style={orderType === "dine_in"
                  ? { borderColor: theme.primaryColor, backgroundColor: `${theme.primaryColor}15`, color: theme.primaryColor }
                  : { borderColor: "#e5e7eb", backgroundColor: theme.cardBackground, color: "#6b7280" }
                }
              >
                <span className="flex items-center gap-2 flex-wrap justify-center">
                  <Utensils className="w-4 h-4" /> {t("dineIn")}{showServiceTimes && <> · {est} {t("minutes")}</>}
                  {paused && <span className="text-xs">({holClosed ? t("closedToday") : t("servicePausedBadge")})</span>}
                </span>
                {desc && <span className="text-xs font-normal opacity-70 leading-tight line-clamp-2 text-center">{desc}</span>}
              </button>
            );
          })()}
          {(restaurant as any).acceptsTakeOut && (() => {
            const until = (restaurant as any).takeOutPausedUntil;
            const holClosed = holidayClosedServices.includes("take_out");
            const paused = (!!until && new Date(until).getTime() > Date.now()) || holClosed;
            let est = restaurant.estimatedPickup;
            let desc = "";
            try { const ss = JSON.parse((restaurant as any).serviceSettings || "null"); const v = ss?.takeOut?.estimatedTime; if (typeof v === "number" && v > 0) est = v; desc = (ss?.takeOut?.description || "").trim(); } catch {}
            return (
              <button
                onClick={() => !paused && setOrderType("take_out")}
                disabled={paused}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-3 px-2 rounded-xl font-semibold border-2 transition text-sm ${paused ? "opacity-50 cursor-not-allowed" : ""}`}
                style={orderType === "take_out"
                  ? { borderColor: theme.primaryColor, backgroundColor: `${theme.primaryColor}15`, color: theme.primaryColor }
                  : { borderColor: "#e5e7eb", backgroundColor: theme.cardBackground, color: "#6b7280" }
                }
              >
                <span className="flex items-center gap-2 flex-wrap justify-center">
                  <Package className="w-4 h-4" /> {t("takeOut")}{showServiceTimes && <> · {est} {t("minutes")}</>}
                  {paused && <span className="text-xs">({holClosed ? t("closedToday") : t("servicePausedBadge")})</span>}
                </span>
                {desc && <span className="text-xs font-normal opacity-70 leading-tight line-clamp-2 text-center">{desc}</span>}
              </button>
            );
          })()}
        </div>

        {/* "Our delivery areas" panel was moved to the Restaurant Info page so
           the main ordering grid stays focused on the menu. The "Restaurant Info"
           pill (top right of this header) opens it. */}

        {/* ── Promotion banners (Fabrizio 2026-05-28) ─────────────────────
            Horizontal scrolling row of active promos at the top of the menu,
            modeled on GloriaFood. Customers see promos immediately instead
            of having to wait until checkout. Each card surfaces the promo
            headline + a "Get Promo" CTA that triggers the coupon code (if
            one is attached) and / or opens a details modal. Hour-of-day
            usability is enforced at order calculation, not visibility —
            a lunch promo still shows at 9 AM so customers can pre-order. */}
        {/* Promo "almost there" nudge — pinned to the BOTTOM (above the cart
            button) so it stays visible while the customer scrolls the menu,
            instead of scrolling away at the top. Per reseller feedback
            (GloriaFood parity). */}
        {promoNudge && (
          <div className={`fixed inset-x-0 z-30 px-4 pointer-events-none ${cartCount > 0 ? "bottom-24" : "bottom-6"}`}>
            <div className="mx-auto max-w-md rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50 px-4 py-3 text-center text-sm font-semibold text-emerald-800 shadow-lg pointer-events-auto">
              🎯 {t("promoUnlockNudge", {
                amount: formatCurrency(promoNudge.remaining, restaurant.currency ?? "usd"),
                name: promoNudge.name,
              })}
            </div>
          </div>
        )}
        {/* ── First-buy hero (Kickstarter) ─────────────────────────────────
            The Kickstarter "first order" promo gets prime, full-width real
            estate at the very TOP — GloriaFood-style "X% Off Your 1st Order"
            — instead of blending into the horizontal strip. Only present when
            the owner has switched on First Buy Promo in /admin/kickstarter
            (which is what creates this campaignRef promo + sets showOnBanner).
            Clicking opens the same detail modal as any other promo. Theme-
            colored per the /order/ styling rule. Luigi 2026-06-09. */}
        {(() => {
          // Source of truth for the ref string: KICKSTARTER_FIRST_BUY_REF in
          // src/lib/kickstarter.ts — kept as a literal here so we don't import
          // a server-only (prisma) module into this client component.
          const hero = promoBanners.find((p) => p.campaignRef === "kickstarter_first_buy");
          // Only entice customers we can't rule out as new: hide for a logged-in
          // returning customer (server-resolved), a guest who has ordered on this
          // device before, OR a guest whose checkout identity (typed, or silently
          // restored by the remember-me pre-fill) the cart preview has since
          // resolved to a RETURNING customer at this restaurant+channel
          // (firstBuyUnavailable). Without that last clause the hero and the
          // discount diverge: the banner shouts "first-time special" while the
          // cart correctly refuses to apply it because the remembered contact
          // already ordered here — exactly the "visible but not applying"
          // inconsistency Luigi caught, and a direct violation of his rule that
          // the banner must disappear for a non-first-time customer. Luigi
          // 2026-06-10.
          if (!hero || customerIsReturning || hasOrderedHere || firstBuyUnavailable) return null;
          const headline = hero.bannerHeadline?.trim() || hero.name;
          // The default background must never be flat black (theme.primaryColor
          // is black for some brands, incl. Luigi's). Use the owner's custom
          // image when set, else a deterministic appetising stock food image —
          // the same source the strip tiles use — so the special always looks
          // inviting. A left-heavy dark curtain keeps text legible over either.
          // Custom image / headline / min order / show-or-hide are all editable
          // per restaurant via the promo editor. Luigi 2026-06-09.
          const heroStock = (() => {
            let h = 0;
            for (let i = 0; i < hero.id.length; i++) h = (h * 31 + hero.id.charCodeAt(i)) | 0;
            return PROMO_STOCK_IMAGES[Math.abs(h) % PROMO_STOCK_IMAGES.length];
          })();
          const heroImg = hero.imageUrl?.trim() || heroStock;
          return (
            <div className="mb-4">
              <div
                role="button"
                tabIndex={0}
                onClick={() => openPromoBanner(hero)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openPromoBanner(hero);
                  }
                }}
                className="relative overflow-hidden rounded-xl text-white shadow-md cursor-pointer hover:scale-[1.01] transition focus:outline-none focus:ring-2 focus:ring-white/60"
                style={{
                  backgroundImage: `url("${heroImg}")`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  backgroundColor: theme.primaryColor,
                }}
              >
                {/* Warm dark curtain — heaviest on the left where the text sits,
                    fading right so the food photo still reads. */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background:
                      "linear-gradient(100deg, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.5) 52%, rgba(0,0,0,0.18) 100%)",
                  }}
                />
                <div className="relative px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-[10px] uppercase tracking-widest font-bold opacity-90 mb-0.5"
                      style={{ textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}
                    >
                      ⭐ {t("promoLabel")}
                    </div>
                    <div
                      className="text-base sm:text-lg font-black leading-tight line-clamp-1"
                      style={{ textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}
                    >
                      {headline}
                    </div>
                    <div className="flex items-center gap-2 mt-1 min-w-0">
                      {hero.description && (
                        <span
                          className="text-[11px] font-medium opacity-95 line-clamp-1 min-w-0"
                          style={{ textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}
                        >
                          {hero.description}
                        </span>
                      )}
                      {hero.couponCode && (
                        <span className="flex-shrink-0 text-[10px] font-mono font-bold bg-white/95 text-gray-900 rounded px-1.5 py-0.5">
                          {hero.couponCode}
                        </span>
                      )}
                    </div>
                  </div>
                  <span
                    className="flex-shrink-0 text-xs sm:text-sm font-bold px-3 py-1.5 rounded-lg shadow-md whitespace-nowrap bg-white"
                    style={{ color: theme.primaryColor, boxShadow: "0 2px 6px rgba(0,0,0,0.35)" }}
                  >
                    {t("promoGetItNow")}
                  </span>
                </div>
              </div>
            </div>
          );
        })()}
        {/* "Sign up to earn" banner — LOGGED-OUT customers only (gated server-side
            in page.tsx). Prompts account creation since guests can't earn/spend.
            Emerald to match the reward tiles. Luigi 2026-06-30. */}
        {rewardSignupBanner && (
          <a
            href={`/order/${restaurant.slug}/account/login`}
            className="flex items-center justify-between gap-3 mb-3 rounded-xl px-4 py-3 text-white shadow-md no-underline"
            style={{ background: "linear-gradient(135deg, #059669, #047857)" }}
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Gift className="w-5 h-5 flex-shrink-0" />
              {t("rewardSignupBannerText", { label: rewardSignupBanner.rewardName || t("rewardTileBadge") })}
            </span>
            <span className="flex-shrink-0 rounded-lg bg-white/20 px-3 py-1.5 text-xs font-bold whitespace-nowrap">
              {t("rewardSignupBannerCta")}
            </span>
          </a>
        )}
        {/* Pinned dishes — "pin to top" strip (Fabrizio cmr80joh0): the owner's
            highlighted dishes render as prominent tiles at the very top, above
            the promo strip. Sourced from the FILTERED menu, so visibility /
            service-restriction / sold-out states carry over automatically, and
            tapping opens the normal item modal (combo/pizza aware). */}
        {/* Pinned CATEGORIES (Fabrizio cmr80joh0): accent jump-chips that
            smooth-scroll to the category's section (reuses scrollToCategory,
            which also expands the mobile accordion). Own overflow container so
            it never causes body horizontal scroll. */}
        {(() => {
          const pinnedCats = visibleCategories.filter((c) => c.pinnedToTop);
          if (pinnedCats.length === 0) return null;
          return (
            <div className="mb-5 flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
              {pinnedCats.map((cat) => {
                const accent = cat.accentColor || theme.primaryColor;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => scrollToCategory(cat.id)}
                    className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-full border-2 font-semibold text-sm whitespace-nowrap transition active:scale-95"
                    style={{ borderColor: accent, color: accent, background: `${accent}12` }}
                  >
                    <Star className="w-4 h-4" style={{ fill: accent }} />
                    {cat.name}
                  </button>
                );
              })}
            </div>
          );
        })()}
        {(() => {
          const pinned = visibleCategories.flatMap((c) => c.menuItems).filter((i) => (i as any).pinnedToTop);
          if (pinned.length === 0) return null;
          return (
            <>
              <div className="flex items-center gap-2 mb-2">
                <Star className="w-5 h-5" style={{ color: theme.primaryColor, fill: theme.primaryColor }} />
                <span className="text-lg font-bold" style={{ color: theme.textColor }}>{t("featured")}</span>
              </div>
              <div className="mb-6 flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
                {pinned.map((item) => (
                  <div key={item.id} className="w-[230px] flex-shrink-0">
                    <CarouselCard item={item} theme={theme} onOpen={openItem} />
                  </div>
                ))}
              </div>
            </>
          );
        })()}
        {/* Collapsible "Promo" header — the customer can hide the specials strip so it
            doesn't take up the whole page (mobile + desktop). Same chevron affordance as
            the collapsible categories. Luigi 2026-06-22. */}
        {(promoBanners.filter((p) => p.showOnBanner && p.campaignRef !== "kickstarter_first_buy").length > 0 || rewardPromoTiles.length > 0) && (
          <button
            type="button"
            onClick={() => setPromosCollapsed((c) => !c)}
            aria-expanded={!promosCollapsed}
            className="flex items-center gap-2 mb-2 cursor-pointer select-none"
          >
            <span className="text-lg font-bold" style={{ color: theme.textColor }}>{t("promoLabel")}</span>
            <ChevronDown className={`w-5 h-5 flex-shrink-0 transition-transform ${promosCollapsed ? "" : "rotate-180"}`} style={{ color: theme.textColor }} />
          </button>
        )}
        {!promosCollapsed && (promoBanners.filter((p) => p.showOnBanner && p.campaignRef !== "kickstarter_first_buy").length > 0 || rewardPromoTiles.length > 0) && (
          <div className="mb-6 flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
            {promoBanners.filter((p) => p.showOnBanner && p.campaignRef !== "kickstarter_first_buy").map((promo) => {
              const headline = promo.bannerHeadline?.trim() || promo.name;
              const hasUsableWindow =
                typeof promo.usableHourStart === "number" &&
                typeof promo.usableHourEnd === "number";
              const usableWindowLabel = hasUsableWindow
                ? `${formatMinutes(promo.usableHourStart!, hoursFmt)}–${formatMinutes(promo.usableHourEnd!, hoursFmt)}`
                : null;
              const minOrderLabel =
                promo.minimumOrder > 0
                  ? `${fmt(promo.minimumOrder)} min`
                  : null;
              // Render the owner-set imageUrl as a background-image layer
              // with a dark gradient overlay for legibility. When no image
              // is set, fall through to a clean theme-color gradient —
              // no stock "default image" surprise (Luigi 2026-05-29: stock
              // SVG fallback wasn't loading reliably on mobile, and the
              // simpler colored card is what owners expect when they
              // skip the image picker).
              const ownerImageUrl = promo.imageUrl?.trim() || null;
              // Stock-image fallback (Luigi 2026-06-01 v2): when the
              // owner hasn't uploaded a custom image, pick a
              // food-promo background deterministically by promo.id
              // hash so each promo gets a consistent look and the
              // set looks varied across multiple promos on the same
              // page. Owner uploads always win — the admin promo
              // editor at /admin/promotions/[id]/edit lets owners
              // override.
              //
              // Shipped LOCALLY as SVGs under /public/promo-stock/
              // so they always render, even when the visitor is
              // behind a corporate firewall / ad-blocker / strict
              // CSP that would otherwise block external image CDNs
              // (the original Unsplash URLs were silently failing
              // for some visitors, leaving the tile pure-color from
              // the backgroundColor fallback — see Luigi's
              // 2026-06-01 black-tile screenshot).
              // Inline base64 data URIs (Luigi 2026-06-01 v3): we
              // bounced through three iterations of this — Unsplash
              // CDN, then local /promo-stock/*.svg URLs, then
              // proxy-fix + cache-bust query string — and the
              // tiles still showed black for visitors on custom
              // domains who had cached the previous 404. Inlining
              // the images as data: URIs eliminates the failure
              // mode entirely: there is no network request to be
              // proxied, cached, or 404'd. The bytes for each
              // image live in promo-stock-data.ts as part of the
              // JS bundle, ~9 KB gzipped total. The /public/
              // copies stay around as a mirror for SEO / crawler
              // use but are no longer in the customer hot path.
              const STOCK_PROMO_IMAGES = PROMO_STOCK_IMAGES;
              const stockFallback = (() => {
                let h = 0;
                for (let i = 0; i < promo.id.length; i++) h = (h * 31 + promo.id.charCodeAt(i)) | 0;
                return STOCK_PROMO_IMAGES[Math.abs(h) % STOCK_PROMO_IMAGES.length];
              })();
              const imageUrl = ownerImageUrl ?? stockFallback;
              const hasImage = !!imageUrl;
              return (
                <div
                  key={promo.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openPromoBanner(promo)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openPromoBanner(promo);
                    }
                  }}
                  // GloriaFood-style tile (Luigi 2026-06-01 v6):
                  // full-bleed image, dark gradient overlay across
                  // the bottom half so the title + description +
                  // CTA pill all sit on a legible surface without
                  // dimming the food photo. Size: w-[230px] h-32
                  // — ~20% smaller than v5 (was w-72 h-40) per
                  // Luigi's ask. Owner can still override the image
                  // at /admin/promotions/[id]/edit (Promotion
                  // settings).
                  className="flex-shrink-0 w-[230px] h-32 rounded-xl text-white shadow-md relative overflow-hidden cursor-pointer hover:scale-[1.02] transition focus:outline-none focus:ring-2 focus:ring-white/60"
                  style={
                    hasImage
                      ? {
                          backgroundImage: `url("${imageUrl}")`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                          backgroundRepeat: "no-repeat",
                          backgroundColor: theme.primaryColor,
                        }
                      : {
                          background: `linear-gradient(135deg, ${theme.primaryColor}, ${theme.primaryColor}dd)`,
                        }
                  }
                >
                  {/* Bottom-up dark gradient curtain — transparent
                      at the top, fading to ~85% black at the bottom.
                      Matches GloriaFood's promo tile look so the
                      photo dominates the top half and the text panel
                      gets a solid surface below. We keep the
                      no-image branch on a pure theme gradient (no
                      additional dim) so the color stays vivid. */}
                  {hasImage && (
                    <div
                      className="absolute inset-x-0 bottom-0 h-2/3 pointer-events-none"
                      style={{
                        background:
                          "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.55) 55%, rgba(0,0,0,0.88) 100%)",
                      }}
                    />
                  )}
                  {/* Tiny "PROMO" tag in the top-left, matching
                      GloriaFood's "Learn more" anchor placement.
                      Lower-cased + smaller so it doesn't compete
                      with the headline. */}
                  <div
                    className="absolute top-2.5 left-3 text-[10px] uppercase tracking-widest font-bold opacity-90"
                    style={{ textShadow: "0 1px 2px rgba(0,0,0,0.55)" }}
                  >
                    {t("promoLabel")}
                  </div>

                  {/* Bottom content block — title + description on
                      the LEFT, "Get it now" CTA pill on the RIGHT.
                      Sits inside the dark gradient band. Inner type
                      scaled down with v6 (smaller tile). */}
                  <div className="absolute inset-x-0 bottom-0 p-2.5 flex items-end gap-2">
                    <div
                      className="flex-1 min-w-0"
                      style={{ textShadow: "0 1px 3px rgba(0,0,0,0.55)" }}
                    >
                      <div className="text-base font-black leading-tight line-clamp-2">
                        {headline}
                      </div>
                      {promo.description && (
                        <div className="text-[10px] font-medium opacity-95 line-clamp-1 mt-0.5">
                          {promo.description}
                        </div>
                      )}
                    </div>
                    {/* CTA — uses the restaurant's primary color so
                        it brand-matches. Same fixed label as GloriaFood
                        ("Get it now") regardless of promo type — the
                        modal handles the type-specific UX. */}
                    <span
                      className="flex-shrink-0 text-[11px] font-bold px-2.5 py-1.5 rounded-md shadow-md whitespace-nowrap"
                      style={{
                        backgroundColor: theme.primaryColor,
                        boxShadow: "0 2px 6px rgba(0,0,0,0.35)",
                      }}
                    >
                      {t("promoGetItNow")}
                    </span>
                  </div>

                  {/* Constraint chips (window / min order / type /
                      coupon). Anchored to the TOP-RIGHT so they
                      don't crowd the bottom title band. Tiny
                      translucent pills, same content as before. */}
                  <div className="absolute top-2.5 right-3 flex flex-wrap justify-end gap-1 text-[10px] font-semibold max-w-[60%]">
                    {usableWindowLabel && (
                      <span className="bg-black/55 backdrop-blur rounded-full px-2 py-0.5">
                        ⏰ {usableWindowLabel}
                      </span>
                    )}
                    {minOrderLabel && (
                      <span className="bg-black/55 backdrop-blur rounded-full px-2 py-0.5">
                        {minOrderLabel}
                      </span>
                    )}
                      {/* Order-type chip on the promo banner.
                          Multi-select promos store orderType as a JSON
                          array (e.g. '["pickup","delivery"]'). The
                          legacy single-value form ("pickup"/"delivery"/
                          "both") still flows through too.

                          Three bugs the new logic fixes (Luigi 2026-05-31):
                          - A JSON array `["pickup","delivery"]` was
                            falling into the else branch and rendering
                            "Delivery only" even though both channels
                            were allowed.
                          - Restaurants that only accept Pickup were
                            seeing a "Delivery only" chip on every
                            non-"both" promo — confusing since
                            delivery isn't even an option for them.
                          - A "delivery"-only promo shown on a
                            pickup-only restaurant is unactionable;
                            we still surface it but the chip label
                            now matches what the restaurant offers. */}
                      {(() => {
                        const raw = promo.orderType ?? "both";
                        // Parse JSON array OR a plain comma-separated /
                        // single-value string into a Set of channels.
                        const channels = new Set<string>();
                        if (typeof raw === "string" && raw.startsWith("[")) {
                          try {
                            const arr = JSON.parse(raw);
                            if (Array.isArray(arr)) arr.forEach((v) => channels.add(String(v)));
                          } catch { /* fall through */ }
                        } else if (raw && raw !== "both") {
                          channels.add(raw);
                        }
                        // "both" / empty / parse failure → no badge.
                        if (channels.size === 0) return null;
                        // ALL relevant channels present → no badge.
                        // (Multi-select with everything = unrestricted.)
                        if (channels.has("pickup") && channels.has("delivery")) return null;
                        const onlyPickup = channels.has("pickup");
                        const onlyDelivery = channels.has("delivery");
                        if (!onlyPickup && !onlyDelivery) return null;
                        // If the restaurant doesn't offer the matching
                        // channel, don't pretend they do — hide the chip
                        // so we never claim "delivery only" on a pickup-
                        // only shop.
                        if (onlyDelivery && !restaurant.acceptsDelivery) return null;
                        if (onlyPickup && !restaurant.acceptsPickup) return null;
                        return (
                          <span
                            className="bg-black/55 backdrop-blur rounded-full px-2 py-0.5"
                            title={
                              onlyPickup
                                ? t("promoPickupOnlyTitle")
                                : t("promoDeliveryOnlyTitle")
                            }
                          >
                            {onlyPickup ? t("promoPickupOnlyBadge") : t("promoDeliveryOnlyBadge")}
                          </span>
                        );
                      })()}
                      {promo.couponCode && (
                        <span className="bg-white/95 text-gray-900 rounded-full px-2 py-0.5 font-mono">
                          {promo.couponCode}
                        </span>
                      )}
                  </div>
                </div>
              );
            })}
            {/* Reward Dollars earn-rule tiles — owner flagged these earn rules to
                advertise here ("Earn $5 on your first order"). Informational; no
                modal. Emerald gradient + Gift icon, sized like the promo cards. */}
            {rewardPromoTiles.map((rule) => {
              const amountStr = rule.earnPercent != null && rule.earnPercent > 0
                ? `${rule.earnPercent}%`
                : fmt(rule.earnAmount ?? 0);
              const headline = rule.label?.trim() || (
                rule.triggerType === "signup" ? t("rewardTileSignup", { amount: amountStr })
                : rule.triggerType === "first_order" ? t("rewardTileFirstOrder", { amount: amountStr })
                : rule.triggerType === "order_over" ? t("rewardTileOrderOver", { amount: amountStr, threshold: fmt(rule.orderThreshold ?? 0) })
                : rule.triggerType === "nth_order" ? t("rewardTileNth", { amount: amountStr, n: rule.nthInterval ?? 0 })
                : amountStr
              );
              const rewardName = (restaurant.rewardLabelPlural?.trim?.() as string | undefined) || t("rewardTileBadge");
              return (
                <div
                  key={rule.id}
                  className="flex-shrink-0 w-[230px] h-32 rounded-xl text-white shadow-md relative overflow-hidden"
                  style={{ background: "linear-gradient(135deg, #059669, #047857)" }}
                >
                  <div className="absolute top-2.5 left-3 text-[10px] uppercase tracking-widest font-bold opacity-90">
                    {rewardName}
                  </div>
                  <Gift className="absolute top-2 right-3 w-5 h-5 opacity-80" />
                  <div className="absolute inset-x-0 bottom-0 p-3">
                    <div className="text-base font-black leading-tight line-clamp-3" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.35)" }}>
                      {headline}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Menu search (Luigi 2026-05-31, CloudWaitress parity) ────
            Single text field that filters the visible menu items by
            name / description / category. Hides categories that have
            no matching items so the customer doesn't have to scroll
            past empty headers. Auto-clears when they hit ×. State
            lives below alongside the cart and is consumed where
            visibleCategories is computed.

            Gated 2026-06-02 on restaurant.showCustomerMenuSearch
            (admin toggle in /admin/service-fees). When the owner
            disables it the entire row is omitted; customers navigate
            via the category pills below. Default-true coalesce so
            restaurants that haven't touched the toggle keep the
            historical "always-on" behaviour. */}
        {(restaurant.showCustomerMenuSearch ?? true) && (
          <MenuSearchBar
            value={menuSearchQuery}
            onChange={setMenuSearchQuery}
            theme={theme}
          />
        )}

        {/* ── Category pills (sticky on scroll) ────────────────────────────
            Pins to the top as the customer scrolls down the menu so they
            can jump between categories without scrolling back up — the
            standard pattern from GloriaFood / DoorDash / Uber Eats.
            Uses a tinted backdrop with blur so menu items show through
            subtly behind the pills as they scroll past. */}
        <div className="relative sticky top-0 z-20 -mx-3 mb-6"
          style={{
            backgroundColor: `${theme.backgroundColor}f0`,
            borderBottom: `1px solid ${theme.cardBackground}`,
          }}
        >
          <div
            ref={pillRef}
            className="flex gap-2 overflow-x-auto pb-2 scroll-smooth px-3 py-2 backdrop-blur-md"
            style={{ scrollbarWidth: "none" }}
          >
            {visibleCategories.map(cat => (
              <button
                key={cat.id}
                onClick={() => scrollToCategory(cat.id)}
                // hover:brightness-90 darkens the pill ~10% on hover (mirrors the
                // banner's darken-on-hover). Uses a filter, not a bg class, so it
                // works over the inline theme colours below. Luigi 2026-07-01.
                className="px-4 py-2 rounded-full text-sm font-semibold transition hover:brightness-90 whitespace-nowrap flex-shrink-0 flex items-center gap-1.5 cursor-pointer"
                style={activeCategory === cat.id
                  ? { backgroundColor: theme.primaryColor, color: "#fff" }
                  : { backgroundColor: theme.cardBackground, border: "1px solid #e5e7eb", color: theme.textColor }
                }
              >
                {cat.imageUrl && theme.showCategoryImages && (
                  <img src={cat.imageUrl} alt="" className="w-4 h-4 rounded object-cover" />
                )}
                {cat.name}
              </button>
            ))}
          </div>
          {/* Desktop scroll arrows + edge fades. Hidden on mobile
              (touch is the natural scroll affordance there) and when
              the row doesn't actually overflow. */}
          {pillScrollState.left && (
            <>
              <div className="hidden sm:block pointer-events-none absolute inset-y-0 left-0 w-12"
                style={{ background: `linear-gradient(to right, ${theme.backgroundColor}f0, transparent)` }}
              />
              <button
                onClick={() => nudgePills(-1)}
                aria-label="Scroll categories left"
                className="hidden sm:flex absolute left-1 top-1/2 -translate-y-1/2 w-8 h-8 items-center justify-center rounded-full shadow-md transition hover:scale-110"
                style={{ backgroundColor: theme.cardBackground, color: theme.textColor }}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </>
          )}
          {pillScrollState.right && (
            <>
              <div className="hidden sm:block pointer-events-none absolute inset-y-0 right-0 w-12"
                style={{ background: `linear-gradient(to left, ${theme.backgroundColor}f0, transparent)` }}
              />
              <button
                onClick={() => nudgePills(1)}
                aria-label="Scroll categories right"
                className="hidden sm:flex absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 items-center justify-center rounded-full shadow-md transition hover:scale-110"
                style={{ backgroundColor: theme.cardBackground, color: theme.textColor }}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}
        </div>

        {/* Expand all / Collapse all — only in the mobile accordion. */}
        {collapsibleActive && visibleCategories.length > 0 && (
          <div className="flex items-center justify-end gap-4 mb-3 text-sm font-semibold">
            <button onClick={expandAllCats} style={{ color: theme.primaryColor }}>
              {t("expandAll")}
            </button>
            <span className="text-gray-300">|</span>
            <button onClick={collapseAllCats} style={{ color: theme.primaryColor }}>
              {t("collapseAll")}
            </button>
          </div>
        )}

        {/* ── Menu ─────────────────────────────────────────────────────── */}
        <div className="space-y-10">
          {visibleCategories.map(cat => (
            <CategorySection
              key={cat.id}
              cat={cat}
              theme={theme}
              collapsible={collapsibleActive}
              collapsed={collapsedCats.has(cat.id)}
              onToggleCollapse={() => toggleCatCollapsed(cat.id)}
              onRef={(el: HTMLElement | null) => { if (el) categoryRefs.current[cat.id] = el; }}
              onOpen={openItem}
            />
          ))}
        </div>

        {/* ── Social media links (footer) ─────────────────────────────
            Hidden in embedded widget mode — the widget is for ordering
            only. Social links / outbound calls-to-action belong on the
            hosted SEO website (paid upgrade), not the free widget. */}
        {!isEmbedded && (
          <SocialFooter socialLinks={(restaurant as any).socialLinks} primaryColor={theme.primaryColor} />
        )}

        {/* ── Platform credit (free marketing + SEO backlink) ──────────────
            Clickable "Powered by Fee Free Ordering" — shown for every
            restaurant EXCEPT de-branded reseller accounts (gated server-side
            via !isResellerDebranded). Lives inside the next-intl provider so
            the i18n component works. Luigi 2026-06-22. */}
        <PoweredByCredit credit={poweredByCredit} className="block text-center text-xs text-gray-400 py-6" />
      </div>

      {/* ── Floating cart ─────────────────────────────────────────────── */}
      {cartCount > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
          <button
            onClick={() => setCartOpen(true)}
            // White border + thin dark outer ring keep the floating button crisp
            // on ANY background: the white border separates it from dark banners/
            // photos it floats over, the ring delineates it on light areas. Luigi 2026-07-01.
            className="text-white font-bold px-6 py-4 rounded-2xl shadow-2xl border-2 border-white ring-1 ring-black/10 flex items-center gap-3 transition min-w-[240px]"
            style={{ backgroundColor: theme.primaryColor }}
          >
            <div className="bg-white rounded-full w-7 h-7 flex items-center justify-center text-sm font-bold flex-shrink-0" style={{ color: theme.primaryColor }}>
              {cartCount}
            </div>
            <span className="flex-1 text-left">{t("viewCart")}</span>
            <span>{fmt(subtotal)}</span>
          </button>
        </div>
      )}

      {/* ── Item modal ────────────────────────────────────────────────── */}
      {selectedItem && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => { setSelectedItem(null); if (editingCartIndex !== null) cancelEdit(); }}>
          <div className="bg-white rounded-2xl w-full max-w-lg modal-vh overflow-y-auto" onClick={e => e.stopPropagation()}>
            {selectedItem.imageUrl && (
              <div className="h-48 overflow-hidden rounded-t-2xl">
                <img src={selectedItem.imageUrl} alt={selectedItem.name} className="w-full h-full object-cover" />
              </div>
            )}
            <div className="p-5 border-b border-gray-100">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">{selectedItem.name}</h3>
                  {selectedItem.description && <p className="text-gray-500 text-sm mt-1">{selectedItem.description}</p>}
                  <div className="text-lg font-bold mt-2" style={{ color: theme.primaryColor }}>{fmt(currentItemPrice)}</div>
                </div>
                <button onClick={() => { setSelectedItem(null); if (editingCartIndex !== null) cancelEdit(); }} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg flex-shrink-0">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Variants */}
            {selectedItem.hasVariants && selectedItem.variants?.length > 0 && (
              <div className="p-5 border-b border-gray-100">
                <div className="flex items-center gap-2 mb-3">
                  <span className="font-semibold text-gray-900">{t("size")}</span>
                  <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">{t("required")}</span>
                </div>
                <div className="space-y-2">
                  {selectedItem.variants.map(v => (
                    <label
                      key={v.id}
                      className="flex items-center justify-between p-3 rounded-xl border-2 cursor-pointer transition"
                      style={selectedVariant?.id === v.id
                        ? { borderColor: theme.primaryColor, backgroundColor: `${theme.primaryColor}12` }
                        : { borderColor: "#f3f4f6" }
                      }
                    >
                      <div className="flex items-center gap-3">
                        <input type="radio" checked={selectedVariant?.id === v.id} onChange={() => setSelectedVariant(v)} style={{ accentColor: theme.primaryColor }} />
                        <span className="text-sm text-gray-800">{v.name}</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-700">{fmt(v.price)}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Modifier groups */}
            {selectedItem.modifierGroups.filter(g => !g.isHidden).map(group => {
              const selectedCount = (mods[group.id] || []).length;
              const atMax = group.maxSelect > 1 && selectedCount >= group.maxSelect;
              return (
                <div key={group.id} className="p-5 border-b border-gray-100">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900">{group.name}</span>
                      {group.required && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">{t("required")}</span>}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0 text-xs text-gray-400">
                      {group.minSelect > 0 && group.maxSelect > 1 && <span>{t("pickRange", { min: group.minSelect, max: group.maxSelect })}</span>}
                      {group.minSelect === 0 && group.maxSelect > 1 && <span>{t("upToMax", { max: group.maxSelect })}</span>}
                      {group.maxSelect > 1 && <span className={`font-medium ${atMax ? "text-emerald-600" : "text-gray-500"}`}>{selectedCount}/{group.maxSelect}</span>}
                    </div>
                  </div>
                  {group.description && <p className="text-xs text-gray-400 mb-2">{group.description}</p>}
                  <div className="space-y-2">
                    {(() => {
                      // Pick rendering mode once for the whole group:
                      //   - allowsQty (maxPerOption > 1) → stepper per option
                      //   - else → radio/checkbox per option (original)
                      const allowsQty = (group.maxPerOption ?? 1) > 1;
                      const perCap = Math.max(1, group.maxPerOption ?? 1);
                      return group.options.filter(o => o.isAvailable).map(opt => {
                        const currentArr = mods[group.id] || [];
                        const optCount = currentArr.filter(id => id === opt.id).length;
                        if (allowsQty) {
                          // Stepper mode — picking "+" adds another copy of
                          // this option to the mods array. The label row
                          // becomes interactive only via the +/- buttons so
                          // we don't toggle on label click.
                          const canInc = optCount < perCap && !atMax;
                          const canDec = optCount > 0;
                          const selected = optCount > 0;
                          return (
                            <div
                              key={opt.id}
                              className="flex items-center justify-between p-3 rounded-xl border-2 transition"
                              style={selected
                                ? { borderColor: theme.primaryColor, backgroundColor: `${theme.primaryColor}12` }
                                : { borderColor: "#f3f4f6" }
                              }
                            >
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <span className="text-sm text-gray-800 truncate">{opt.name}</span>
                                {opt.priceAdjustment !== 0 && (
                                  <span className="text-xs text-gray-500 flex-shrink-0">+{fmt(opt.priceAdjustment)} each</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                <button
                                  type="button"
                                  aria-label={`Remove one ${opt.name}`}
                                  onClick={() => setOptionQty(group, opt.id, optCount - 1)}
                                  disabled={!canDec}
                                  className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-700 hover:bg-gray-100 disabled:text-gray-300 disabled:cursor-not-allowed transition"
                                >
                                  <Minus className="w-3.5 h-3.5" />
                                </button>
                                <span
                                  className="w-6 text-center font-semibold tabular-nums text-sm"
                                  style={{ color: selected ? theme.primaryColor : "#9ca3af" }}
                                >
                                  {optCount}
                                </span>
                                <button
                                  type="button"
                                  aria-label={`Add one ${opt.name}`}
                                  onClick={() => setOptionQty(group, opt.id, optCount + 1)}
                                  disabled={!canInc}
                                  className="w-8 h-8 rounded-full border flex items-center justify-center text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition"
                                  style={{ backgroundColor: canInc ? theme.primaryColor : "#d1d5db", borderColor: canInc ? theme.primaryColor : "#d1d5db" }}
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        }
                        // Single-pick mode (original behaviour)
                        const selected = optCount > 0;
                        const disabled = !selected && atMax;
                        return (
                          <label
                            key={opt.id}
                            className={`flex items-center justify-between p-3 rounded-xl border-2 transition ${disabled ? "opacity-40 cursor-not-allowed border-gray-100" : "cursor-pointer"}`}
                            style={!disabled && selected
                              ? { borderColor: theme.primaryColor, backgroundColor: `${theme.primaryColor}12` }
                              : !disabled ? { borderColor: "#f3f4f6" } : {}
                            }
                          >
                            <div className="flex items-center gap-3">
                              <input type={group.maxSelect === 1 ? "radio" : "checkbox"} checked={selected}
                                disabled={disabled}
                                onChange={() => !disabled && toggleMod(group, opt.id)} style={{ accentColor: theme.primaryColor }} />
                              <span className="text-sm text-gray-800">{opt.name}</span>
                            </div>
                            {opt.priceAdjustment !== 0 && (
                              <span className="text-sm text-gray-500">+{fmt(opt.priceAdjustment)}</span>
                            )}
                          </label>
                        );
                      });
                    })()}
                  </div>
                </div>
              );
            })}

            {/* Notes */}
            <div className="p-5 border-b border-gray-100">
              <label className="block text-sm font-medium text-gray-700 mb-2">{t("specialInstructions")}</label>
              <textarea className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none resize-none"
                rows={2} placeholder={t("notesPlaceholder")} value={itemNotes} onChange={e => setItemNotes(e.target.value)} />
            </div>

            {/* Quantity stepper + Add to Cart */}
            <div className="p-5">
              <div className="flex items-center gap-3">
                {/* Stepper */}
                <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden shrink-0">
                  <button
                    type="button"
                    aria-label="Decrease quantity"
                    onClick={() => setItemQuantity(q => Math.max(1, q - 1))}
                    disabled={itemQuantity <= 1}
                    className="w-12 h-14 flex items-center justify-center text-gray-700 hover:bg-gray-100 disabled:text-gray-300 disabled:cursor-not-allowed transition"
                  >
                    <Minus className="w-5 h-5" />
                  </button>
                  <div className="w-12 text-center font-bold text-gray-900 select-none">{itemQuantity}</div>
                  <button
                    type="button"
                    aria-label="Increase quantity"
                    onClick={() => setItemQuantity(q => Math.min(99, q + 1))}
                    className="w-12 h-14 flex items-center justify-center text-gray-700 hover:bg-gray-100 transition"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
                {/* Add to Cart — price now multiplies by qty */}
                <button onClick={addToCart}
                  className="flex-1 text-white font-bold py-4 rounded-xl transition"
                  style={{ backgroundColor: theme.primaryColor }}>
                  {t("addToCart")} · {fmt(currentItemPrice * itemQuantity)}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Cart drawer ───────────────────────────────────────────────── */}
      {cartOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex justify-end" onClick={() => setCartOpen(false)}>
          <div className="bg-white w-full max-w-md h-full overflow-y-auto flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <h2 className="font-bold text-lg text-gray-900">{t("yourCart")}</h2>
              <div className="flex items-center gap-1">
                {cart.length > 0 && (
                  <button onClick={clearCart} className="text-xs font-medium text-gray-400 hover:text-red-500 inline-flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-red-50 transition">
                    <Trash2 className="w-3.5 h-3.5" /> {t("emptyCartAction")}
                  </button>
                )}
                <button onClick={() => setCartOpen(false)} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-400" /></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {cart.length === 0 ? (
                <div className="p-12 text-center text-gray-400">
                  <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-40" />
                  <p className="font-medium">{t("emptyCart")}</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {cart.map((ci, idx) => (
                    <div key={idx} className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div
                          className="flex-1 min-w-0"
                          // Bundles aren't editable from the cart (the
                          // composer would need to re-open with state
                          // restoration — TODO). Normal items still open
                          // the edit confirmation.
                          onClick={() => { if (!ci.isBundle) setPendingEditIndex(idx); }}
                          role={ci.isBundle ? undefined : "button"}
                          aria-label={ci.isBundle ? undefined : t("editItem")}
                          style={{ cursor: ci.isBundle ? "default" : "pointer" }}
                        >
                          <div className="font-semibold text-gray-900 text-sm">
                            {ci.isBundle && (
                              <span
                                className="inline-block text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded mr-1.5 align-middle"
                                style={{ backgroundColor: `${theme.primaryColor}22`, color: theme.primaryColor }}
                              >
                                {ci.isCombo ? tCombo("badge") : "Bundle"}
                              </span>
                            )}
                            {ci.bundlePromoName ?? ci.menuItem.name}
                          </div>
                          {ci.variant && <div className="text-xs mt-0.5 font-medium" style={{ color: theme.primaryColor }}>{ci.variant.name}</div>}
                          {/* Per-item "You saved" badge — same as checkout, so a
                              partially-discounted cart shows WHICH dishes the promo
                              hit right here (Fabrizio cmqv33v2o, 2026-07-03). */}
                          {drawerSavedForLine[idx] > 0 && (
                            <span className="inline-flex items-center gap-1 mt-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5">
                              <span aria-hidden>👍</span> {tCheckout("youSaved", { amount: fmt(drawerSavedForLine[idx]) })}
                            </span>
                          )}
                          {/* Time-restricted item → "Order ahead · <window>" note,
                              mirroring the menu badge so the customer is reminded
                              in the cart that this dish has order-time limits (R4). */}
                          {!ci.isBundle && hasFulfilWindow(ci.menuItem) && (
                            <div className="text-[11px] mt-0.5 font-medium text-amber-700">
                              {t("availableOnlyLabel", { window: itemFulfilWindow(ci.menuItem, hoursFmt) })}
                            </div>
                          )}
                          {/* Bundle child rows — indented under the parent. */}
                          {ci.isBundle && ci.bundleItems && ci.bundleItems.length > 0 && (
                            <div className="mt-1 pl-4 border-l-2 border-gray-100 space-y-0.5">
                              {ci.bundleItems.map((child, i) => (
                                <div key={i} className="text-xs text-gray-500">
                                  • {child.name}
                                  {child.variantName ? ` (${child.variantName})` : ""}
                                  {child.specialityFee && child.specialityFee > 0 ? (
                                    <span className="ml-1" style={{ color: theme.primaryColor }}>
                                      (+{fmt(child.specialityFee)})
                                    </span>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          )}
                          {/* Build details (toppings / modifier picks) — shared
                              with the checkout summary via cartItemModifierLabels
                              so both always match (Luigi 2026-07-06). */}
                          {cartItemModifierLabels(ci).map((label, i) => (
                            <div key={i} className="text-xs text-gray-400">+ {label}</div>
                          ))}
                          {ci.notes && <div className="text-xs text-gray-400 italic mt-0.5">&ldquo;{ci.notes}&rdquo;</div>}
                        </div>
                        <div className="text-sm font-bold text-gray-900 flex-shrink-0">{fmt(ci.lineTotal)}</div>
                      </div>
                      {/* Bundles are quantity-1 only — multiple bundles
                          should be built separately so the customer can
                          customise each. Hide the qty stepper to avoid
                          confusing "what does Bundle x2 mean?" UX. */}
                      {!ci.isBundle && (
                        <div className="flex items-center gap-3 mt-2">
                          <button onClick={() => updateQty(idx, -1)} className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-100 transition"><Minus className="w-3 h-3" /></button>
                          <span className="text-sm font-semibold w-4 text-center">{ci.quantity}</span>
                          <button onClick={() => updateQty(idx, 1)} className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-100 transition"><Plus className="w-3 h-3" /></button>
                        </div>
                      )}
                      {ci.isBundle && (
                        <button
                          onClick={() => {
                            setCart((prev) => prev.filter((_, i) => i !== idx));
                          }}
                          className="text-xs mt-2 text-red-600 hover:text-red-700 underline"
                        >
                          Remove bundle
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {cart.length > 0 && (
              <div className="flex-shrink-0 border-t border-gray-100">
                {/* Time-restriction heads-up — named, shown whenever the cart
                    holds a fulfilment-restricted item so the customer knows the
                    order time is constrained before they reach checkout (R4). */}
                {cartHasFulfil && (
                  <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-100 text-amber-800 text-[11px] leading-snug">
                    {tCheckout.rich("fulfilSchedulePromptNamed", {
                      items: fulfilItemNames.join(", "),
                      strong: (c) => <strong>{c}</strong>,
                    })}
                  </div>
                )}
                {/* Promo results — each applied deal can be removed (X) so the
                    customer can choose a different non-stackable deal. Luigi
                    2026-06-07. */}
                {promoResults.length > 0 && (
                  <div className="px-4 py-3 bg-green-50 border-b border-green-100 space-y-1">
                    {promoResults.map((r: any) => (
                      <div key={r.promoId} className="flex justify-between items-center gap-2 text-sm text-green-700 font-medium">
                        <span className="truncate">🎉 {r.name}</span>
                        <span className="flex items-center gap-2 flex-shrink-0">
                          <span>-{fmt(r.discount)}</span>
                          <button
                            type="button"
                            onClick={() => removePromo(r.promoId)}
                            className="text-green-600/60 hover:text-red-500 p-0.5 rounded transition"
                            aria-label={t("removePromoAria")}
                            title={t("removePromoAria")}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      </div>
                    ))}
                    {/* Hide the "Free delivery applied" badge when the
                        base delivery fee was already zero — nothing to
                        discount, so the badge would be confusing.
                        Audit polish #64. */}
                    {hasFreeDelivery && baseDeliveryFee > 0 && <div className="text-sm text-green-700 font-medium">🚚 {t("freeDeliveryApplied")}</div>}
                  </div>
                )}

                {/* Deals that qualified but can't combine with an applied
                    exclusive. One tap swaps to them (removes the blocker). */}
                {blockedPromos.length > 0 && (
                  <div className="px-4 py-3 bg-amber-50 border-b border-amber-100 space-y-2">
                    <div className="text-xs font-semibold text-amber-800">{t("dealsNotApplied")}</div>
                    {blockedPromos.map((b) => (
                      <div key={b.promoId} className="flex items-center justify-between gap-2 text-xs">
                        <span className="min-w-0">
                          <span className="block font-medium text-amber-900 truncate">{b.name}</span>
                          <span className="block text-amber-700">{t("cantCombineWith", { winner: b.winnerName })}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => useThisPromoInstead(b.promoId)}
                          className="flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-lg border border-amber-300 text-amber-800 hover:bg-amber-100 transition"
                        >
                          {t("useThisInstead")}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* First-buy dropped because the entered email/phone is a
                    returning customer. Shown ONLY when the hero banner was
                    visible to them (they looked new) — otherwise they never saw
                    the offer and need no explanation. Reuses the existing
                    "New customers only" string (no new locale key). Luigi
                    2026-06-09. */}
                {firstBuyUnavailable && !customerIsReturning && !hasOrderedHere && (() => {
                  const fb = promoBanners.find((p) => p.campaignRef === "kickstarter_first_buy");
                  if (!fb) return null;
                  const fbName = fb.bannerHeadline?.trim() || fb.name;
                  return (
                    <div className="px-4 py-2.5 bg-blue-50 border-b border-blue-100 text-xs text-blue-800 flex items-start gap-2">
                      <span className="flex-shrink-0">ℹ️</span>
                      <span>
                        <span className="font-semibold">{fbName}</span> — {tPromoDetail("conditionNewCustomers")}
                      </span>
                    </div>
                  );
                })()}

                {/* Coupon */}
                <div className="p-4 border-b border-gray-100">
                  {couponId ? (
                    <div className="flex items-center justify-between text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">
                      <span>{t("codeApplied", { code: couponCode })}</span>
                      <span className="font-bold">-{fmt(couponDiscount)}</span>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input type="text" className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                          placeholder={t("couponCode")} value={couponCode}
                          onChange={e => setCouponCode(e.target.value.toUpperCase())}
                          onKeyDown={e => e.key === "Enter" && applyCoupon()} />
                      </div>
                      <button onClick={() => applyCoupon()} disabled={couponLoading}
                        className="bg-gray-900 text-white font-semibold px-4 py-2 rounded-xl text-sm hover:bg-gray-800 transition disabled:opacity-50">
                        {couponLoading ? "..." : t("apply")}
                      </button>
                    </div>
                  )}
                  {/* Assigned-code → wrong-email note: the code is valid but
                      registered to a different email, so it can't apply. Shown
                      live in the cart instead of only erroring at Place Order
                      (audit confusing#13). */}
                  {!couponId && codeEmailMismatch && couponCode.trim() && (
                    <p className="mt-2 text-xs text-amber-600">{tT("promoEmailMismatch")}</p>
                  )}
                </div>

                {/* Totals */}
                <div className="px-4 py-3 space-y-1.5 text-sm border-b border-gray-100">
                  <div className="flex justify-between text-gray-600"><span>{t("subtotal")}</span><span>{fmt(subtotal)}</span></div>
                  {promoDiscount > 0 && <div className="flex justify-between text-green-600 font-medium"><span>{t("promoDiscount")}</span><span>-{fmt(promoDiscount)}</span></div>}
                  {couponDiscount > 0 && <div className="flex justify-between text-green-600 font-medium"><span>{t("couponDiscount")}</span><span>-{fmt(couponDiscount)}</span></div>}
                  {orderType === "delivery" && (
                    <div className="flex justify-between text-gray-600">
                      <span>
                        {t("deliveryFee")}
                        {resolvedZone && resolvedZone.inside && (
                          <span className="block text-xs text-gray-400">
                            {resolvedZone.zone.name} · ~{resolvedZone.zone.estimatedMinutes} min
                          </span>
                        )}
                      </span>
                      <span>{hasFreeDelivery ? <span className="line-through text-gray-400">{fmt(baseDeliveryFee)}</span> : fmt(deliveryFee)}</span>
                    </div>
                  )}
                  {appliedServiceFees.map(f => (
                    <div key={f.name} className="flex justify-between text-gray-600">
                      <span>{f.name}</span>
                      <span>{fmt(f.amount)}</span>
                    </div>
                  ))}
                  {/* Hide when taxRate is 0% — avoids a confusing
                      "Tax (0%) $0.00" sibling underneath any service
                      fee the owner may have named "Tax". */}
                  {taxAmount > 0 && (
                    <div className="flex justify-between text-gray-600"><span>{t("tax")} ({restaurant.taxRate}%)</span><span>{fmt(taxAmount)}</span></div>
                  )}
                  {/* Tip — the cart's running total folds in the default
                      suggested 15% tip until the customer overrides it in
                      checkout, which used to create a confusing gap
                      between (subtotal − promo + tax) and Total. Surface
                      the tip line whenever it's contributing so every
                      number in the breakdown reconciles. Luigi audit
                      2026-05-30: "totals don't make sense here." */}
                  {tipAmount > 0 && (
                    <div className="flex justify-between text-gray-600">
                      <span>
                        {t("tip")}
                        {tipPercent > 0 && (
                          <span className="text-xs text-gray-400 ml-1">
                            ({tipPercent}%)
                          </span>
                        )}
                      </span>
                      <span>{fmt(tipAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-gray-900 text-base pt-2 border-t border-gray-100 mt-1"><span>{t("total")}</span><span>{fmt(total)}</span></div>
                </div>

                {/* Out-of-area BLOCK — the address is outside every delivery
                    zone, so we don't take the order (reseller report: the
                    restaurant shouldn't have to reject it manually). */}
                {orderType === "delivery" && resolvedZone && !resolvedZone.inside && (
                  (restaurant as any).acceptOutsideZoneOrders ? (
                    // Restaurant accepts out-of-zone orders → soft heads-up; the
                    // order is allowed (placement isn't blocked). Luigi 2026-06-08.
                    <div className="mx-4 mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      <strong>{t("outOfAreaSoftTitle")}</strong> {t("outOfAreaSoftBody")}
                    </div>
                  ) : (
                    // Out-of-zone orders are NOT accepted → hard block message.
                    <div className="mx-4 mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
                      <strong>{t("outOfAreaBlockedTitle")}</strong> {t("outOfAreaBlockedBody")}
                    </div>
                  )
                )}

                {/* Minimum order warning + escape hatches.
                    Two ways out: change the delivery address (might
                    resolve to a zone with a lower min) or switch the
                    order to pickup (typically a much lower min). Both
                    open the Checkout modal at the right section. */}
                {orderType === "delivery" && minimumOrderForType > 0 && subtotal < minimumOrderForType && (
                  <div className="mx-4 mt-3 space-y-2">
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                      {t("addMoreToContinue", { min: fmt(minimumOrderForType), more: fmt(minimumOrderForType - subtotal) })}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          if (hasFulfilConflict) { setFulfilConflictOpen(true); return; }
                          if (hasReservationCartConflict) { setReservationCartOpen(true); return; }
                          setCartOpen(false);
                          setCheckoutOpen(true);
                          setEditingSection("ordering");
                        }}
                        className="flex-1 text-xs font-semibold py-2 px-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition text-gray-700"
                      >
                        Change delivery address
                      </button>
                      {restaurant.acceptsPickup && (
                        <button
                          onClick={() => {
                            setOrderType("pickup");
                          }}
                          className="flex-1 text-xs font-semibold py-2 px-3 rounded-lg border-2 transition"
                          style={{
                            borderColor: theme.primaryColor,
                            color: theme.primaryColor,
                            backgroundColor: `${theme.primaryColor}10`,
                          }}
                        >
                          Switch to pickup
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div className="p-4">
                  <button
                    onClick={() => { if (hasFulfilConflict) { setFulfilConflictOpen(true); return; } if (hasReservationCartConflict) { setReservationCartOpen(true); return; } setCartOpen(false); setCheckoutOpen(true); }}
                    disabled={orderType === "delivery" && minimumOrderForType > 0 && subtotal < minimumOrderForType}
                    className="w-full text-white font-bold py-4 rounded-xl transition text-base disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ backgroundColor: theme.primaryColor }}>
                    {t("proceedToCheckout")} → {fmt(total)}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── "Adjust this item?" confirm dialog ─────────────────────── */}
      {pendingEditIndex !== null && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setPendingEditIndex(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-gray-900">{t("adjustItem")}</h3>
            <p className="text-sm text-gray-500 mt-1">{t("adjustItemDesc")}</p>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setPendingEditIndex(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                {t("keepAsIs")}
              </button>
              <button
                onClick={() => beginEdit(pendingEditIndex!)}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold"
                style={{ backgroundColor: theme.primaryColor }}
              >
                {t("yesEdit")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Pizza builder modal ──────────────────────────────────────── */}
      {pizzaItem && activePizzaConfig && (
        <PizzaBuilder
          item={pizzaItem as any}
          config={activePizzaConfig}
          primaryColor={theme.primaryColor}
          onClose={() => {
            setPizzaItem(null);
            setActivePizzaConfig(null);
            if (editingCartIndex !== null) cancelEdit();
          }}
          onAdd={handlePizzaAdd}
          initial={
            editingCartIndex !== null && cart[editingCartIndex]?.pizzaCustomization
              ? {
                  variantId: cart[editingCartIndex].variant?.id ?? null,
                  customization: cart[editingCartIndex].pizzaCustomization!,
                  quantity: cart[editingCartIndex].quantity,
                  notes: cart[editingCartIndex].notes,
                }
              : undefined
          }
        />
      )}

      {/* ── Combo composer ────────────────────────────────────────────── */}
      {comboItem && (
        <ComboComposerModal
          comboItem={comboItem as any}
          /* Full items (variants, pizzaConfig, modifierGroups) — the composer
             opens the pizza builder per pizza slot and offers per-size picks. */
          allItems={visibleCategories.flatMap((c) => c.menuItems) as any}
          primaryColor={theme.primaryColor}
          fmt={fmt}
          onAddCombo={addComboToCart}
          onClose={() => setComboItem(null)}
        />
      )}

      {/* ── Checkout modal ────────────────────────────────────────────── */}
      {checkoutOpen && (
        <CheckoutModal
          theme={theme}
          orderType={orderType}
          onChangeOrderType={(next) => setOrderType(next)}
          acceptsPickup={!!restaurant.acceptsPickup}
          acceptsDelivery={!!restaurant.acceptsDelivery}
          acceptsDineIn={!!(restaurant as any).acceptsDineIn}
          acceptsTakeOut={!!(restaurant as any).acceptsTakeOut}
          restaurantSlug={restaurant.slug}
          isSignedIn={!!currentCustomer}
          savedAddresses={savedAddresses}
          fromMarketplace={fromMarketplace}
          // Enrich each line with its "+ …" build labels (pizza toppings /
          // modifier picks) so the checkout summary shows the SAME build as the
          // cart drawer — it used to omit them entirely (Luigi 2026-07-06).
          cart={cart.map((ci) => ({ ...ci, modifierLabels: cartItemModifierLabels(ci) }))}
          subtotal={subtotal}
          totalDiscount={totalDiscount}
          // Drives the "🎉 You unlocked …" celebration banner at the
          // top of the checkout. Each entry = one applied promo (name,
          // type, discount amount, optional couponCode).
          appliedPromos={promoResults}
          bumpedExclusives={blockedPromos.filter((b) => b.wasExclusive)}
          hasFreeDelivery={hasFreeDelivery}
          baseDeliveryFee={baseDeliveryFee}
          deliveryFee={deliveryFee}
          appliedServiceFees={appliedServiceFees}
          taxAmount={taxAmount}
          tipAmount={tipAmount}
          tipPercent={tipPercent}
          setTipPercent={setTipPercent}
          tipsEnabled={tipsEnabled}
          total={total}
          // Reward Dollars spend control (store credit). null → no balance / off.
          rewardInfo={rewardInfo}
          creditToApply={creditToApply}
          setCreditToApply={setCreditToApply}
          taxRate={restaurant.taxRate}
          customerInfo={customerInfo}
          setCustomerInfo={setCustomerInfo}
          onMarketingToggle={handleMarketingToggle}
          savedGuestInfo={hasSavedGuestInfo}
          onClearSavedInfo={clearSavedGuestInfo}
          editingSection={editingSection}
          setEditingSection={setEditingSection}
          orderLoading={orderLoading}
          placeOrder={placeOrder}
          cardPaymentEnabled={cardPaymentEnabled}
          acceptedMethods={acceptedMethods}
          paypalEnabled={paypalEnabled}
          prepaidDeliveryOnly={shipdayPrepaidDelivery && orderType === "delivery"}
          couponCode={couponCode}
          setCouponCode={setCouponCode}
          couponId={couponId}
          couponDiscount={couponDiscount}
          couponLoading={couponLoading}
          applyCoupon={applyCoupon}
          estimatedDeliveryMinutes={estimatedDeliveryMinutes}
          estimatedPickupMinutes={restaurant.estimatedPickup}
          hasZones={hasZones}
          geocoding={geocoding}
          geocodeError={geocodeError}
          resolvedZone={resolvedZone}
          acceptOutsideZoneOrders={!!(restaurant as any).acceptOutsideZoneOrders}
          mapProvider={restaurant.mapProvider ?? "leaflet"}
          googleMapsApiKey={restaurant.googleMapsApiKey ?? null}
          geocodeCountry={(restaurant as any).country ?? null}
          restaurantLat={restaurant.lat ?? null}
          restaurantLng={restaurant.lng ?? null}
          cateringMode={scheduleRequired}
          cateringMinScheduledLocal={effectiveMinScheduledLocal}
          toWallClock={toRestaurantWallClock}
          cateringNoticeHours={cateringNoticeHours}
          maxScheduledDate={maxScheduledDate}
          fulfilDays={cartFulfilConstraint.days}
          fulfilFrom={cartFulfilConstraint.from}
          fulfilTo={cartFulfilConstraint.to}
          fulfilSlotAllowed={cartFulfilItems.length > 0 ? cartFulfilSlotAllowed : undefined}
          fulfilItemsPresent={cartHasFulfil}
          fulfilItemNames={fulfilItemNames}
          schedulingEnabled={schedulingEnabled}
          scheduleReason={scheduleReason}
          serviceLabel={orderType === "delivery" ? t("delivery") : orderType === "pickup" ? t("pickup") : orderType === "dine_in" ? t("dineIn") : t("takeOut")}
          closedNextOpenLocal={closedMinScheduledLocal}
          schedulingInterval={perServiceSlotInterval}
          schedulingModes={perServiceSlotModes}
          openingHours={(restaurant as any).openingHours ?? []}
          todayServiceSpecialIntervals={serviceHasSpecialToday ? (todaySvcSpecial as any).intervals : null}
          todayServiceSpecialDateKey={serviceHasSpecialToday ? dateKeyInTimezone(new Date(), restaurantTz || "UTC") : null}
          restaurantTimezone={(restaurant as any).timezone}
          requireCustomerEmail={true}
          requireCustomerPhone={(restaurant as any).requireCustomerPhone !== false}
          hoursFormat={hoursFmt}
          deliveryFormConfig={deliveryFormConfig}
          reservationContext={reservationDraft ? { date: reservationDraft.date, time: reservationDraft.time, partySize: reservationDraft.partySize } : null}
          onClose={() => setCheckoutOpen(false)}
          onClearCart={() => { clearCart(); setCheckoutOpen(false); }}
        />
      )}

      {/* ── "Items can't be ordered together" conflict prompt ─────────
          Two fulfilment-restricted items whose windows don't overlap can't be
          made for one order; prompt the customer to remove one. Luigi 2026-06-14. */}
      {fulfilConflictOpen && fulfilConflictItems.length >= 2 && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setFulfilConflictOpen(false)}
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900">{t("fulfilConflictTitle")}</h3>
            <p className="text-sm text-gray-600 mt-1.5">{t("fulfilConflictBody")}</p>
            <div className="mt-4 space-y-2">
              {fulfilConflictItems.map((mi) => (
                <div key={mi.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-900 text-sm truncate">{mi.name}</div>
                    <div className="text-xs text-amber-700">{t("availableOnlyLabel", { window: itemFulfilWindow(mi, hoursFmt) })}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeConflictItem(mi.id)}
                    className="flex-shrink-0 text-xs font-semibold text-red-600 hover:text-red-700 border border-red-200 hover:bg-red-50 rounded-lg px-3 py-1.5 transition"
                  >
                    {t("fulfilConflictRemove")}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── "Not available for your reservation" prompt ───────────────
          A cart item that isn't offered on the booking day can't be made for
          the table (the order time is locked to the reservation). Prompt to
          remove it or rebook a day it's offered, instead of dead-ending at
          "Place order" (the server still rejects as a backstop). Luigi 2026-06-16. */}
      {reservationCartOpen && reservationCartConflictItems.length > 0 && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setReservationCartOpen(false)}
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900">{t("reservationCartConflictTitle")}</h3>
            <p className="text-sm text-gray-600 mt-1.5">{t("reservationCartConflictBody")}</p>
            <div className="mt-4 space-y-2">
              {reservationCartConflictItems.map((mi) => (
                <div key={mi.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-900 text-sm truncate">{mi.name}</div>
                    <div className="text-xs text-amber-700">{t("availableOnlyLabel", { window: itemFulfilWindow(mi, hoursFmt) })}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeConflictItem(mi.id)}
                    className="flex-shrink-0 text-xs font-semibold text-red-600 hover:text-red-700 border border-red-200 hover:bg-red-50 rounded-lg px-3 py-1.5 transition"
                  >
                    {t("fulfilConflictRemove")}
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => { setReservationCartOpen(false); setReservationOpen(true); }}
              className="mt-4 w-full text-sm font-semibold py-2.5 rounded-lg border-2 transition"
              style={{ borderColor: theme.primaryColor, color: theme.primaryColor }}
            >
              {t("reservationCartChangeDay")}
            </button>
          </div>
        </div>
      )}

      {/* ── Promo walkthrough modal ───────────────────────────────────
          Opens when the customer clicks a promo banner card above the
          menu. Dispatches to type-specific panels (info / eligible items
          / freebie picker / bundle composer). Per the auto-apply
          principle, this is a DISCOVERY UX only — the engine handles
          the actual discount whether or not the customer used the
          walkthrough. */}
      {!popupClosed && orderingPopup?.enabled && (
        <PromotionalPopup
          config={orderingPopup}
          onClose={dismissPopup}
          primaryColor={theme.primaryColor}
          closeLabel={t("close")}
          onOpenPromo={(promoId) => {
            const target = promoBanners.find((p: any) => p.id === promoId);
            if (target) setActivePromoModal(target as any);
          }}
          onApplyCoupon={(code) => {
            setCouponCode(code);
            applyCoupon(code);
          }}
        />
      )}
      {activePromoModal && (
        <PromoDetailModal
          promo={activePromoModal as any}
          allMenuItems={flatMenuItems}
          deliveryZones={(restaurant.deliveryZones ?? []).map((z: any) => ({ id: z.id, name: z.name }))}
          cartSubtotal={subtotal}
          primaryColor={theme.primaryColor}
          // Time-window gating: redeemable for the current order time? If not,
          // the modal shows "order for later" instead of the claim builder.
          usableNow={promoIsUsable(activePromoModal)}
          windowLabel={promoWindowLabelFor(activePromoModal)}
          onOrderForLater={
            schedulingEnabled
              ? () => {
                  const slot = nextUsableSlot(activePromoModal, restaurantTz);
                  if (!slot) return;
                  setCustomerInfo((ci) => ({ ...ci, scheduledFor: slot }));
                  // Friendly confirmation; the modal re-renders as usable (the
                  // scheduledFor now falls inside the window) so the customer
                  // can build the deal right away.
                  const m = /T(\d{2}):(\d{2})/.exec(slot);
                  const when = m ? formatMinutes(parseInt(m[1], 10) * 60 + parseInt(m[2], 10), hoursFmt) : "";
                  toast.success(tT("promoScheduledForLater", { time: when }) ?? `Order set for ${when}`);
                }
              : undefined
          }
          onAddFreebie={addFreebieToCart}
          onAddBundle={addBundleToCart}
          onCompleteGuidedPromo={addGuidedPromoToCart}
          onSwitchOrderType={(next) => {
            // Never strand the order on a channel the restaurant doesn't offer
            // (e.g. a free_delivery promo's "Switch to delivery" on a pickup-only
            // restaurant). Ignore the switch when that channel is disabled
            // (audit confusing#11).
            if (next === "delivery" && !restaurant.acceptsDelivery) return;
            if (next === "pickup" && !restaurant.acceptsPickup) return;
            setOrderType(next);
          }}
          // Whole-cart discount CTA ("Start adding items") → pre-apply the
          // promo's code so the customer doesn't retype it at checkout.
          onApplyCode={(code) => {
            setCouponCode(code);
            applyCoupon(code);
          }}
          // Click an eligible item in the promo modal → close the promo
          // modal + open the item-config sheet so the customer can pick
          // size/modifiers/quantity before adding to cart. Looks up the
          // full MenuItem from id (the modal only has the lite shape).
          onOpenItem={(menuItemId) => {
            const full = restaurant.menuCategories
              ?.flatMap((c: any) => c.menuItems)
              ?.find((m: any) => m?.id === menuItemId);
            if (full) {
              setActivePromoModal(null);
              setTimeout(() => openItem(full), 0);
            }
          }}
          // Group the promo's eligible items by their menu category (Fabrizio 2026-06-25).
          allVisibleCategories={visibleCategories.map((c) => ({ id: c.id, name: c.name }))}
          // Quick-add a SIMPLE eligible item (no options) straight to the cart, staying on the
          // promo screen so several can be added. Items with options use onOpenItem instead.
          // Increments the existing plain line instead of stacking duplicate lines, so the
          // −/qty/+ stepper on the promo screen has ONE line to drive (cmqtmfp2n, 2026-07-03).
          onAddItemDirect={(menuItemId) => {
            const full = restaurant.menuCategories
              ?.flatMap((c: any) => c.menuItems)
              ?.find((m: any) => m?.id === menuItemId);
            if (!full) return;
            setCart((prev) => {
              const idx = prev.findIndex((ci) => isPlainCartLine(ci) && ci.menuItem.id === menuItemId);
              if (idx >= 0) {
                const next = [...prev];
                const qty = next[idx].quantity + 1;
                next[idx] = { ...next[idx], quantity: qty, lineTotal: full.price * qty };
                return next;
              }
              return [...prev, { menuItem: full, variant: undefined, quantity: 1, selectedMods: {}, notes: "", lineTotal: full.price }];
            });
            toast.success(tT("itemAddedNamed", { name: full.name }));
          }}
          // The − side of the promo-screen qty stepper: drop ONE unit of the plain
          // (un-customized) line; the line disappears at zero.
          onRemoveItemDirect={(menuItemId) => {
            setCart((prev) => {
              const idx = prev.findIndex((ci) => isPlainCartLine(ci) && ci.menuItem.id === menuItemId);
              if (idx < 0) return prev;
              const next = [...prev];
              const qty = next[idx].quantity - 1;
              if (qty <= 0) { next.splice(idx, 1); return next; }
              next[idx] = { ...next[idx], quantity: qty, lineTotal: next[idx].menuItem.price * qty };
              return next;
            });
          }}
          cartQuantities={promoCartQuantities}
          // Escape hatches (Luigi 2026-07-03): the promo screens were dead
          // ends — give customers "See full menu" (close) and "Go to cart".
          cartItemCount={cart.reduce((s, ci) => s + ci.quantity, 0)}
          onGoToCart={() => {
            setActivePromoModal(null);
            setCartOpen(true);
          }}
          onClose={() => setActivePromoModal(null)}
        />
      )}

      {reservationOpen && restaurant.acceptsReservations && restaurant.reservationSettings && (
        <ReservationModal
          restaurantSlug={restaurant.slug}
          restaurantName={restaurant.name}
          settings={restaurant.reservationSettings}
          // Pass the restaurant's regular opening hours so the modal
          // can fall back to them when reservationHours isn't
          // explicitly configured. Without this fallback, every
          // customer hit "No reservations available on this day"
          // because the default reservationHours JSON is "{}". Luigi
          // 2026-05-31, multiple restaurants reported.
          fallbackOpeningHours={restaurant.openingHours ?? []}
          requireCustomerEmail={true}
          requireCustomerPhone={(restaurant as any).requireCustomerPhone !== false}
          hoursFormat={(restaurant as any).hoursFormat === "12h" ? "12h" : "24h"}
          timezone={(restaurant as any).timezone ?? undefined}
          currency={(restaurant as any).currency ?? "usd"}
          theme={theme}
          // Reserve-then-order: same page, so apply the draft directly (no
          // sessionStorage hop) and close the modal. Luigi 2026-06-08.
          allowPreOrder={!!(restaurant.reservationSettings as any)?.allowPreOrder}
          onContinueToOrder={(draft) => {
            applyReservationDraft(draft);
            setReservationOpen(false);
            if (searchParams.get("reservation")) router.replace(`/order/${restaurant.slug}`);
          }}
          onClose={() => {
            setReservationOpen(false);
            // Clean the ?reservation=1 from the URL so a refresh doesn't reopen.
            if (searchParams.get("reservation")) router.replace(`/order/${restaurant.slug}`);
          }}
        />
      )}
    </div>
    </CurrencyProvider>
  );
}

