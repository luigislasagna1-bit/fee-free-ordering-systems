"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { trackEvent } from "@/lib/visit-tracker";
import {
  ShoppingCart, MapPin, Phone, Clock, Plus, Minus, X,
  AlertCircle, Tag, Loader2, ChevronDown, Star, Info, Calendar,
  Truck, ShoppingBag, Image as ImageIcon, ChevronLeft, ChevronRight,
  UserCircle, LogIn,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { PROMO_DEFAULT_FALLBACK_URL } from "@/lib/promo-default-images";

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
import { CheckoutModal } from "./CheckoutModal";
import { ReservationModal } from "./ReservationModal";
import { PromoDetailModal } from "./PromoDetailModal";
import type { BundleCartItem } from "./BundleComposerModal";
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
  }>;
  /** Source promo id + name — preserved so the receipt + kitchen ticket
   *  can label the parent row with the bundle's promo name. */
  bundlePromoId?: string;
  bundlePromoName?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

function isItemAvailableNow(item: MenuItem): boolean {
  const now = new Date();
  if (item.availableDays) {
    const days: number[] = typeof item.availableDays === "string" ? JSON.parse(item.availableDays) : item.availableDays;
    if (!days.includes(now.getDay())) return false;
  }
  if (item.availableFrom && item.availableTo) {
    const [fh, fm] = item.availableFrom.split(":").map(Number);
    const [th, tm] = item.availableTo.split(":").map(Number);
    const mins = now.getHours() * 60 + now.getMinutes();
    if (mins < fh * 60 + fm || mins > th * 60 + tm) return false;
  }
  return true;
}

// ─── Category Section (carousel or grid) ─────────────────────────────────────

