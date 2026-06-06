"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { trackEvent } from "@/lib/visit-tracker";
import {
  ShoppingCart, MapPin, Phone, Clock, Plus, Minus, X,
  AlertCircle, Tag, Loader2, ChevronDown, Star, Info, Calendar,
  Truck, ShoppingBag, ChevronLeft, ChevronRight,
  UserCircle, LogIn, Search,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { CurrencyProvider, useCurrencyFormat } from "@/lib/currency-context";
import { formatTime as formatHHMM, formatMinutes, type HoursFormat } from "@/lib/format-time";
import { localDowAndHHMM, liveOpenStatus, nextOpenAt } from "@/lib/restaurant-hours";

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
import { ReservationModal } from "./ReservationModal";
import { PROMO_STOCK_IMAGES } from "./promo-stock-data";
import { PromoDetailModal } from "./PromoDetailModal";
import type { BundleCartItem } from "./BundleComposerModal";
import { ComboComposerModal, type ComboCartResult } from "./ComboComposerModal";
import { parseComboConfig } from "@/lib/combo";
import { evaluateApplicableFees, type ServiceFeeRow } from "@/lib/service-fees";
import { useTranslations } from "next-intl";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { SocialFooter } from "./SocialFooter";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ModOption { id: string; name: string; priceAdjustment: number; isDefault: boolean; isAvailable: boolean }
interface ModGroup  { id: string; name: string; description?: string; required: boolean; minSelect: number; maxSelect: number; maxPerOption?: number; isHidden?: boolean; libraryGroupId?: string | null; options: ModOption[] }
interface ItemVariant { id: string; name: string; price: number; isDefault: boolean; sortOrder: number }
interface MenuItem {
  id: string; name: string; description: string; price: number;
  imageUrl?: string; isFeatured: boolean; isSoldOut: boolean; isHidden: boolean;
  hasVariants: boolean; forPickup: boolean; forDelivery: boolean;
  availableDays?: number[]; availableFrom?: string; availableTo?: string;
  modifierGroups: ModGroup[]; variants: ItemVariant[];
  categoryId?: string;
  pizzaConfig?: string;
}
interface Category { id: string; name: string; imageUrl?: string; isHidden: boolean; modifierGroups: ModGroup[]; menuItems: MenuItem[] }
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

const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

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

// ─── Category Section (carousel or grid) ─────────────────────────────────────

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
        <div
          className={`flex items-center gap-3 mb-4 sticky top-0 py-2 z-10 ${collapsible ? "cursor-pointer select-none" : ""}`}
          style={{ backgroundColor: theme.backgroundColor }}
          onClick={collapsible ? onToggleCollapse : undefined}
        >
          {cat.imageUrl && theme.showCategoryImages && (
            <img src={cat.imageUrl} alt={cat.name} className="w-8 h-8 rounded-lg object-cover" />
          )}
          <h2 className="text-xl font-bold flex-1" style={{ color: theme.textColor }}>{cat.name}</h2>
          {collapsible && (
            <ChevronDown className={`w-5 h-5 flex-shrink-0 transition-transform ${collapsedNow ? "" : "rotate-180"}`} style={{ color: theme.textColor }} />
          )}
        </div>
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
        <div
          className={`flex items-center gap-3 mb-4 sticky top-0 py-2 z-10 ${collapsible ? "cursor-pointer select-none" : ""}`}
          style={{ backgroundColor: theme.backgroundColor }}
          onClick={collapsible ? onToggleCollapse : undefined}
        >
          {cat.imageUrl && theme.showCategoryImages && (
            <img src={cat.imageUrl} alt={cat.name} className="w-8 h-8 rounded-lg object-cover" />
          )}
          <h2 className="text-xl font-bold flex-1" style={{ color: theme.textColor }}>{cat.name}</h2>
          {collapsible && (
            <ChevronDown className={`w-5 h-5 flex-shrink-0 transition-transform ${collapsedNow ? "" : "rotate-180"}`} style={{ color: theme.textColor }} />
          )}
        </div>
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
      <div
        className={`flex items-center gap-3 mb-3 sticky top-0 py-2 z-10 ${collapsible ? "cursor-pointer select-none" : ""}`}
        style={{ backgroundColor: theme.backgroundColor }}
        onClick={collapsible ? onToggleCollapse : undefined}
      >
        {cat.imageUrl && theme.showCategoryImages && (
          <img src={cat.imageUrl} alt={cat.name} className="w-8 h-8 rounded-lg object-cover" />
        )}
        <h2 className="text-lg font-bold flex-1" style={{ color: theme.textColor }}>{cat.name}</h2>
        {collapsible ? (
          <ChevronDown className={`w-5 h-5 flex-shrink-0 transition-transform ${collapsedNow ? "" : "rotate-180"}`} style={{ color: theme.textColor }} />
        ) : (
          <div className="flex gap-1">
            <button onClick={() => scroll(-1)} className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-100 transition" style={{ backgroundColor: theme.cardBackground }} aria-label="Scroll left">
              <ChevronLeft className="w-4 h-4 text-gray-500" />
            </button>
            <button onClick={() => scroll(1)} className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-100 transition" style={{ backgroundColor: theme.cardBackground }} aria-label="Scroll right">
              <ChevronRight className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        )}
      </div>
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
  const basePrice = item.hasVariants && item.variants?.length
    ? Math.min(...item.variants.map(v => v.price))
    : item.price;
  return (
    <button
      id={`menu-item-${item.id}`}
      onClick={() => !isSold && onOpen(item)}
      disabled={isSold}
      className={`flex-shrink-0 text-left rounded-2xl overflow-hidden shadow-sm transition group ${isSold ? "opacity-60 cursor-not-allowed" : "hover:shadow-md"}`}
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
        <div className="flex items-center justify-between mt-2">
          <span className="text-sm font-bold" style={{ color: theme.primaryColor }}>
            {item.hasVariants ? `from ${fmt(basePrice)}` : fmt(basePrice)}
          </span>
          {!isSold && (
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
  const basePrice = item.hasVariants && item.variants?.length
    ? Math.min(...item.variants.map(v => v.price))
    : item.price;
  return (
    <button
      id={`menu-item-${item.id}`}
      onClick={() => !isSold && onOpen(item)}
      disabled={isSold}
      className={`text-left rounded-2xl border overflow-hidden shadow-sm transition group ${isSold ? "opacity-60 cursor-not-allowed border-gray-100" : "hover:shadow-lg"}`}
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
        </div>
      )}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {!item.imageUrl && (item.isFeatured || isSold) && (
              <div className="flex items-center gap-1.5 mb-1">
                {item.isFeatured && (
                  <span className="inline-flex items-center gap-1 bg-yellow-100 text-yellow-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    <Star className="w-2.5 h-2.5 fill-yellow-800" /> {t("featured")}
                  </span>
                )}
                {isSold && (
                  <span className="inline-block bg-gray-200 text-gray-700 text-[10px] font-bold px-2 py-0.5 rounded-full">{t("soldOut")}</span>
                )}
              </div>
            )}
            <p className="font-semibold leading-snug transition" style={{ color: theme.textColor }}>{item.name}</p>
            {item.description && <p className="text-sm text-gray-500 mt-1 line-clamp-2 leading-relaxed">{item.description}</p>}
          </div>
          <div className="flex-shrink-0 flex flex-col items-end gap-2">
            <div className="font-bold text-base" style={{ color: theme.textColor }}>
              {item.hasVariants ? `from ${fmt(basePrice)}` : fmt(basePrice)}
            </div>
            {!isSold && (
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
  const basePrice = item.hasVariants && item.variants?.length
    ? Math.min(...item.variants.map(v => v.price))
    : item.price;
  return (
    <button
      id={`menu-item-${item.id}`}
      onClick={() => !isSold && onOpen(item)}
      disabled={isSold}
      className={`w-full text-left rounded-2xl border overflow-hidden shadow-sm transition group flex items-stretch ${isSold ? "opacity-60 cursor-not-allowed border-gray-100" : "hover:shadow-lg"}`}
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
          {(item.isFeatured || (isSold && !item.imageUrl)) && (
            <div className="flex items-center gap-1.5 mb-1">
              {item.isFeatured && (
                <span className="inline-flex items-center gap-1 bg-yellow-100 text-yellow-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  <Star className="w-2.5 h-2.5 fill-yellow-800" /> {t("featured")}
                </span>
              )}
              {isSold && !item.imageUrl && (
                <span className="inline-block bg-gray-200 text-gray-700 text-[10px] font-bold px-2 py-0.5 rounded-full">{t("soldOut")}</span>
              )}
            </div>
          )}
          <p className="font-semibold leading-snug transition" style={{ color: theme.textColor }}>{item.name}</p>
          {item.description && <p className="text-sm text-gray-500 mt-1 line-clamp-2 leading-relaxed">{item.description}</p>}
          <div className="font-bold text-base mt-2" style={{ color: theme.textColor }}>
            {item.hasVariants ? `from ${fmt(basePrice)}` : fmt(basePrice)}
          </div>
        </div>
        {!isSold && (
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
  stripePublishableKey = null,
  themeSettings = null,
  locale = "en",
  isEmbedded = false,
  acceptedMethods = ["cash"],
  fromHostedSite = false,
  hostedSiteBackUrl,
  promoBanners = [],
  currentCustomer = null,
  todayHolidayName = null,
}: {
  restaurant: any;
  cardPaymentEnabled?: boolean;
  /** Name of today's one-off holiday closure (restaurant tz), or null. When
   *  set, the live open/closed status is forced to "closed today" so the
   *  customer sees the closed banner + must schedule for the next open day. */
  todayHolidayName?: string | null;
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
  }>;
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
  /** Payment method slugs the restaurant has selected in /admin/payments.
   *  Possible values: "cash", "card_in_person", "online_card", "paypal".
   *  The checkout picker renders ONLY these options — owners who haven't
   *  enabled Online Payments won't see a "Pay Online (Card)" button
   *  on their customer page. */
  acceptedMethods?: string[];
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
  const [cartOpen, setCartOpen] = useState(false);
  /** When non-null, the customer has tapped a promo banner card and the
   *  detail modal is showing. The promo object is the same shape we
   *  receive on the `promoBanners` prop (passed through verbatim). */
  const [activePromoModal, setActivePromoModal] = useState<typeof promoBanners[number] | null>(null);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [mods, setMods] = useState<Record<string, string[]>>({});
  const [selectedVariant, setSelectedVariant] = useState<ItemVariant | null>(null);
  const [itemNotes, setItemNotes] = useState("");
  /** Quantity stepper on the item modal — lets customers pick "I want 3"
   *  before clicking Add to Cart, instead of having to add then increment
   *  in the cart drawer. Resets to 1 when a new item opens; preserved
   *  when editing an existing cart line. */
  const [itemQuantity, setItemQuantity] = useState(1);
  const [orderType, setOrderType] = useState<"pickup" | "delivery">(restaurant.acceptsPickup ? "pickup" : "delivery");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [reservationOpen, setReservationOpen] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponId, setCouponId] = useState<string | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [promoResults, setPromoResults] = useState<any[]>([]);
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [hasFreeDelivery, setHasFreeDelivery] = useState(false);
  const [orderLoading, setOrderLoading] = useState(false);
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
    notes: "", paymentMethod: defaultPaymentMethod, scheduledFor: "",
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
        setCart(parsed.items);
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
  const todayHours = restaurant.openingHours?.find((h: any) => h.dayOfWeek === today);

  // Visible categories and items, merging category-level modifier groups into each item
  const visibleCategories: Category[] = (restaurant.menuCategories as Category[])
    .filter(c => !c.isHidden)
    .map(c => {
      const catGroups: ModGroup[] = (c.modifierGroups ?? []).filter((g: ModGroup) => !g.isHidden);
      return {
        ...c,
        menuItems: c.menuItems
          .filter(i =>
            !i.isHidden &&
            (orderType === "pickup" ? i.forPickup : i.forDelivery) &&
            isItemAvailableNow(i, restaurantTz)
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
            return {
              ...item,
              categoryId: c.id,
              modifierGroups: [...item.modifierGroups, ...uniqueCatGroups],
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

  // ── Mobile collapsible categories (GloriaFood-style accordion) ───────────
  // Opt-in per restaurant (theme.mobileCollapsibleCategories) and ONLY on
  // mobile. When active, every category starts collapsed; the customer expands
  // the ones they want, with Expand all / Collapse all controls.
  const isMobile = useIsMobile();
  // Accordion is suspended while a search is active so matching items are
  // always visible (a collapsed header would hide the very results they want).
  const collapsibleActive =
    !!(theme as any).mobileCollapsibleCategories && isMobile && !menuSearchQuery.trim();
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());
  // Seed "all collapsed" the first time the accordion becomes active (so it
  // doesn't fight the customer if they later expand things). When a search
  // filters the menu we leave their open/closed choices intact.
  const collapseSeededRef = useRef(false);
  useEffect(() => {
    if (collapsibleActive && !collapseSeededRef.current && visibleCategories.length) {
      collapseSeededRef.current = true;
      setCollapsedCats(new Set(visibleCategories.map((c) => c.id)));
    }
    if (!collapsibleActive) collapseSeededRef.current = false;
  }, [collapsibleActive, visibleCategories.length]);
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
    if (cart.length === 0) { setPromoDiscount(0); setPromoResults([]); setHasFreeDelivery(false); return; }
    const sub = cart.reduce((s, i) => s + i.lineTotal, 0);
    fetch("/api/public/apply-promos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurantSlug: restaurant.slug, orderType, subtotal: sub,
        // Skip bundle line items — their price is the owner's fixed bundle
        // price, and feeding the synthetic `bundle:<id>` menuItemId into
        // the public promo engine would either no-op (lookup fails) or
        // double-discount. Bundles are self-contained discounts.
        items: cart.filter(ci => !ci.isBundle).map(ci => ({
          menuItemId: ci.menuItem.id,
          categoryId: ci.menuItem.categoryId,
          price: ci.menuItem.price,
          quantity: ci.quantity,
          subtotal: ci.lineTotal,
        })),
        // Phase 2a restriction inputs — forward the resolved delivery
        // zone (so Delivery Area-restricted promos like "Free delivery
        // in Zone 1-7" trigger) and the member flag (so member-only
        // promos resolve). Both undefined when not applicable —
        // e.g. pickup orders skip deliveryZoneId.
        deliveryZoneId: orderType === "delivery" && resolvedZone?.inside ? resolvedZone.zone.id : undefined,
        isMember: !!currentCustomer,
        // Customer-typed coupon code — engine matches it against
        // Promotion.couponCode in the couponPromos branch. Required
        // for autoApply=false promos to fire. Empty string is fine
        // (engine ignores). Auto-apply promos don't need this.
        couponCode: couponCode.trim() || undefined,
      }),
    })
      .then(r => r.json())
      .then(data => {
        setPromoResults(data.applied ?? []);
        setPromoDiscount(data.totalDiscount ?? 0);
        setHasFreeDelivery(data.hasFreeDelivery ?? false);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, orderType, resolvedZone?.zone.id, resolvedZone?.inside, currentCustomer, couponCode]);

  const subtotal = cart.reduce((s, i) => s + i.lineTotal, 0);
  // "Add €X more to unlock!" nudge — the highlightThreshold feature was set in
  // the admin promo wizard but never surfaced to customers (reseller report).
  // Among auto-apply promos whose order-type matches, find the one the cart is
  // CLOSEST to unlocking (subtotal still below minimum, but within the promo's
  // highlightThreshold), and nudge the customer to spend the difference.
  const promoNudge = (() => {
    if (subtotal <= 0) return null;
    let best: { name: string; remaining: number } | null = null;
    for (const p of promoBanners) {
      const ht = p.highlightThreshold ?? 0;
      if (!p.autoApply || ht <= 0 || !(p.minimumOrder > 0)) continue;
      if (p.orderType && p.orderType !== "both" && p.orderType !== orderType) continue;
      const remaining = p.minimumOrder - subtotal;
      if (remaining > 0 && remaining <= ht && (!best || remaining < best.remaining)) {
        best = { name: p.name, remaining };
      }
    }
    return best;
  })();

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
  // Earliest schedulable slot — now + cateringNoticeHours, rounded UP
  // to the next 15-minute boundary so the datetime-local picker doesn't
  // land on an odd minute value the customer didn't choose. Output is
  // local "YYYY-MM-DDTHH:MM" (no Z) so the picker accepts it.
  const cateringMinScheduledLocal = (() => {
    const ms = Date.now() + cateringNoticeHours * 3600 * 1000;
    const d = new Date(ms);
    // Round up to next 15min
    const m = d.getMinutes();
    const add = (15 - (m % 15)) % 15;
    if (add > 0) d.setMinutes(m + add, 0, 0);
    else d.setSeconds(0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  })();

  // ── Closed-now detection (Luigi 2026-05-30) ─────────────────────────
  // When the restaurant is closed RIGHT NOW, we don't let customers
  // place ASAP orders — they have to schedule for the next opening
  // slot or later. (Catering items have a stricter min already; the
  // two rules combine — we use whichever pushes the picker further
  // into the future.)
  const liveStatusForClient = liveOpenStatus(
    (restaurant.openingHours ?? []) as any,
    new Date(),
    hoursFmt,
    todayHolidayName ? { name: todayHolidayName } : undefined,
    restaurantTz,
  );
  const restaurantIsClosedNow = liveStatusForClient.kind !== "open";
  const nextOpenDate = restaurantIsClosedNow
    ? nextOpenAt((restaurant.openingHours ?? []) as any, new Date(), restaurantTz)
    : null;
  // Convert nextOpenDate (a UTC Date that represents the local opening
  // moment) to a "YYYY-MM-DDTHH:MM" string in the restaurant's local
  // timezone so the datetime-local picker shows the right wall clock.
  const closedMinScheduledLocal = (() => {
    if (!nextOpenDate) return "";
    if (!restaurantTz) {
      const d = nextOpenDate;
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: restaurantTz,
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hour12: false,
      }).formatToParts(nextOpenDate);
      const y = parts.find(p => p.type === "year")?.value ?? "1970";
      const mo = parts.find(p => p.type === "month")?.value ?? "01";
      const d = parts.find(p => p.type === "day")?.value ?? "01";
      let h = parts.find(p => p.type === "hour")?.value ?? "00";
      if (h === "24") h = "00";
      const mn = parts.find(p => p.type === "minute")?.value ?? "00";
      return `${y}-${mo}-${d}T${h}:${mn}`;
    } catch {
      const pad = (n: number) => String(n).padStart(2, "0");
      const d = nextOpenDate;
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
  })();

  // Combined "schedule required" reasoning. If EITHER condition pushes
  // the customer into schedule mode, we honor the stricter of the two
  // min slots so both rules are satisfied.
  const scheduleRequired = cartHasCatering || restaurantIsClosedNow;
  const effectiveMinScheduledLocal = (() => {
    const candidates: string[] = [];
    if (cartHasCatering && cateringMinScheduledLocal) candidates.push(cateringMinScheduledLocal);
    if (restaurantIsClosedNow && closedMinScheduledLocal) candidates.push(closedMinScheduledLocal);
    if (candidates.length === 0) return "";
    // Pick the LATEST (string comparison works because both are zero-padded ISO-shaped).
    return candidates.sort()[candidates.length - 1];
  })();
  const scheduleReason: "catering" | "closed" | "both" | null =
    cartHasCatering && restaurantIsClosedNow ? "both"
    : cartHasCatering ? "catering"
    : restaurantIsClosedNow ? "closed"
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
    if (scheduleRequired && effectiveMinScheduledLocal) {
      if (!customerInfo.scheduledFor) {
        setCustomerInfo({ ...customerInfo, scheduledFor: effectiveMinScheduledLocal });
      } else {
        try {
          if (new Date(customerInfo.scheduledFor) < new Date(effectiveMinScheduledLocal)) {
            setCustomerInfo({ ...customerInfo, scheduledFor: effectiveMinScheduledLocal });
          }
        } catch { /* malformed — ignore */ }
      }
    }
    prevCateringRef.current = cartHasCatering;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleRequired, effectiveMinScheduledLocal]);
  const zoneFee = resolvedZone?.zone.deliveryFee;
  const zoneMin = resolvedZone?.zone.minimumOrder;
  const zoneMinutes = resolvedZone?.zone.estimatedMinutes;
  const baseDeliveryFee = orderType === "delivery"
    ? (zoneFee !== undefined ? zoneFee : restaurant.deliveryFee)
    : 0;
  const minimumOrderForType = orderType === "delivery"
    ? (zoneMin !== undefined ? zoneMin : restaurant.minimumOrder)
    : restaurant.minimumOrder;
  const estimatedDeliveryMinutes = orderType === "delivery"
    ? (zoneMinutes !== undefined ? zoneMinutes : restaurant.estimatedDelivery)
    : restaurant.estimatedDelivery;
  const deliveryFee = hasFreeDelivery ? 0 : baseDeliveryFee;
  // When tipping is disabled at the restaurant level, force zero
  // regardless of any leftover client state. Belt-and-suspenders to
  // the gated UI — if a customer kept the page open across a settings
  // change, we still don't surcharge them.
  const tipAmount = tipsEnabled ? Math.round((subtotal * (tipPercent / 100)) * 100) / 100 : 0;
  const totalDiscount = couponDiscount + promoDiscount;
  const feeOrderType: "pickup" | "delivery" = orderType === "delivery" ? "delivery" : "pickup";
  // Per-service scheduling slot interval: each service can override the
  // restaurant-wide default (Restaurant.scheduledOrderInterval) via its
  // serviceSettings entry — e.g. 30-min delivery slots, 15-min pickup. Falls
  // back to the global value, then 15. Reactive to orderType so the schedule
  // picker re-buckets when the customer flips pickup ⇄ delivery.
  const perServiceSlotInterval = (() => {
    try {
      const raw = (restaurant as any).serviceSettings;
      const ss = raw ? JSON.parse(raw) : null;
      const v = ss?.[feeOrderType]?.slotInterval;
      if (typeof v === "number" && v > 0) return v;
    } catch { /* malformed serviceSettings — fall back to the global default */ }
    return (restaurant as any).scheduledOrderInterval ?? 15;
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

  const applyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    try {
      const res = await fetch(`/api/public/coupon?code=${couponCode}&restaurantSlug=${restaurant.slug}&subtotal=${subtotal}`);
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
        toast.success(`Promo "${data.promoName}" applied!`);
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
    const fullDeliveryAddress = orderType === "delivery"
      ? [customerInfo.address, unitPart ? `Unit ${unitPart}` : null, buzzerPart ? `Buzz ${buzzerPart}` : null]
          .filter(Boolean)
          .join(", ")
      : customerInfo.address;
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
    deliveryCity: customerInfo.city, deliveryZip: customerInfo.zip,
    deliveryAddressData,
    // Precise map-pin coords (delivery only) — driver gets an exact spot.
    deliveryLat: orderType === "delivery" ? customerInfo.lat : null,
    deliveryLng: orderType === "delivery" ? customerInfo.lng : null,
    notes: combinedNotes, paymentMethod: customerInfo.paymentMethod,
    scheduledFor: customerInfo.scheduledFor || null,
    // Only honour the consent flag if we actually have an email to send
    // to AND the user kept the box checked. With the box pre-ticked by
    // default (Luigi 2026-06-02), an email-less guest would otherwise
    // get stamped as "opted in" with nothing to send.
    marketingConsent: customerInfo.marketingConsent === true && customerInfo.email.trim().length > 0,
    from: fromMarketplace ? "marketplace" : undefined,
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
    subtotal, taxAmount, deliveryFee, tip: tipAmount, total,
    items: cart.map(ci => ({
      menuItemId: ci.menuItem.id,
      variantId: ci.variant?.id ?? null,
      variantName: ci.variant?.name ?? null,
      name: ci.menuItem.name + (ci.variant ? ` (${ci.variant.name})` : ""),
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
    })),
    };
  };

  const placeOrder = async () => {
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
    if (!customerInfo.name || !customerInfo.phone) {
      setEditingSection("contact");
      focusField(!customerInfo.name ? "checkout-contact-name" : "checkout-contact-phone");
      toast.error(tT("nameAndPhone"));
      return;
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
    setOrderLoading(true);
    try {
      const orderRes = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildOrderPayload()),
      });
      const orderData = await orderRes.json();
      if (!orderRes.ok) throw new Error(orderData.error || tT("orderFailed"));

      // Order accepted by the API → clear the persisted cart so a return
      // visit doesn't show the same items they just ordered. The in-memory
      // `cart` state stays as-is (the next route owns the UI) — only the
      // localStorage copy is wiped. Also drop the cart-session token —
      // a fresh visit starts a fresh CartSession.
      try { localStorage.removeItem(CART_STORAGE_KEY); } catch {}
      try { localStorage.removeItem(CART_SESSION_KEY); } catch {}
      sessionTokenRef.current = null;

      if (customerInfo.paymentMethod === "card" && cardPaymentEnabled) {
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
            amount: total,
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
      } else if (customerInfo.paymentMethod === "paypal" && paypalEnabled) {
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
    })),
  );

  /** Add a freebie item (Promo Type 7) to the cart at $0. The engine
   *  re-validates eligibility on every cart change — if the customer
   *  drops below the trigger threshold the discount falls off, but the
   *  line item stays (charged at the freebie's normal price). */
  const addFreebieToCart = (
    item: { id: string; name: string; price: number; imageUrl?: string; categoryId?: string },
    promoName: string,
  ) => {
    const fullItem = visibleCategories
      .flatMap((c) => c.menuItems)
      .find((mi) => mi.id === item.id);
    if (!fullItem) {
      toast.error(tT("itemUnavailable") ?? "Item unavailable");
      return;
    }
    setCart((prev) => [
      ...prev,
      {
        menuItem: fullItem,
        variant: undefined,
        quantity: 1,
        selectedMods: {},
        notes: `Free with promo: ${promoName}`,
        lineTotal: 0,
        unitPrice: 0,
      },
    ]);
    toast.success(`Added ${fullItem.name} (free)`);
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

  const bannerH = bannerHeightPx(theme.bannerHeight);

  return (
    <CurrencyProvider currency={(restaurant as any)?.currency}>
    <div className="min-h-screen" style={{ backgroundColor: theme.backgroundColor, color: theme.textColor }}>
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
              <span className={`flex items-center gap-1.5 ${todayHours.isOpen ? "text-green-600" : "text-red-600"}`}>
                <Clock className="w-3.5 h-3.5" />
                {todayHours.isOpen
                  ? `${t("open")} · ${formatHHMM(todayHours.openTime, hoursFmt)} – ${formatHHMM(todayHours.closeTime, hoursFmt)}`
                  : t("closedToday")}
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
              <span className={`flex items-center gap-1.5 ${todayHours.isOpen ? "text-green-600" : "text-red-600"}`}>
                <Clock className="w-4 h-4" />
                {todayHours.isOpen
                  ? `${t("open")}: ${formatHHMM(todayHours.openTime, hoursFmt)} – ${formatHHMM(todayHours.closeTime, hoursFmt)}`
                  : t("closedToday")}
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
            <div className="w-full sm:w-auto sm:ml-auto flex flex-wrap items-center gap-1.5 sm:gap-2">
              <LanguageSwitcher currentLocale={locale} />
              {!fromMarketplace && (
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
                  className="flex items-center gap-1.5 sm:gap-2 text-sm sm:text-sm font-bold px-4 sm:px-4 py-2.5 sm:py-2.5 rounded-full text-white transition hover:opacity-90 shadow-md ring-1 ring-white/10"
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

      <div className="max-w-5xl mx-auto px-4 py-5">
        {/* ── Paused-service banner ──────────────────────────────────────
            Reads the per-service pausedUntil columns we added on
            Restaurant. When non-null AND in the future, that service
            is paused. Auto-clears the moment the timestamp passes
            (next render). Luigi 2026-06-01 GloriaFood-parity. */}
        {(() => {
          const r = restaurant as any;
          const nowMs = Date.now();
          const pausedNames: string[] = [];
          const earliestResume: { ms: number; label: string } | null = (() => {
            const entries = [
              ["Pickup", r.pickupPausedUntil],
              ["Delivery", r.deliveryPausedUntil],
              ["Dine-in", r.dineInPausedUntil],
              ["Catering", r.cateringPausedUntil],
              ["Take & Bake", r.takeOutPausedUntil],
              ["Reservations", r.reservationsPausedUntil],
            ] as const;
            let best: { ms: number; label: string } | null = null;
            for (const [name, val] of entries) {
              if (!val) continue;
              const ms = new Date(val).getTime();
              if (ms > nowMs) {
                pausedNames.push(name);
                if (!best || ms < best.ms) best = { ms, label: name };
              }
            }
            return best;
          })();
          if (pausedNames.length === 0) return null;
          return (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
              <div className="font-semibold text-amber-900 mb-0.5">
                ⏸ {pausedNames.join(", ")} {pausedNames.length === 1 ? "is" : "are"} temporarily paused
              </div>
              <div className="text-xs text-amber-800">
                The kitchen is briefly stopped from taking new {pausedNames.join(" / ").toLowerCase()} orders.
                {earliestResume && (
                  <> Estimated to resume around{" "}
                    {new Date(earliestResume.ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                    .
                  </>
                )}
              </div>
            </div>
          );
        })()}

        {/* ── Order type ───────────────────────────────────────────────── */}
        <div className="flex gap-3 mb-5">
          {restaurant.acceptsPickup && (() => {
            const until = (restaurant as any).pickupPausedUntil;
            const paused = !!until && new Date(until).getTime() > Date.now();
            return (
              <button
                onClick={() => !paused && setOrderType("pickup")}
                disabled={paused}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold border-2 transition text-sm ${paused ? "opacity-50 cursor-not-allowed" : ""}`}
                style={orderType === "pickup"
                  ? { borderColor: theme.primaryColor, backgroundColor: `${theme.primaryColor}15`, color: theme.primaryColor }
                  : { borderColor: "#e5e7eb", backgroundColor: theme.cardBackground, color: "#6b7280" }
                }
              >
                <ShoppingBag className="w-4 h-4" /> {t("pickup")} · {restaurant.estimatedPickup} {t("minutes")}
                {paused && <span className="text-xs">(paused)</span>}
              </button>
            );
          })()}
          {restaurant.acceptsDelivery && (() => {
            const until = (restaurant as any).deliveryPausedUntil;
            const paused = !!until && new Date(until).getTime() > Date.now();
            return (
              <button
                onClick={() => !paused && setOrderType("delivery")}
                disabled={paused}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold border-2 transition text-sm ${paused ? "opacity-50 cursor-not-allowed" : ""}`}
                style={orderType === "delivery"
                  ? { borderColor: theme.primaryColor, backgroundColor: `${theme.primaryColor}15`, color: theme.primaryColor }
                  : { borderColor: "#e5e7eb", backgroundColor: theme.cardBackground, color: "#6b7280" }
                }
              >
                <Truck className="w-4 h-4" /> {t("delivery")} · {estimatedDeliveryMinutes} {t("minutes")}
                {baseDeliveryFee > 0 && <span className="text-xs font-normal">(+{fmt(baseDeliveryFee)})</span>}
                {paused && <span className="text-xs">(paused)</span>}
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
        {promoNudge && (
          <div className="mb-4 rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50 px-4 py-3 text-center text-sm font-semibold text-emerald-800">
            🎯 {t("promoUnlockNudge", {
              amount: formatCurrency(promoNudge.remaining, restaurant.currency ?? "usd"),
              name: promoNudge.name,
            })}
          </div>
        )}
        {promoBanners.length > 0 && (
          <div className="mb-6 flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
            {promoBanners.map((promo) => {
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
                  onClick={() => setActivePromoModal(promo)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setActivePromoModal(promo);
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
                className="px-4 py-2 rounded-full text-sm font-semibold transition whitespace-nowrap flex-shrink-0 flex items-center gap-1.5"
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
      </div>

      {/* ── Floating cart ─────────────────────────────────────────────── */}
      {cartCount > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
          <button
            onClick={() => setCartOpen(true)}
            className="text-white font-bold px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 transition min-w-[240px]"
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
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
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
              <button onClick={() => setCartOpen(false)} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-400" /></button>
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
                          {/* Pizza customization details */}
                          {!ci.isBundle && (ci.pizzaCustomization
                            ? pizzaCustomizationToModifiers(ci.pizzaCustomization, ci.menuItem.modifierGroups as any)
                                .map((m, i) => (
                                  <div key={i} className="text-xs text-gray-400">+ {m.name}</div>
                                ))
                            : Object.entries(ci.selectedMods).map(([gId, optIds]) => {
                                const g = ci.menuItem.modifierGroups.find(g => g.id === gId);
                                return (optIds as string[]).map(optId => {
                                  const opt = g?.options.find(o => o.id === optId);
                                  return opt ? <div key={optId} className="text-xs text-gray-400">+ {opt.name}</div> : null;
                                });
                              }))
                          }
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
                {/* Promo results */}
                {promoResults.length > 0 && (
                  <div className="px-4 py-3 bg-green-50 border-b border-green-100">
                    {promoResults.map((r: any) => (
                      <div key={r.promoId} className="flex justify-between text-sm text-green-700 font-medium">
                        <span>🎉 {r.name}</span>
                        <span>-{fmt(r.discount)}</span>
                      </div>
                    ))}
                    {/* Hide the "Free delivery applied" badge when the
                        base delivery fee was already zero — nothing to
                        discount, so the badge would be confusing.
                        Audit polish #64. */}
                    {hasFreeDelivery && baseDeliveryFee > 0 && <div className="text-sm text-green-700 font-medium">🚚 {t("freeDeliveryApplied")}</div>}
                  </div>
                )}

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
                      <button onClick={applyCoupon} disabled={couponLoading}
                        className="bg-gray-900 text-white font-semibold px-4 py-2 rounded-xl text-sm hover:bg-gray-800 transition disabled:opacity-50">
                        {couponLoading ? "..." : t("apply")}
                      </button>
                    </div>
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
                  <div className="mx-4 mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
                    <strong>{t("outOfAreaBlockedTitle")}</strong> {t("outOfAreaBlockedBody")}
                  </div>
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
                    onClick={() => { setCartOpen(false); setCheckoutOpen(true); }}
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
          restaurantSlug={restaurant.slug}
          isSignedIn={!!currentCustomer}
          fromMarketplace={fromMarketplace}
          cart={cart}
          subtotal={subtotal}
          totalDiscount={totalDiscount}
          // Drives the "🎉 You unlocked …" celebration banner at the
          // top of the checkout. Each entry = one applied promo (name,
          // type, discount amount, optional couponCode).
          appliedPromos={promoResults}
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
          taxRate={restaurant.taxRate}
          customerInfo={customerInfo}
          setCustomerInfo={setCustomerInfo}
          onMarketingToggle={handleMarketingToggle}
          editingSection={editingSection}
          setEditingSection={setEditingSection}
          orderLoading={orderLoading}
          placeOrder={placeOrder}
          cardPaymentEnabled={cardPaymentEnabled}
          acceptedMethods={acceptedMethods}
          paypalEnabled={paypalEnabled}
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
          mapProvider={restaurant.mapProvider ?? "leaflet"}
          googleMapsApiKey={restaurant.googleMapsApiKey ?? null}
          cateringMode={scheduleRequired}
          cateringMinScheduledLocal={effectiveMinScheduledLocal}
          cateringNoticeHours={cateringNoticeHours}
          scheduleReason={scheduleReason}
          closedNextOpenLocal={closedMinScheduledLocal}
          schedulingInterval={perServiceSlotInterval}
          openingHours={(restaurant as any).openingHours ?? []}
          restaurantTimezone={(restaurant as any).timezone}
          requireCustomerEmail={(restaurant as any).requireCustomerEmail !== false}
          requireCustomerPhone={(restaurant as any).requireCustomerPhone !== false}
          hoursFormat={hoursFmt}
          deliveryFormConfig={deliveryFormConfig}
          onClose={() => setCheckoutOpen(false)}
        />
      )}

      {/* ── Promo walkthrough modal ───────────────────────────────────
          Opens when the customer clicks a promo banner card above the
          menu. Dispatches to type-specific panels (info / eligible items
          / freebie picker / bundle composer). Per the auto-apply
          principle, this is a DISCOVERY UX only — the engine handles
          the actual discount whether or not the customer used the
          walkthrough. */}
      {activePromoModal && (
        <PromoDetailModal
          promo={activePromoModal as any}
          allMenuItems={flatMenuItems}
          deliveryZones={(restaurant.deliveryZones ?? []).map((z: any) => ({ id: z.id, name: z.name }))}
          cartSubtotal={subtotal}
          primaryColor={theme.primaryColor}
          onAddFreebie={addFreebieToCart}
          onAddBundle={addBundleToCart}
          onSwitchOrderType={(next) => setOrderType(next)}
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
          requireCustomerEmail={(restaurant as any).requireCustomerEmail !== false}
          requireCustomerPhone={(restaurant as any).requireCustomerPhone !== false}
          hoursFormat={(restaurant as any).hoursFormat === "12h" ? "12h" : "24h"}
          timezone={(restaurant as any).timezone ?? undefined}
          theme={theme}
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

