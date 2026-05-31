"use client";
import { useRef, useState } from "react";
import {
  X, User, Truck, ShoppingBag, Clock, CreditCard, Heart, Edit2, Tag,
  AlertCircle, Loader2, ChevronDown,
} from "lucide-react";
import { Autocomplete } from "@react-google-maps/api";
import { useCurrencyFormat } from "@/lib/currency-context";
import { parseTheme } from "@/lib/theme";
import { useGoogleMaps } from "@/lib/use-google-maps";
import { useTranslations } from "next-intl";

type Theme = ReturnType<typeof parseTheme>;
type SectionKey = null | "contact" | "ordering" | "time" | "payment" | "tips" | "notes";
type CustomerInfo = {
  name: string; email: string; phone: string; address: string; city: string; zip: string;
  /** Apt / suite / unit number — appended to the street address on submit
   *  so it shows up cleanly on the kitchen receipt + delivery dispatch.
   *  Customer-supplied, free-text. Empty string when not filled. */
  unit: string;
  /** Buzzer / door code — same treatment as `unit`. Drivers need this to
   *  reach the customer at delivery time. Empty string when not filled. */
  buzzer: string;
  /** Delivery-specific instructions ("leave at door", "side entrance",
   *  "ring twice"). Separate from order `notes` (which is kitchen-facing).
   *  Prepended to `notes` on submit so the kitchen sees both, but stays
   *  in its own form field so customers don't conflate the two. */
  deliveryNotes: string;
  notes: string; paymentMethod: string; scheduledFor: string;
};

type CartLine = {
  menuItem: { id: string; name: string };
  variant?: { name: string };
  quantity: number;
  lineTotal: number;
  /** Bundle line item (Promo Type 8 / 13) — when true the summary
   *  renders this as a parent row + indented children instead of a
   *  single line. The child names come from `bundleItems[]`. */
  isBundle?: boolean;
  bundlePromoName?: string;
  bundleItems?: Array<{
    name: string;
    variantName?: string;
    specialityFee?: number;
  }>;
};