function CategorySection({ cat, theme, onRef, onOpen }: {
  cat: Category;
  theme: ReturnType<typeof parseTheme>;
  onRef: (el: HTMLElement | null) => void;
  onOpen: (item: MenuItem) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = useCallback((dir: -1 | 1) => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: dir * 320, behavior: "smooth" });
    }
  }, []);

  if (theme.menuLayout === "grid") {
    return (
      <div ref={onRef as any}>
        <div className="flex items-center gap-3 mb-4 sticky top-0 py-2 z-10" style={{ backgroundColor: theme.backgroundColor }}>
          {cat.imageUrl && theme.showCategoryImages && (
            <img src={cat.imageUrl} alt={cat.name} className="w-8 h-8 rounded-lg object-cover" />
          )}
          <h2 className="text-xl font-bold" style={{ color: theme.textColor }}>{cat.name}</h2>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          {cat.menuItems.map(item => (
            <GridCard key={item.id} item={item} theme={theme} onOpen={onOpen} />
          ))}
        </div>
      </div>
    );
  }

  // Carousel layout
  return (
    <div ref={onRef as any}>
      <div className="flex items-center gap-3 mb-3 sticky top-0 py-2 z-10" style={{ backgroundColor: theme.backgroundColor }}>
        {cat.imageUrl && theme.showCategoryImages && (
          <img src={cat.imageUrl} alt={cat.name} className="w-8 h-8 rounded-lg object-cover" />
        )}
        <h2 className="text-lg font-bold flex-1" style={{ color: theme.textColor }}>{cat.name}</h2>
        <div className="hidden md:flex gap-1">
          <button onClick={() => scroll(-1)} className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-100 transition" style={{ backgroundColor: theme.cardBackground }}>
            <ChevronLeft className="w-4 h-4 text-gray-500" />
          </button>
          <button onClick={() => scroll(1)} className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-100 transition" style={{ backgroundColor: theme.cardBackground }}>
            <ChevronRight className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto pb-2"
        style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
      >
        {cat.menuItems.map(item => (
          <CarouselCard key={item.id} item={item} theme={theme} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

function CarouselCard({ item, theme, onOpen }: { item: MenuItem; theme: ReturnType<typeof parseTheme>; onOpen: (i: MenuItem) => void }) {
  const t = useTranslations("ordering");
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
      <div className="relative overflow-hidden" style={{ height: 110 }}>
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${theme.primaryColor}22, ${theme.backgroundColor})` }}>
            <ImageIcon className="w-8 h-8 text-gray-300" />
          </div>
        )}
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
      <div className="p-2.5">
        <p className="text-sm font-semibold leading-snug line-clamp-2" style={{ color: theme.textColor }}>{item.name}</p>
        <div className="flex items-center justify-between mt-2">
          <span className="text-sm font-bold" style={{ color: theme.primaryColor }}>
            {item.hasVariants ? `from ${formatCurrency(basePrice)}` : formatCurrency(basePrice)}
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

function GridCard({ item, theme, onOpen }: { item: MenuItem; theme: ReturnType<typeof parseTheme>; onOpen: (i: MenuItem) => void }) {
  const t = useTranslations("ordering");
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
      <div className="relative overflow-hidden" style={{ aspectRatio: "16/9" }}>
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${theme.primaryColor}15, #f3f4f6)` }}>
            <ImageIcon className="w-10 h-10 text-gray-200" />
          </div>
        )}
        {item.isFeatured && (
          <div className="absolute top-2 left-2 bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
            <Star className="w-3 h-3 fill-yellow-900" /> Featured
          </div>
        )}
        {isSold && (
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
            <span className="bg-white text-gray-800 text-xs font-bold px-3 py-1.5 rounded-full">{t("soldOut")}</span>
          </div>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-semibold leading-snug transition" style={{ color: theme.textColor }}>{item.name}</p>
            {item.description && <p className="text-sm text-gray-500 mt-1 line-clamp-2 leading-relaxed">{item.description}</p>}
          </div>
          <div className="flex-shrink-0 flex flex-col items-end gap-2">
            <div className="font-bold text-base" style={{ color: theme.textColor }}>
              {item.hasVariants ? `from ${formatCurrency(basePrice)}` : formatCurrency(basePrice)}
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
  promoBanners = [],
  currentCustomer = null,
}: {
  restaurant: any;
  cardPaymentEnabled?: boolean;
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
  }>;
  /** The logged-in per-restaurant customer at this restaurant, if any.
   *  Server-resolved via getCurrentRestaurantCustomer in page.tsx and
   *  passed in so the header can render the right Sign-in vs. Hi-name
   *  state without a client-side fetch flash. Null = guest visitor. */
  currentCustomer?: { id: string; name: string; email: string | null; phone: string | null } | null;
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
}) {
  const t = useTranslations("ordering");
  const tT = useTranslations("ordering.toasts");
  const theme = parseTheme(themeSettings);
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
  // Pizza builder state
  const [pizzaItem, setPizzaItem] = useState<MenuItem | null>(null);
  const [activePizzaConfig, setActivePizzaConfig] = useState<PizzaConfig | null>(null);
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
    notes: "", paymentMethod: defaultPaymentMethod, scheduledFor: "",
  });
  const [editingSection, setEditingSection] = useState<null | "contact" | "ordering" | "time" | "payment" | "tips" | "notes">(null);
  const [tipPercent, setTipPercent] = useState<number>(0); // 0/10/15/20 or custom amount

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

  const today = new Date().getDay();
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
            isItemAvailableNow(i)
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
    .filter(c => c.menuItems.length > 0);

  // Set first visible category active
  useEffect(() => {
    if (visibleCategories.length && !activeCategory) setActiveCategory(visibleCategories[0].id);
  }, [visibleCategories.length]);

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
  const tipAmount = Math.round((subtotal * (tipPercent / 100)) * 100) / 100;
  const totalDiscount = couponDiscount + promoDiscount;
  const feeOrderType: "pickup" | "delivery" = orderType === "delivery" ? "delivery" : "pickup";
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
        toast.success(tT("couponAppliedAmount", { amount: formatCurrency(data.discount) }));
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
    notes: combinedNotes, paymentMethod: customerInfo.paymentMethod,
    scheduledFor: customerInfo.scheduledFor || null,
    from: fromMarketplace ? "marketplace" : undefined,
    // Reports attribution — server-side join from this hash back to
    // the WebsiteVisit row written when the session started. Server
    // validates format + ignores unknown sessions; safe to include
    // unconditionally. Read directly from sessionStorage (the visit
    // beacon already populated it) to avoid plumbing through props.
    sessionHash: typeof window !== "undefined"
      ? (window.sessionStorage.getItem("ff_session_hash") || undefined)
      : undefined,
    couponId, couponDiscount, subtotal, taxAmount, deliveryFee, tip: tipAmount, total,
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
    if (!customerInfo.name || !customerInfo.phone) { toast.error(tT("nameAndPhone")); return; }
    // Email is required — customers need it for order confirmation, receipts,
    // refund handling, and disputes. We also use it as the unique key in our
    // customer DB so we can detect returning vs new customers.
    if (!customerInfo.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerInfo.email)) {
      toast.error(tT("emailRequired"));
      return;
    }
    if (orderType === "delivery" && !customerInfo.address) { toast.error(tT("addressRequired")); return; }
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
            currency: "USD",
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
    <div className="min-h-screen" style={{ backgroundColor: theme.backgroundColor, color: theme.textColor }}>
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
            href={`/site/${restaurant.slug}`}
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
                {todayHours.isOpen ? `${t("open")} · ${todayHours.openTime} – ${todayHours.closeTime}` : t("closedToday")}
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
                {todayHours.isOpen ? `${t("open")}: ${todayHours.openTime} – ${todayHours.closeTime}` : t("closedToday")}
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <LanguageSwitcher currentLocale={locale} />
              {/* Per-restaurant customer account link. Logged-in: "Hi, <first
                  name>" → dashboard. Logged-out: "Sign in" → login page,
                  signup is a link from there. We render this whenever the
                  page isn't in marketplace mode (marketplace orders use the
                  cross-restaurant CustomerAccount flow at /account, not
                  the per-restaurant one). */}
              {!fromMarketplace && (
                currentCustomer ? (
                  <a
                    href={`/order/${restaurant.slug}/account`}
                    className="flex items-center gap-1.5 text-sm font-semibold px-3.5 py-2 rounded-full border-2 transition hover:bg-gray-50"
                    style={{ borderColor: theme.primaryColor, color: theme.primaryColor }}
                    title="View your account, coupons, and order history"
                  >
                    <UserCircle className="w-4 h-4" />
                    Hi, {currentCustomer.name.split(/\s+/)[0]}
                  </a>
                ) : (
                  <a
                    href={`/order/${restaurant.slug}/account/login`}
                    className="flex items-center gap-1.5 text-sm font-semibold px-3.5 py-2 rounded-full border-2 transition hover:bg-gray-50"
                    style={{ borderColor: theme.primaryColor, color: theme.primaryColor }}
                    title="Sign in or create an account to track coupons and order history"
                  >
                    <LogIn className="w-4 h-4" />
                    Sign in
                  </a>
                )
              )}
              {restaurant.acceptsReservations && (
                <button
                  onClick={() => setReservationOpen(true)}
                  className="flex items-center gap-1.5 text-sm font-semibold px-3.5 py-2 rounded-full text-white transition hover:opacity-90"
                  style={{ backgroundColor: theme.primaryColor }}
                >
                  <Calendar className="w-4 h-4" /> {t("tableReservation")}
                </button>
              )}
              <a
                href={infoLink}
                className="flex items-center gap-1.5 text-sm font-semibold px-3.5 py-2 rounded-full border-2 transition hover:bg-gray-50"
                style={{ borderColor: theme.primaryColor, color: theme.primaryColor }}
              >
                <Info className="w-4 h-4" /> {t("restaurantInfo")}
              </a>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 py-5">
        {/* ── Order type ───────────────────────────────────────────────── */}
        <div className="flex gap-3 mb-5">
          {restaurant.acceptsPickup && (
            <button
              onClick={() => setOrderType("pickup")}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold border-2 transition text-sm"
              style={orderType === "pickup"
                ? { borderColor: theme.primaryColor, backgroundColor: `${theme.primaryColor}15`, color: theme.primaryColor }
                : { borderColor: "#e5e7eb", backgroundColor: theme.cardBackground, color: "#6b7280" }
              }
            >
              <ShoppingBag className="w-4 h-4" /> {t("pickup")} · {restaurant.estimatedPickup} {t("minutes")}
            </button>
          )}
          {restaurant.acceptsDelivery && (
            <button
              onClick={() => setOrderType("delivery")}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold border-2 transition text-sm"
              style={orderType === "delivery"
                ? { borderColor: theme.primaryColor, backgroundColor: `${theme.primaryColor}15`, color: theme.primaryColor }
                : { borderColor: "#e5e7eb", backgroundColor: theme.cardBackground, color: "#6b7280" }
              }
            >
              <Truck className="w-4 h-4" /> {t("delivery")} · {estimatedDeliveryMinutes} {t("minutes")}
              {baseDeliveryFee > 0 && <span className="text-xs font-normal">(+{formatCurrency(baseDeliveryFee)})</span>}
            </button>
          )}
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
        {promoBanners.length > 0 && (
          <div className="mb-6 flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
            {promoBanners.map((promo) => {
              const headline = promo.bannerHeadline?.trim() || promo.name;
              const hasUsableWindow =
                typeof promo.usableHourStart === "number" &&
                typeof promo.usableHourEnd === "number";
              const usableWindowLabel = hasUsableWindow
                ? `${minutesToHHMM(promo.usableHourStart!)}–${minutesToHHMM(promo.usableHourEnd!)}`
                : null;
              const minOrderLabel =
                promo.minimumOrder > 0
                  ? `${formatCurrency(promo.minimumOrder)} min`
                  : null;
              // Owner-set imageUrl → render as the card background with a
              // dark gradient overlay so text stays readable. Falls back
              // to the first PROMO_DEFAULT_IMAGES entry when no image is
              // set, so every promo always has a real visual instead of
              // the plain black box.
              const resolvedImageUrl =
                (promo.imageUrl?.trim() || PROMO_DEFAULT_FALLBACK_URL);
              const hasImage = !!resolvedImageUrl;
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
                  className="flex-shrink-0 w-72 h-36 rounded-xl text-white shadow-sm relative overflow-hidden cursor-pointer hover:scale-[1.02] transition focus:outline-none focus:ring-2 focus:ring-white/60"
                >
                  {/* Background image (always set — owner-provided or the
                      stock fallback) absolutely positioned behind the
                      dark overlay so it covers the full card. */}
                  {hasImage && (
                    <img
                      src={resolvedImageUrl}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                      loading="lazy"
                    />
                  )}
                  {/* Solid colored background when no image, OR a dark
                      gradient overlay when there IS an image — keeps the
                      headline / badges legible against any photo. */}
                  <div
                    className="absolute inset-0"
                    style={
                      hasImage
                        ? {
                            background:
                              "linear-gradient(135deg, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.45) 60%, rgba(0,0,0,0.55) 100%)",
                          }
                        : {
                            background: `linear-gradient(135deg, ${theme.primaryColor}, ${theme.primaryColor}dd)`,
                          }
                    }
                  />
                  {/* Foreground content */}
                  <div className="relative h-full p-4 flex flex-col">
                    <div className="text-[10px] uppercase tracking-wider font-bold opacity-80 mb-1">
                      {t("promoLabel")}
                    </div>
                    <div className="text-base font-extrabold leading-tight mb-1">{headline}</div>
                    {promo.description && (
                      <div className="text-xs opacity-90 leading-snug mb-2 line-clamp-2">
                        {promo.description}
                      </div>
                    )}
                    <div className="mt-auto flex flex-wrap gap-1.5 text-[10px] font-semibold">
                      {usableWindowLabel && (
                        <span className="bg-white/20 backdrop-blur rounded-full px-2 py-0.5">
                          ⏰ {usableWindowLabel}
                        </span>
                      )}
                      {minOrderLabel && (
                        <span className="bg-white/20 backdrop-blur rounded-full px-2 py-0.5">
                          {minOrderLabel}
                        </span>
                      )}
                      {promo.orderType !== "both" && (
                        <span className="bg-white/20 backdrop-blur rounded-full px-2 py-0.5">
                          {promo.orderType === "pickup" ? "🥡 Pickup" : "🚚 Delivery"}
                        </span>
                      )}
                      {promo.couponCode && (
                        <span className="bg-white text-gray-900 rounded-full px-2 py-0.5 font-mono">
                          {promo.couponCode}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Category pills ───────────────────────────────────────────── */}
        <div ref={pillRef} className="flex gap-2 overflow-x-auto pb-2 mb-6 scroll-smooth" style={{ scrollbarWidth: "none" }}>
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

        {/* ── Menu ─────────────────────────────────────────────────────── */}
        <div className="space-y-10">
          {visibleCategories.map(cat => (
            <CategorySection
              key={cat.id}
              cat={cat}
              theme={theme}
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
            <span>{formatCurrency(subtotal)}</span>
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
                  <div className="text-lg font-bold mt-2" style={{ color: theme.primaryColor }}>{formatCurrency(currentItemPrice)}</div>
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
                      <span className="text-sm font-semibold text-gray-700">{formatCurrency(v.price)}</span>
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
                    {group.options.filter(o => o.isAvailable).map(opt => {
                      const selected = (mods[group.id] || []).includes(opt.id);
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
                            <span className="text-sm text-gray-500">+{formatCurrency(opt.priceAdjustment)}</span>
                          )}
                        </label>
                      );
                    })}
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
                  {t("addToCart")} · {formatCurrency(currentItemPrice * itemQuantity)}
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
                                Bundle
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
                                      (+{formatCurrency(child.specialityFee)})
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
                        <div className="text-sm font-bold text-gray-900 flex-shrink-0">{formatCurrency(ci.lineTotal)}</div>
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
                        <span>-{formatCurrency(r.discount)}</span>
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
                      <span className="font-bold">-{formatCurrency(couponDiscount)}</span>
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
                  <div className="flex justify-between text-gray-600"><span>{t("subtotal")}</span><span>{formatCurrency(subtotal)}</span></div>
                  {promoDiscount > 0 && <div className="flex justify-between text-green-600 font-medium"><span>{t("promoDiscount")}</span><span>-{formatCurrency(promoDiscount)}</span></div>}
                  {couponDiscount > 0 && <div className="flex justify-between text-green-600 font-medium"><span>{t("couponDiscount")}</span><span>-{formatCurrency(couponDiscount)}</span></div>}
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
                      <span>{hasFreeDelivery ? <span className="line-through text-gray-400">{formatCurrency(baseDeliveryFee)}</span> : formatCurrency(deliveryFee)}</span>
                    </div>
                  )}
                  {appliedServiceFees.map(f => (
                    <div key={f.name} className="flex justify-between text-gray-600">
                      <span>{f.name}</span>
                      <span>{formatCurrency(f.amount)}</span>
                    </div>
                  ))}
                  {/* Hide when taxRate is 0% — avoids a confusing
                      "Tax (0%) $0.00" sibling underneath any service
                      fee the owner may have named "Tax". */}
                  {taxAmount > 0 && (
                    <div className="flex justify-between text-gray-600"><span>{t("tax")} ({restaurant.taxRate}%)</span><span>{formatCurrency(taxAmount)}</span></div>
                  )}
                  <div className="flex justify-between font-bold text-gray-900 text-base pt-2 border-t border-gray-100 mt-1"><span>{t("total")}</span><span>{formatCurrency(total)}</span></div>
                </div>

                {/* Out-of-area warning */}
                {orderType === "delivery" && resolvedZone && !resolvedZone.inside && (
                  <div className="mx-4 mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <strong>{t("headsUp")}</strong> {t("outOfAreaWarning")}{" "}
                    {t("feeEta", { fee: formatCurrency(resolvedZone.zone.deliveryFee), minutes: resolvedZone.zone.estimatedMinutes })}
                  </div>
                )}

                {/* Minimum order warning */}
                {orderType === "delivery" && minimumOrderForType > 0 && subtotal < minimumOrderForType && (
                  <div className="mx-4 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {t("addMoreToContinue", { min: formatCurrency(minimumOrderForType), more: formatCurrency(minimumOrderForType - subtotal) })}
                  </div>
                )}

                <div className="p-4">
                  <button
                    onClick={() => { setCartOpen(false); setCheckoutOpen(true); }}
                    disabled={orderType === "delivery" && minimumOrderForType > 0 && subtotal < minimumOrderForType}
                    className="w-full text-white font-bold py-4 rounded-xl transition text-base disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ backgroundColor: theme.primaryColor }}>
                    {t("proceedToCheckout")} → {formatCurrency(total)}
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
          total={total}
          taxRate={restaurant.taxRate}
          customerInfo={customerInfo}
          setCustomerInfo={setCustomerInfo}
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
          onClose={() => setActivePromoModal(null)}
        />
      )}

      {reservationOpen && restaurant.acceptsReservations && restaurant.reservationSettings && (
        <ReservationModal
          restaurantSlug={restaurant.slug}
          restaurantName={restaurant.name}
          settings={restaurant.reservationSettings}
          theme={theme}
          onClose={() => {
            setReservationOpen(false);
            // Clean the ?reservation=1 from the URL so a refresh doesn't reopen.
            if (searchParams.get("reservation")) router.replace(`/order/${restaurant.slug}`);
          }}
        />
      )}
    </div>
  );
}