interface Props {
  theme: Theme;
  orderType: "pickup" | "delivery";
  /** Switcher between Pickup and Delivery inside the checkout modal.
   *  Lets the customer change their order type without closing the
   *  modal and scrolling back to the page-level toggle. Null when the
   *  restaurant only accepts one of the two (no switching needed). */
  onChangeOrderType?: (next: "pickup" | "delivery") => void;
  acceptsPickup: boolean;
  acceptsDelivery: boolean;
  /** Restaurant slug — for building the sign-in / signup link in the
   *  contact section. */
  restaurantSlug: string;
  /** True when the per-restaurant customer session is active. Hides the
   *  "Sign in" CTA when set; contact info is auto-populated from the
   *  customer's saved profile by the parent. */
  isSignedIn: boolean;
  /** True when the customer arrived via the public marketplace
   *  (?from=marketplace). Switches the sign-in CTA from "this
   *  restaurant" wording to "marketplace" wording — the two account
   *  systems are fully separate (separate cookies, separate tables,
   *  separate signup paths), so the sign-in link points at the right
   *  one based on context. */
  fromMarketplace: boolean;
  cart: CartLine[];
  subtotal: number;
  totalDiscount: number;
  /** Promos that fired for the current cart. Used to render the
   *  "🎉 You unlocked …" celebration banner at the top of the modal
   *  so customers see exactly what they're saving on. Each entry =
   *  { promoId, name, type, discount, couponCode? }. */
  appliedPromos?: Array<{
    promoId: string;
    name: string;
    type: string;
    discount: number;
    couponCode?: string;
  }>;
  /** True when a Free Delivery promo fired. We surface this in the
   *  banner separately because calcFreeDelivery returns 0 (the discount
   *  is realised by zeroing the delivery fee, not by lowering subtotal),
   *  so the appliedPromos entry has discount=0. */
  hasFreeDelivery?: boolean;
  /** What the delivery fee WOULD have been without the promo. Used to
   *  show the savings on the Free Delivery row. */
  baseDeliveryFee?: number;
  deliveryFee: number;
  appliedServiceFees: { name: string; amount: number }[];
  taxAmount: number;
  tipAmount: number;
  tipPercent: number;
  setTipPercent: (n: number) => void;
  /** When false, the entire Tips section is hidden and the customer
   *  pays no tip. Source of truth: Restaurant.tipsEnabled. Some
   *  markets (notably most of Europe) don't tip at restaurants at all
   *  — surfacing a tip picker there is at best confusing, at worst
   *  insulting. Owners flip this off in /admin/service-fees. */
  tipsEnabled?: boolean;
  total: number;
  taxRate: number;
  customerInfo: CustomerInfo;
  setCustomerInfo: (ci: CustomerInfo) => void;
  editingSection: SectionKey;
  setEditingSection: (s: SectionKey) => void;
  orderLoading: boolean;
  placeOrder: () => void;
  cardPaymentEnabled: boolean;
  /** Payment method slugs the restaurant accepts. Drives which picker
   *  buttons render in the checkout. Possible values:
   *    "cash"           → Cash on pickup / delivery
   *    "card_in_person" → Card at pickup / door (POS / mobile reader)
   *    "online_card"    → Stripe-charged card on the checkout page
   *    "paypal"         → PayPal Smart Buttons → external approval flow
   *  When "online_card" or "paypal" is in this set but the corresponding
   *  account isn't connected, the button still renders but selecting it
   *  shows a "coming soon" notice. */
  acceptedMethods: string[];
  /** True when the restaurant has connected their PayPal REST app
   *  credentials (paypalAccountStatus = "connected") AND has the
   *  card_payments entitlement. Drives whether the PayPal button works
   *  vs. shows "coming soon". */
  paypalEnabled: boolean;
  couponCode: string;
  setCouponCode: (s: string) => void;
  couponId: string | null;
  couponDiscount: number;
  couponLoading: boolean;
  applyCoupon: () => void;
  estimatedDeliveryMinutes: number;
  estimatedPickupMinutes: number;
  hasZones: boolean;
  geocoding: boolean;
  geocodeError: string | null;
  resolvedZone: { zone: { name: string; color: string; deliveryFee: number; estimatedMinutes: number }; inside: boolean } | null;
  mapProvider: "leaflet" | "google";
  googleMapsApiKey: string | null;
  onClose: () => void;
  /** True when the current cart contains any catering-tagged item — at
   *  the item level or via its parent category. Forces schedule-for-
   *  later mode (ASAP disabled) with min selectable time =
   *  cateringMinScheduledIso. The catering banner explains why. */
  cateringMode?: boolean;
  /** Earliest selectable datetime in datetime-local format
   *  ("YYYY-MM-DDTHH:MM"). Derived as now + cateringNoticeHours by the
   *  parent. Used as the `min` on the schedule picker AND as the
   *  default value when cateringMode flips on with an empty schedule. */
  cateringMinScheduledLocal?: string;
  /** Restaurant's configured advance notice (hours) — surfaced in the
   *  banner copy so the customer sees the actual requirement. */
  cateringNoticeHours?: number;
  /** Why schedule-for-later is being forced. Drives the banner copy
   *  inside the time-choice section so the customer understands
   *  whether it's a catering rule, a "we're closed right now" rule,
   *  or both at once. */
  scheduleReason?: "catering" | "closed" | "both" | null;
  /** The restaurant's next opening moment in datetime-local format
   *  (used by the "we're closed" branch of the banner copy). */
  closedNextOpenLocal?: string;
}

export function CheckoutModal({
  theme, orderType, onChangeOrderType, acceptsPickup, acceptsDelivery,
  restaurantSlug, isSignedIn, fromMarketplace,
  cart, subtotal, totalDiscount,
  appliedPromos = [], hasFreeDelivery = false, baseDeliveryFee = 0,
  deliveryFee, appliedServiceFees, taxAmount,
  tipAmount, tipPercent, setTipPercent, tipsEnabled = true, total, taxRate,
  customerInfo, setCustomerInfo,
  editingSection, setEditingSection,
  orderLoading, placeOrder,
  cardPaymentEnabled,
  acceptedMethods,
  cateringMode = false,
  cateringMinScheduledLocal,
  cateringNoticeHours,
  scheduleReason = null,
  closedNextOpenLocal,
  paypalEnabled,
  couponCode, setCouponCode, couponId, couponDiscount, couponLoading, applyCoupon,
  estimatedDeliveryMinutes, estimatedPickupMinutes,
  hasZones, geocoding, geocodeError, resolvedZone,
  mapProvider, googleMapsApiKey,
  onClose,
}: Props) {
  const tc = useTranslations("checkout");
  const tOrd = useTranslations("ordering");
  const tCommon = useTranslations("common");
  // Wire every $/€/£ label in this checkout through the restaurant's
  // configured currency via the CurrencyProvider in the parent. We
  // alias to `formatCurrency` so the existing call sites in this file
  // didn't all need rewriting.
  const formatCurrency = useCurrencyFormat();
  const [showCouponField, setShowCouponField] = useState(false);
  const googleEnabled = mapProvider === "google" && !!googleMapsApiKey;
  const { isLoaded: gmapsLoaded } = useGoogleMaps(googleEnabled ? googleMapsApiKey! : "");
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  const handlePlaceChanged = () => {
    const place = autocompleteRef.current?.getPlace();
    if (!place || !place.address_components) return;

    const get = (type: string, short = false) =>
      place.address_components!.find((c) => c.types.includes(type))?.[short ? "short_name" : "long_name"] ?? "";

    const streetNumber = get("street_number");
    const route = get("route");
    const street = [streetNumber, route].filter(Boolean).join(" ");
    const city = get("locality") || get("sublocality") || get("administrative_area_level_2");
    const zip = get("postal_code");

    setCustomerInfo({
      ...customerInfo,
      address: street || place.formatted_address || customerInfo.address,
      city: city || customerInfo.city,
      zip: zip || customerInfo.zip,
    });
  };

  const toggleEdit = (s: Exclude<SectionKey, null>) =>
    setEditingSection(editingSection === s ? null : s);

  const contactSummary = customerInfo.name && customerInfo.phone
    ? `${customerInfo.name} · ${customerInfo.phone}${customerInfo.email ? ` · ${customerInfo.email}` : ""}`
    : null;

  const orderingSummary = orderType === "delivery"
    ? (customerInfo.address
        ? `Delivery to ${customerInfo.address}${customerInfo.city ? ", " + customerInfo.city : ""}`
        : "Delivery — add address")
    : `Pickup`;

  const timeSummary = customerInfo.scheduledFor
    ? `Scheduled for ${new Date(customerInfo.scheduledFor).toLocaleString()}`
    : cateringMode
      ? `Catering — choose a time ≥ ${cateringNoticeHours ?? 24}h ahead`
      : `ASAP · ~${orderType === "delivery" ? estimatedDeliveryMinutes : estimatedPickupMinutes} min`;

  // Human-readable summary for the collapsed payment-method card.
  // Stays consistent with the picker labels below; "card" remains the
  // legacy slug used by the Stripe online-payment branch elsewhere in
  // the page so we don't break the placeOrder() gate.
  const paymentSummary =
    customerInfo.paymentMethod === "card"
      ? tc("payOnlineCard")
      : customerInfo.paymentMethod === "paypal"
        ? "PayPal"
        : customerInfo.paymentMethod === "card_in_person"
          ? (orderType === "pickup" ? tc("cardOnPickup") : tc("cardOnDelivery"))
          : (orderType === "pickup" ? tc("cashOnPickup") : tc("cashOnDelivery"));

  const tipsSummary = tipAmount > 0
    ? `${tipPercent}% (${formatCurrency(tipAmount)})`
    : "No tip";

  const notesSummary = customerInfo.notes
    ? customerInfo.notes.length > 60 ? customerInfo.notes.slice(0, 60) + "…" : customerInfo.notes
    : tc("noNotes");

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white sm:rounded-2xl w-full max-w-4xl max-h-[96vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-900 truncate">{tc("title")}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Celebration banner — applied promos summary. Only renders when
            at least one promo fired OR free delivery was unlocked. Each
            row shows the promo name + savings. Stays sticky-at-top of the
            modal body so customers see what they earned even as they
            scroll the form below. */}
        {(appliedPromos.length > 0 || (hasFreeDelivery && baseDeliveryFee > 0)) && (
          <div className="px-5 pt-4 flex-shrink-0">
            <div className="rounded-xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-green-50 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl" aria-hidden>🎉</span>
                <div className="text-sm font-bold text-emerald-800">
                  You unlocked {appliedPromos.length + (hasFreeDelivery && baseDeliveryFee > 0 ? 1 : 0) === 1 ? "a promo!" : "promos!"}
                </div>
              </div>
              <div className="space-y-1.5">
                {appliedPromos
                  // Free Delivery promos have discount=0 — surface them via
                  // the separate "Free Delivery" line below instead so the
                  // savings amount is accurate (it's the delivery fee).
                  .filter((p) => p.type !== "free_delivery" && p.discount > 0)
                  .map((p) => (
                    <div key={p.promoId} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 text-emerald-700 font-medium truncate">
                        <span aria-hidden>✓</span>
                        <span className="truncate">{p.name}</span>
                        {p.couponCode && (
                          <span className="font-mono bg-white border border-emerald-200 text-emerald-700 rounded px-1.5 py-0.5 ml-1">
                            {p.couponCode}
                          </span>
                        )}
                      </div>
                      <div className="font-semibold text-emerald-800 whitespace-nowrap ml-2">
                        − {formatCurrency(p.discount)}
                      </div>
                    </div>
                  ))}
                {hasFreeDelivery && baseDeliveryFee > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 text-emerald-700 font-medium">
                      <span aria-hidden>🚚</span>
                      <span>Free delivery</span>
                    </div>
                    <div className="font-semibold text-emerald-800 whitespace-nowrap ml-2">
                      − {formatCurrency(baseDeliveryFee)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid md:grid-cols-2 gap-0">
            {/* ── Left column: settings cards ── */}
            <div className="p-5 space-y-3 md:border-r md:border-gray-100">
              {/* CONTACT */}
              <SectionCard
                icon={<User className="w-4 h-4" />}
                label={tc("contact")}
                summary={contactSummary ?? tc("addDetails")}
                onEdit={() => toggleEdit("contact")}
                expanded={editingSection === "contact"}
                primary={theme.primaryColor}
              >
                {/* Sign-in CTA for guest customers. Branches on whether
                    the customer arrived via the marketplace channel: the
                    marketplace account (CustomerAccount, `ff_customer`
                    cookie) and the per-restaurant account (Customer,
                    `ff_rest_account` cookie) are fully separate systems,
                    so the sign-in link MUST point at the right one for
                    the customer's current context — otherwise we'd send
                    a marketplace shopper to a per-restaurant login they
                    don't have, or vice versa. Hidden when already signed
                    in (contact fields are auto-populated by the parent). */}
                {!isSignedIn && (
                  fromMarketplace ? (
                    <div className="pt-3 -mb-1 text-xs text-gray-500">
                      Already have a marketplace account?{" "}
                      <a
                        href={`/login?next=${encodeURIComponent(`/order/${restaurantSlug}?from=marketplace`)}`}
                        className="font-semibold underline hover:no-underline"
                        style={{ color: theme.primaryColor }}
                      >
                        Sign in
                      </a>{" "}
                      to skip re-typing your details.
                    </div>
                  ) : (
                    <div className="pt-3 -mb-1 text-xs text-gray-500">
                      Already have an account at this restaurant?{" "}
                      <a
                        href={`/order/${restaurantSlug}/account/login?next=${encodeURIComponent(`/order/${restaurantSlug}`)}`}
                        className="font-semibold underline hover:no-underline"
                        style={{ color: theme.primaryColor }}
                      >
                        Sign in
                      </a>{" "}
                      to skip re-typing your details.
                    </div>
                  )
                )}
                <div className="grid grid-cols-2 gap-2 pt-3">
                  <input
                    id="checkout-contact-name"
                    required
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                    style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                    placeholder={`${tc("fullNamePlaceholder")} *`}
                    value={customerInfo.name}
                    onChange={e => setCustomerInfo({ ...customerInfo, name: e.target.value })}
                  />
                  <input
                    id="checkout-contact-phone"
                    type="tel"
                    required
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                    style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                    placeholder={`${tc("phonePlaceholder")} *`}
                    value={customerInfo.phone}
                    onChange={e => setCustomerInfo({ ...customerInfo, phone: e.target.value })}
                  />
                  <input
                    id="checkout-contact-email"
                    type="email"
                    required
                    className="col-span-2 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                    style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                    placeholder={`${tc("emailPlaceholder")} *`}
                    value={customerInfo.email}
                    onChange={e => setCustomerInfo({ ...customerInfo, email: e.target.value })}
                  />
                </div>
              </SectionCard>

              {/* ORDERING METHOD — pickup ↔ delivery toggle PLUS the
                  delivery address fields when delivery is selected. The
                  toggle was previously only on the page-level header,
                  forcing customers to close the modal to switch between
                  pickup and delivery. Now it lives here too. */}
              <SectionCard
                icon={orderType === "delivery" ? <Truck className="w-4 h-4" /> : <ShoppingBag className="w-4 h-4" />}
                label={tc("orderingMethod")}
                summary={orderingSummary}
                onEdit={() => toggleEdit("ordering")}
                expanded={editingSection === "ordering"}
                primary={theme.primaryColor}
              >
                {/* Pickup vs Delivery selector — only render when the
                    restaurant actually accepts BOTH. A pickup-only or
                    delivery-only restaurant gets no choice; we just
                    show the address fields below (for delivery). */}
                {acceptsPickup && acceptsDelivery && onChangeOrderType && (
                  <div className="pt-3 grid grid-cols-2 gap-2">
                    {([
                      { value: "pickup" as const, icon: <ShoppingBag className="w-4 h-4" />, label: tOrd("pickup") },
                      { value: "delivery" as const, icon: <Truck className="w-4 h-4" />, label: tOrd("delivery") },
                    ]).map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => onChangeOrderType(opt.value)}
                        className="flex items-center justify-center gap-2 py-2 px-3 rounded-lg border-2 text-sm font-semibold transition"
                        style={orderType === opt.value
                          ? { borderColor: theme.primaryColor, backgroundColor: `${theme.primaryColor}12`, color: theme.primaryColor }
                          : { borderColor: "#e5e7eb", color: "#4b5563" }
                        }
                      >
                        {opt.icon}
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
                {orderType === "delivery" && (
                  <div className="pt-3 space-y-2">
                    {googleEnabled && gmapsLoaded ? (
                      <Autocomplete
                        onLoad={(ac) => { autocompleteRef.current = ac; }}
                        onPlaceChanged={handlePlaceChanged}
                        options={{ fields: ["address_components", "formatted_address", "geometry"], types: ["address"] }}
                      >
                        <input
                          id="checkout-delivery-address"
                          type="text" placeholder={tc("startTypingAddress")}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                          style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                          value={customerInfo.address}
                          onChange={e => setCustomerInfo({ ...customerInfo, address: e.target.value })}
                        />
                      </Autocomplete>
                    ) : (
                      <input
                        id="checkout-delivery-address"
                        type="text" placeholder={tc("streetAddressPlaceholder")}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                        style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                        value={customerInfo.address}
                        onChange={e => setCustomerInfo({ ...customerInfo, address: e.target.value })}
                      />
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text" placeholder={tc("cityPlaceholder")}
                        className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                        style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                        value={customerInfo.city}
                        onChange={e => setCustomerInfo({ ...customerInfo, city: e.target.value })}
                      />
                      <input
                        type="text" placeholder={tc("zipPlaceholder")}
                        className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                        style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                        value={customerInfo.zip}
                        onChange={e => setCustomerInfo({ ...customerInfo, zip: e.target.value })}
                      />
                    </div>
                    {/* Apt/Unit + Buzzer (optional) — concatenated into
                        deliveryAddress on submit so kitchen receipt sees
                        the full string. */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <input
                        type="text" placeholder="Apt / Unit / Suite (optional)"
                        className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                        style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                        value={customerInfo.unit || ""}
                        onChange={e => setCustomerInfo({ ...customerInfo, unit: e.target.value })}
                      />
                      <input
                        type="text" placeholder="Buzzer code (optional)"
                        className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                        style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                        value={customerInfo.buzzer || ""}
                        onChange={e => setCustomerInfo({ ...customerInfo, buzzer: e.target.value })}
                      />
                    </div>
                    {/* Delivery instructions — separate from order notes
                        (which is kitchen-facing). These reach the driver
                        at dispatch time. */}
                    <textarea
                      placeholder="Delivery instructions — leave at door, side entrance, ring twice, etc. (optional)"
                      rows={3}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-none"
                      style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                      value={customerInfo.deliveryNotes || ""}
                      onChange={e => setCustomerInfo({ ...customerInfo, deliveryNotes: e.target.value })}
                    />
                    {hasZones && geocoding && (
                      <p className="text-xs text-gray-500 flex items-center gap-1.5">
                        <Loader2 className="w-3 h-3 animate-spin" /> {tc("locatingAddress")}
                      </p>
                    )}
                    {hasZones && !geocoding && geocodeError && (
                      <p className="text-xs text-red-600">{geocodeError}</p>
                    )}
                    {hasZones && resolvedZone && resolvedZone.inside && (
                      <p className="text-xs text-gray-600">
                        {tc("youreIn", { zone: resolvedZone.zone.name, fee: formatCurrency(resolvedZone.zone.deliveryFee), minutes: resolvedZone.zone.estimatedMinutes })}
                      </p>
                    )}
                    {hasZones && resolvedZone && !resolvedZone.inside && (
                      <p className="text-xs text-amber-700">
                        <strong>{tc("outsideStandard")}</strong> {tc("outsideAreaWarning", { fee: formatCurrency(resolvedZone.zone.deliveryFee), minutes: resolvedZone.zone.estimatedMinutes })}
                      </p>
                    )}
                  </div>
                )}
              </SectionCard>

              {/* AVAILABLE TIME CHOICE */}
              <SectionCard
                icon={<Clock className="w-4 h-4" />}
                label={tc("availableTimeChoice")}
                summary={timeSummary}
                onEdit={() => toggleEdit("time")}
                expanded={editingSection === "time"}
                primary={theme.primaryColor}
              >
                <div className="pt-3 space-y-2">
                  {cateringMode && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-800 px-3 py-2 text-xs">
                      {scheduleReason === "closed" ? (
                        <>
                          🌙 We&apos;re closed right now. Pick a time when we&apos;re open —
                          earliest available is shown below.
                          {closedNextOpenLocal && (
                            <span className="block mt-1 text-amber-900 font-semibold">
                              Next opening: {new Date(closedNextOpenLocal).toLocaleString(undefined, {
                                weekday: "short", month: "short", day: "numeric",
                                hour: "numeric", minute: "2-digit",
                              })}
                            </span>
                          )}
                        </>
                      ) : scheduleReason === "both" ? (
                        <>
                          🌙🎉 We&apos;re closed AND your cart includes catering items.
                          Earliest available time is the later of next opening and{" "}
                          <strong>{cateringNoticeHours ?? 24}h</strong> from now.
                        </>
                      ) : (
                        <>
                          🎉 Your cart includes catering items — orders must be scheduled at
                          least <strong>{cateringNoticeHours ?? 24}h</strong> in advance.
                          ASAP isn&apos;t available with catering items in the cart.
                        </>
                      )}
                    </div>
                  )}
                  <label className="block text-xs text-gray-500">{tc("scheduleForLaterOptional")}</label>
                  <input
                    type="datetime-local"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                    style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                    min={cateringMode && cateringMinScheduledLocal
                      ? cateringMinScheduledLocal
                      : new Date().toISOString().slice(0, 16)}
                    value={customerInfo.scheduledFor}
                    onChange={e => setCustomerInfo({ ...customerInfo, scheduledFor: e.target.value })}
                  />
                  {/* "Switch to ASAP" is hidden in catering mode — ASAP
                      is exactly what the rule blocks. Customer must
                      pick a real future time. */}
                  {customerInfo.scheduledFor && !cateringMode && (
                    <button
                      onClick={() => setCustomerInfo({ ...customerInfo, scheduledFor: "" })}
                      className="text-xs text-gray-500 hover:text-gray-700 underline"
                    >
                      {tc("switchToASAP")}
                    </button>
                  )}
                </div>
              </SectionCard>

              {/* PAYMENT METHOD */}
              <SectionCard
                icon={<CreditCard className="w-4 h-4" />}
                label={tc("paymentMethodHeading")}
                summary={paymentSummary}
                onEdit={() => toggleEdit("payment")}
                expanded={editingSection === "payment"}
                primary={theme.primaryColor}
              >
                {(() => {
                  // Render only the methods the restaurant has selected
                  // in /admin/payments. Each slug maps to one customer-
                  // facing button. Order is fixed (cash → card_in_person
                  // → online_card) so the layout stays predictable as
                  // owners flip methods on/off.
                  const all = [
                    {
                      slug: "cash",
                      value: "cash",
                      label: orderType === "pickup" ? tc("cashOnPickup") : tc("cashOnDelivery"),
                    },
                    {
                      slug: "card_in_person",
                      value: "card_in_person",
                      label: orderType === "pickup" ? tc("cardOnPickup") : tc("cardOnDelivery"),
                    },
                    {
                      slug: "online_card",
                      value: "card", // legacy slug used by the Stripe branch in placeOrder()
                      label: tc("payOnlineCard"),
                    },
                    {
                      slug: "paypal",
                      value: "paypal",
                      label: "PayPal",
                    },
                  ];
                  const visible = all.filter((p) => acceptedMethods.includes(p.slug));
                  const cols = visible.length >= 4 ? "grid-cols-2 sm:grid-cols-4" : visible.length === 3 ? "grid-cols-3" : "grid-cols-2";
                  return (
                    <div className={`pt-3 grid ${cols} gap-2`}>
                      {visible.map((pm) => (
                        <button
                          key={pm.slug}
                          onClick={() => setCustomerInfo({ ...customerInfo, paymentMethod: pm.value })}
                          className="py-2 px-3 rounded-lg border-2 text-xs font-semibold transition"
                          style={customerInfo.paymentMethod === pm.value
                            ? { borderColor: theme.primaryColor, backgroundColor: `${theme.primaryColor}12`, color: theme.primaryColor }
                            : { borderColor: "#e5e7eb", color: "#4b5563" }
                          }
                        >
                          {pm.label}
                        </button>
                      ))}
                    </div>
                  );
                })()}
                {customerInfo.paymentMethod === "card" && !cardPaymentEnabled && (
                  <div className="mt-2 p-2.5 bg-blue-50 rounded-lg text-xs text-blue-700 flex items-start gap-2">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    {tc("cardComingSoon", { type: orderType === "pickup" ? tOrd("pickup").toLowerCase() : tOrd("delivery").toLowerCase() })}
                  </div>
                )}
                {customerInfo.paymentMethod === "paypal" && !paypalEnabled && (
                  <div className="mt-2 p-2.5 bg-amber-50 rounded-lg text-xs text-amber-700 flex items-start gap-2">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    This restaurant hasn&apos;t finished PayPal setup yet. Pick another payment method.
                  </div>
                )}
                {customerInfo.paymentMethod === "paypal" && paypalEnabled && (
                  <div className="mt-2 p-2.5 bg-blue-50 rounded-lg text-xs text-blue-700 flex items-start gap-2">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    You&apos;ll be redirected to PayPal to approve the payment after placing your order.
                  </div>
                )}
              </SectionCard>

              {/* TIPS — entire card is hidden when the restaurant has
                  disabled tipping (Restaurant.tipsEnabled = false).
                  No-tip markets (most of Europe) should see no tip
                  picker at all, not a "$0 / No tip" option. The state
                  is still wired so the totals math doesn't blow up;
                  the parent forces tipPercent=0 in that case. */}
              {tipsEnabled && (
              <SectionCard
                icon={<Heart className="w-4 h-4" />}
                label={tc("tipsHeading")}
                summary={tipsSummary}
                onEdit={() => toggleEdit("tips")}
                expanded={editingSection === "tips"}
                primary={theme.primaryColor}
              >
                <div className="pt-3 space-y-3">
                  {/* Preset buttons — quick taps for the common amounts.
                      "Suggested" badge on 15% (Luigi 2026-05-29) so
                      customers see the recommended starting point. */}
                  <div className="flex flex-wrap gap-2">
                    {[0, 10, 15, 18, 20, 25, 30].map((p) => {
                      const isSuggested = p === 15;
                      const active = tipPercent === p;
                      return (
                        <button
                          key={p}
                          onClick={() => setTipPercent(p)}
                          className="relative px-3 py-1.5 rounded-lg border-2 text-xs font-semibold transition"
                          style={
                            active
                              ? { borderColor: theme.primaryColor, backgroundColor: `${theme.primaryColor}12`, color: theme.primaryColor }
                              : { borderColor: "#e5e7eb", color: "#4b5563" }
                          }
                        >
                          {p === 0 ? tc("noTip") : `${p}%`}
                          {isSuggested && (
                            <span
                              className="absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full whitespace-nowrap"
                              style={{
                                backgroundColor: theme.primaryColor,
                                color: "#fff",
                              }}
                            >
                              Suggested
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {/* Slider — for granular control between / above presets.
                      Caps at 50% so a stray drag can't tank the customer. */}
                  <div>
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                      <span>Custom amount</span>
                      <span className="font-mono font-semibold text-gray-700">
                        {tipPercent}% ({formatCurrency(tipAmount)})
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={50}
                      step={1}
                      value={tipPercent}
                      onChange={(e) => setTipPercent(parseInt(e.target.value, 10) || 0)}
                      className="w-full accent-emerald-500"
                      style={{ accentColor: theme.primaryColor }}
                    />
                    <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                      <span>0%</span>
                      <span>25%</span>
                      <span>50%</span>
                    </div>
                  </div>
                </div>
              </SectionCard>
              )}

              {/* NOTES */}
              <SectionCard
                icon={<Edit2 className="w-4 h-4" />}
                label={tc("orderNotesHeading")}
                summary={notesSummary}
                onEdit={() => toggleEdit("notes")}
                expanded={editingSection === "notes"}
                primary={theme.primaryColor}
              >
                <textarea
                  className="mt-3 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-none"
                  style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                  rows={2}
                  placeholder={tc("anyInstructions")}
                  value={customerInfo.notes}
                  onChange={e => setCustomerInfo({ ...customerInfo, notes: e.target.value })}
                />
              </SectionCard>
            </div>

            {/* ── Right column: order summary ── */}
            <div className="p-5 bg-gray-50">
              <div className="grid grid-cols-[40px_1fr_70px] gap-3 text-xs font-bold text-gray-500 uppercase pb-2 border-b border-gray-200">
                <span>{tc("qty")}</span>
                <span>{tc("item")}</span>
                <span className="text-right">{tc("price")}</span>
              </div>
              {cart.length === 0 ? (
                <div className="py-10 text-center text-gray-400 text-sm">{tc("cartEmpty")}</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {cart.map((ci, i) => (
                    <div key={i} className="grid grid-cols-[40px_1fr_70px] gap-3 py-2.5 text-sm items-start">
                      <span className="font-semibold text-gray-700">{ci.isBundle ? "1×" : `${ci.quantity}×`}</span>
                      <span className="text-gray-700">
                        <span className="font-semibold">
                          {ci.isBundle ? (ci.bundlePromoName ?? ci.menuItem.name) : ci.menuItem.name}
                        </span>
                        {ci.variant && <span className="block text-xs text-gray-400">{ci.variant.name}</span>}
                        {ci.isBundle && ci.bundleItems && ci.bundleItems.length > 0 && (
                          <span className="block mt-1 pl-3 border-l-2 border-gray-100 text-xs text-gray-500 space-y-0.5">
                            {ci.bundleItems.map((child, ci2) => (
                              <span key={ci2} className="block">
                                • {child.name}
                                {child.variantName ? ` (${child.variantName})` : ""}
                                {child.specialityFee && child.specialityFee > 0
                                  ? ` (+${formatCurrency(child.specialityFee)})`
                                  : ""}
                              </span>
                            ))}
                          </span>
                        )}
                      </span>
                      <span className="text-right text-gray-700 font-medium">{formatCurrency(ci.lineTotal)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Coupon */}
              <div className="mt-4 pt-4 border-t border-gray-200">
                {couponId ? (
                  <div className="flex items-center justify-between text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">
                    <span className="flex items-center gap-1.5"><Tag className="w-3.5 h-3.5" /> Code <span className="font-mono font-bold">{couponCode}</span> applied</span>
                    <span className="font-bold">-{formatCurrency(couponDiscount)}</span>
                  </div>
                ) : showCouponField ? (
                  <div className="flex gap-2">
                    <input
                      type="text" placeholder={tc("couponCodePlaceholder")}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                      style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                      value={couponCode}
                      onChange={e => setCouponCode(e.target.value.toUpperCase())}
                      onKeyDown={e => e.key === "Enter" && applyCoupon()}
                    />
                    <button
                      onClick={applyCoupon} disabled={couponLoading}
                      className="bg-gray-900 text-white text-sm font-semibold px-3 rounded-lg hover:bg-gray-800 transition disabled:opacity-50"
                    >
                      {couponLoading ? "..." : "Apply"}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowCouponField(true)}
                    className="text-sm font-semibold underline"
                    style={{ color: theme.primaryColor }}
                  >
                    {tOrd("couponCode")}
                  </button>
                )}
              </div>

              {/* Totals — when a promo is reducing a charge, show the
                  ORIGINAL amount struck through next to the discounted
                  value so customers see what they would have paid
                  without the promo (Luigi feedback 2026-05-29). */}
              <div className="mt-4 pt-3 border-t border-gray-200 space-y-1 text-sm">
                <div className="flex justify-between text-gray-600"><span>Sub-Total</span><span>{formatCurrency(subtotal)}</span></div>
                {totalDiscount > 0 && (
                  <div className="flex justify-between text-green-600 font-medium"><span>{tc("discount")}</span><span>− {formatCurrency(totalDiscount)}</span></div>
                )}
                {orderType === "delivery" && (
                  <div className="flex justify-between text-gray-600">
                    <span>{tc("delivery")}</span>
                    <span>
                      {hasFreeDelivery && baseDeliveryFee > 0 ? (
                        <>
                          <span className="line-through text-gray-400 mr-1.5">
                            {formatCurrency(baseDeliveryFee)}
                          </span>
                          <span className="text-emerald-600 font-semibold">FREE</span>
                        </>
                      ) : (
                        formatCurrency(deliveryFee)
                      )}
                    </span>
                  </div>
                )}
                {appliedServiceFees.map(f => (
                  <div key={f.name} className="flex justify-between text-gray-600">
                    <span>{f.name}</span>
                    <span>{formatCurrency(f.amount)}</span>
                  </div>
                ))}
                {/* Hide the Tax row when there's no actual tax to charge
                    (taxRate set to 0% in /admin/payments). A restaurant
                    that handles tax via a "Tax" service-fee row would
                    otherwise display BOTH that line AND a confusing
                    "Tax (0%) $0.00" sibling. Only render when there's
                    a real tax amount to show. */}
                {taxAmount > 0 && (
                  <div className="flex justify-between text-gray-600"><span>Tax ({taxRate}%)</span><span>{formatCurrency(taxAmount)}</span></div>
                )}
                {tipAmount > 0 && (
                  <div className="flex justify-between text-gray-600"><span>{tc("tip")}</span><span>{formatCurrency(tipAmount)}</span></div>
                )}
                <div className="flex justify-between font-bold text-gray-900 text-base pt-2 border-t border-gray-200 mt-1">
                  <span>{tc("total")}</span><span>{formatCurrency(total)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-5 py-4 bg-white flex-shrink-0 flex items-center gap-3">
          <div className="flex-1">
            <div className="text-xs text-gray-500 uppercase font-bold">{tc("total")}</div>
            <div className="text-lg font-bold text-gray-900">{formatCurrency(total)}</div>
          </div>
          <button
            onClick={placeOrder}
            disabled={orderLoading || cart.length === 0}
            className="flex-1 sm:flex-none text-white font-bold py-3 px-6 rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-50 text-base"
            style={{ backgroundColor: theme.primaryColor }}
          >
            {orderLoading && <Loader2 className="w-5 h-5 animate-spin" />}
            {orderLoading
              ? tc("placingOrder")
              : tc("placeOrder")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Card with edit-pencil toggle ────────────────────────────────────────────
function SectionCard({
  icon, label, summary, onEdit, expanded, primary, children,
}: {
  icon: React.ReactNode;
  label: string;
  summary: string;
  onEdit?: () => void;
  expanded: boolean;
  primary: string;
  children?: React.ReactNode;
}) {
  const tc = useTranslations("common");
  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="text-gray-400 flex-shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">{label}</div>
          <div className="text-sm text-gray-800 truncate">{summary}</div>
        </div>
        {onEdit && (
          <button
            onClick={onEdit}
            title={tc("edit")}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 flex-shrink-0"
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <Edit2 className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
      {expanded && children && (
        <div className="px-4 pb-3 border-t border-gray-100" style={{ backgroundColor: `${primary}06` }}>
          {children}
        </div>
      )}
    </div>
  );
}
