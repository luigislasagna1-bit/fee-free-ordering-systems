"use client";
import { useRef, useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import {
  X, User, Truck, ShoppingBag, Clock, CreditCard, Heart, Edit2, Tag,
  AlertCircle, Loader2, ChevronDown, Utensils, Package,
} from "lucide-react";
import { Autocomplete } from "@react-google-maps/api";
import { useCurrencyFormat } from "@/lib/currency-context";
import { pickHoursForService } from "@/lib/service-hours";
import { parseTheme } from "@/lib/theme";
import { formatTime } from "@/lib/format-time";
import { useGoogleMaps } from "@/lib/use-google-maps";
import { resolveMapsBrowserKey } from "@/lib/maps-key";
import { useTranslations } from "next-intl";
import {
  type DeliveryFieldKey,
  type DeliveryAddressConfig,
} from "@/lib/delivery-address-fields";

// Leaflet pin is dynamically imported (ssr:false) — Leaflet touches `window`,
// so it must never be in the server bundle. Google's pin loads statically above.
const CheckoutLeafletPin = dynamic(() => import("./CheckoutLeafletPin"), { ssr: false });

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
  /** "Yes, I'd like to receive marketing communications from this
   *  restaurant" checkbox. Lands on Customer.marketingConsent
   *  server-side. False by default — opt-in, not opt-out, for
   *  CASL / GDPR compliance. */
  marketingConsent: boolean;
  notes: string; paymentMethod: string; scheduledFor: string;
  /** Extra structured fields for the customizable delivery form. Shown only
   *  when the restaurant's deliveryFormConfig enables them. (street→address,
   *  city→city, postcode→zip, apartment→unit, intercom→buzzer.) */
  neighbourhood: string; building: string; floor: string; parking: string;
  /** Precise delivery pin coords (Google-maps restaurants). */
  lat: number | null;
  lng: number | null;
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
  orderType: "pickup" | "delivery" | "dine_in" | "take_out";
  /** Switcher between order types inside the checkout modal. Lets the customer
   *  change their order type without closing the modal and scrolling back to
   *  the page-level toggle. Null when the restaurant only accepts one type. */
  onChangeOrderType?: (next: "pickup" | "delivery" | "dine_in" | "take_out") => void;
  acceptsPickup: boolean;
  acceptsDelivery: boolean;
  acceptsDineIn?: boolean;
  acceptsTakeOut?: boolean;
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
    /** Per-item breakdown when the deal applied more than once (e.g. a BOGO
     *  that freed 3 pizzas). Each entry = one freed item + its discount, so the
     *  banner lists them individually instead of one lump sum. Luigi 2026-06-07. */
    breakdown?: Array<{ menuItemId: string; name: string; amount: number }>;
  }>;
  /** Exclusive promos that qualified but lost to a bigger exclusive (only one
   *  exclusive applies per order). Shown as a small note so the customer knows
   *  why a deal they expected didn't apply. Luigi 2026-06-07. */
  bumpedExclusives?: Array<{ promoId: string; name: string; discount: number; winnerName: string }>;
  /** Reserve-then-order: when set, this order will be submitted together with
   *  a table booking. Drives a banner at the top of checkout so the customer
   *  knows they're confirming a reservation + paying in one go. Luigi 2026-06-08. */
  reservationContext?: { date: string; time: string; partySize: number } | null;
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
  /** Marketing-checkbox toggle. Routed through the parent so it can record
   *  that the customer manually set consent for THIS email — which stops the
   *  async consent pre-fill from later overriding their choice. */
  onMarketingToggle?: (checked: boolean) => void;
  /** True when the contact/delivery fields were silently pre-filled from
   *  details this device remembered from a prior order (guest "remember me").
   *  When true we show a small "Not you? Clear" link so a different person on a
   *  shared device can wipe it. Luigi 2026-06-10. */
  savedGuestInfo?: boolean;
  /** Wipes the device-saved guest details + blanks the identity fields. */
  onClearSavedInfo?: () => void;
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
  resolvedZone: { zone: { name: string; color: string; deliveryFee: number; estimatedMinutes: number; minimumOrder: number }; inside: boolean } | null;
  /** Whether the restaurant accepts orders outside its delivery zones. Drives a
   *  soft "we may not deliver, we'll contact you" note (when on) vs a hard "not
   *  accepted" message (when off) for out-of-zone addresses. Luigi 2026-06-08. */
  acceptOutsideZoneOrders?: boolean;
  mapProvider: "leaflet" | "google";
  googleMapsApiKey: string | null;
  /** Restaurant's 2-letter country code — biases the free (Leaflet) address
   *  autocomplete so results favour the restaurant's country. */
  geocodeCountry?: string | null;
  /** Restaurant coordinates — bias the Google Places autocomplete toward the
   *  restaurant's area so nearby addresses rank first (Luigi 2026-06-13). */
  restaurantLat?: number | null;
  restaurantLng?: number | null;
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
  /** Latest selectable DATE ("YYYY-MM-DD") when the restaurant caps how far
   *  ahead a customer can pre-order (per-service max advance days). Empty =
   *  no cap. Applied as the `max` on the schedule date picker. */
  maxScheduledDate?: string;
  /** Fulfilment-time constraint for the cart (Phase 2). When set, the schedule
   *  picker offers ONLY valid days/times: a Monday-only item ⇒ only Mondays
   *  selectable; an 11:00–15:00 item ⇒ only those time slots. null = no limit. */
  fulfilDays?: number[] | null;
  fulfilFrom?: string | null;
  fulfilTo?: string | null;
  /** True when the cart holds any fulfilment-time-restricted item. Drives the
   *  NAMED "only available certain days/times" heads-up in the time section —
   *  shown even when the item is orderable right now (so the customer knows the
   *  order time is constrained before scheduling), not just when forced. R4. */
  fulfilItemsPresent?: boolean;
  /** Distinct dish names of those restricted items, for the named heads-up. */
  fulfilItemNames?: string[];
  /** Formats an absolute ms timestamp as "YYYY-MM-DDTHH:MM" wall clock in
   *  the RESTAURANT's timezone (optionally rounded up to 15 min) — the same
   *  convention the server uses to parse scheduledFor. Used for all
   *  "today"/"now" picker math; computing those in browser/UTC time let a
   *  late-night customer pick YESTERDAY (reseller report cmqa5nlv0: the
   *  date input's min was `toISOString()` = still the previous day in a
   *  UTC+2 browser at 1 AM). */
  toWallClock?: (msAbsolute: number, roundUp15?: boolean) => string;
  /** Whether the "schedule for later" picker is offered at all. False = the
   *  restaurant disabled scheduling, so only ASAP is available (the picker is
   *  hidden) — unless cateringMode forces scheduling. */
  schedulingEnabled?: boolean;
  /** Why schedule-for-later is being forced. Drives the banner copy
   *  inside the time-choice section so the customer understands
   *  whether it's a catering rule, a "we're closed right now" rule,
   *  a min-advance rule, or several at once. */
  scheduleReason?: "catering" | "closed" | "both" | "lead" | "fulfil" | null;
  /** The restaurant's next opening moment in datetime-local format
   *  (used by the "we're closed" branch of the banner copy). */
  closedNextOpenLocal?: string;
  /** Minutes between selectable scheduling slots (15 / 30 / 60 etc.).
   *  Default 15 to match GloriaFood. Without this the schedule picker
   *  is a free-form datetime-local input and customers can schedule
   *  irrational times like 3:02 PM. */
  schedulingInterval?: number;
  /** "bands" (default) shows a dropdown of fixed slots at schedulingInterval;
   *  "exact" shows a free time field so the customer can pick any minute
   *  within opening hours; "both" lets the customer toggle between the two.
   *  Per-service, from serviceSettings. Fabrizio cmpxdtl9m. */
  schedulingMode?: "bands" | "exact" | "both";
  /** Restaurant opening hours by day-of-week, used to constrain the
   *  selectable slots to actual open periods. Each row: dayOfWeek
   *  0=Sunday … 6=Saturday with HH:MM open/close strings. May include
   *  service-scoped rows (with non-null `service`) when the owner has
   *  set different hours for pickup vs delivery vs reservation — the
   *  CheckoutModal picks the matching row via pickHoursForService. */
  openingHours?: Array<{ dayOfWeek: number; openTime: string; closeTime: string; isOpen: boolean; service?: string | null }>;
  /** Restaurant IANA timezone — used to format the slot labels in
   *  the owner's local time when the customer is in a different zone. */
  restaurantTimezone?: string;
  /** Whether email is mandatory on the checkout contact form. */
  requireCustomerEmail?: boolean;
  /** Whether phone is mandatory on the checkout contact form. */
  requireCustomerPhone?: boolean;
  /** Restaurant's chosen 12h/24h display format — scheduled-time slot labels
   *  + the scheduled summary follow it (Luigi 2026-06-04). */
  hoursFormat?: "12h" | "24h";
  /** Resolved customizable delivery-address form config (which of the 9
   *  fields show + are required). Always a complete config. */
  deliveryFormConfig: DeliveryAddressConfig;
}

export function CheckoutModal({
  theme, orderType, onChangeOrderType, acceptsPickup, acceptsDelivery,
  acceptsDineIn = false, acceptsTakeOut = false,
  restaurantSlug, isSignedIn, fromMarketplace,
  cart, subtotal, totalDiscount,
  appliedPromos = [], bumpedExclusives = [], hasFreeDelivery = false, baseDeliveryFee = 0,
  deliveryFee, appliedServiceFees, taxAmount,
  tipAmount, tipPercent, setTipPercent, tipsEnabled = true, total, taxRate,
  customerInfo, setCustomerInfo, onMarketingToggle, savedGuestInfo, onClearSavedInfo,
  editingSection, setEditingSection,
  orderLoading, placeOrder,
  cardPaymentEnabled,
  acceptedMethods,
  cateringMode = false,
  cateringMinScheduledLocal,
  maxScheduledDate,
  fulfilDays = null,
  fulfilFrom = null,
  fulfilTo = null,
  fulfilItemsPresent = false,
  fulfilItemNames = [],
  toWallClock,
  schedulingEnabled = true,
  schedulingInterval = 15,
  schedulingMode = "bands",
  openingHours = [],
  requireCustomerEmail = true,
  requireCustomerPhone = true,
  hoursFormat = "24h",
  cateringNoticeHours,
  scheduleReason = null,
  closedNextOpenLocal,
  paypalEnabled,
  couponCode, setCouponCode, couponId, couponDiscount, couponLoading, applyCoupon,
  estimatedDeliveryMinutes, estimatedPickupMinutes,
  hasZones, geocoding, geocodeError, resolvedZone, acceptOutsideZoneOrders = false,
  googleMapsApiKey, geocodeCountry, restaurantLat, restaurantLng,
  deliveryFormConfig,
  reservationContext = null,
  onClose,
}: Props) {
  const tc = useTranslations("checkout");
  const tAddr = useTranslations("checkout.addressFields");
  // Maps each canonical delivery field key onto its CustomerInfo property so we
  // can render the customizable form generically (street→address, postcode→zip,
  // apartment→unit, intercom→buzzer; the rest share the same name).
  const FIELD_TO_CI: Record<DeliveryFieldKey, keyof CustomerInfo> = {
    street: "address", city: "city", postcode: "zip",
    neighbourhood: "neighbourhood", building: "building", intercom: "buzzer",
    floor: "floor", apartment: "unit", parking: "parking",
  };
  // The "extra" fields rendered as a plain grid below the street/city/postcode
  // block (street/city/postcode have bespoke inputs + the map pin).
  const EXTRA_FIELD_KEYS: DeliveryFieldKey[] = ["neighbourhood", "building", "intercom", "floor", "apartment", "parking"];
  const tOrd = useTranslations("ordering");
  const tCommon = useTranslations("common");
  // Wire every $/€/£ label in this checkout through the restaurant's
  // configured currency via the CurrencyProvider in the parent. We
  // alias to `formatCurrency` so the existing call sites in this file
  // didn't all need rewriting.
  const formatCurrency = useCurrencyFormat();
  const [showCouponField, setShowCouponField] = useState(false);
  // When the service's time mode is "both", the customer toggles between a
  // slot dropdown (false) and a free exact-time field (true). Fabrizio cmpxdtl9m.
  const [scheduleExactPref, setScheduleExactPref] = useState(false);
  // Google map + Places autocomplete use the restaurant's own key if they set
  // one, otherwise the PLATFORM key — so every account gets the full Google
  // experience with zero per-restaurant setup (Luigi 2026-06-13). Empty key ⇒
  // gracefully falls back to the free Leaflet map + OSM autocomplete. mapProvider
  // is no longer a gate: a resolved key means Google.
  const mapsKey = resolveMapsBrowserKey(googleMapsApiKey);
  const googleEnabled = !!mapsKey;
  const { isLoaded: gmapsLoaded } = useGoogleMaps(mapsKey);
  // Bias Google Places autocomplete toward the restaurant's area so nearby
  // addresses rank first (Luigi 2026-06-13: "shows far areas until I type the
  // city"). A ~±0.5° box (≈50 km) around the restaurant; soft bias, not a hard
  // restrict, so out-of-area addresses still appear if typed.
  const autocompleteOptions = useMemo<google.maps.places.AutocompleteOptions>(() => {
    const opts: google.maps.places.AutocompleteOptions = {
      fields: ["address_components", "formatted_address", "geometry"],
      types: ["address"],
    };
    if (geocodeCountry) opts.componentRestrictions = { country: geocodeCountry.toLowerCase() };
    if (restaurantLat != null && restaurantLng != null) {
      opts.bounds = {
        north: restaurantLat + 0.5, south: restaurantLat - 0.5,
        east: restaurantLng + 0.5, west: restaurantLng - 0.5,
      };
    }
    return opts;
  }, [geocodeCountry, restaurantLat, restaurantLng]);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  // Map center is set when an address is picked, but NOT updated while the
  // customer drags the pin — so the map doesn't snap back mid-drag.
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(
    customerInfo.lat != null && customerInfo.lng != null
      ? { lat: customerInfo.lat, lng: customerInfo.lng }
      : null,
  );

  // ── Free address autocomplete (Leaflet / non-Google restaurants) ────────
  // Google restaurants use Places Autocomplete; everyone else now gets
  // OpenStreetMap suggestions via our proxy route, so the delivery address
  // field is just as helpful (Fabrizio report cmpxdxhxi — Leaflet had none).
  type OsmSuggestion = { label: string; lat: number; lng: number; line1: string; city: string; postcode: string };
  const [addrSuggestions, setAddrSuggestions] = useState<OsmSuggestion[]>([]);
  const [addrSuggestOpen, setAddrSuggestOpen] = useState(false);
  const addrJustPickedRef = useRef(false);

  useEffect(() => {
    if (googleEnabled || orderType !== "delivery") { setAddrSuggestions([]); return; }
    // Don't re-query the value we just filled in from a chosen suggestion.
    if (addrJustPickedRef.current) { addrJustPickedRef.current = false; return; }
    const q = (customerInfo.address || "").trim();
    if (q.length < 3) { setAddrSuggestions([]); setAddrSuggestOpen(false); return; }
    const ctrl = new AbortController();
    const id = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q });
        if (geocodeCountry) params.set("country", geocodeCountry);
        const res = await fetch(`/api/public/geocode/search?${params.toString()}`, { signal: ctrl.signal });
        const data = await res.json().catch(() => ({}));
        setAddrSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
        setAddrSuggestOpen(true);
      } catch { /* aborted / network — leave list as-is */ }
    }, 400);
    return () => { clearTimeout(id); ctrl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerInfo.address, googleEnabled, orderType, geocodeCountry]);

  const pickAddrSuggestion = (sug: OsmSuggestion) => {
    addrJustPickedRef.current = true;
    setAddrSuggestOpen(false);
    setAddrSuggestions([]);
    setMapCenter({ lat: sug.lat, lng: sug.lng });
    setCustomerInfo({
      ...customerInfo,
      address: sug.line1 || customerInfo.address,
      city: sug.city || customerInfo.city,
      zip: sug.postcode || customerInfo.zip,
      lat: sug.lat,
      lng: sug.lng,
    });
  };

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

    // Capture the precise coordinates so we can show + fine-tune a map pin
    // and send exact coords to the driver.
    const loc = place.geometry?.location;
    const lat = loc ? loc.lat() : null;
    const lng = loc ? loc.lng() : null;
    if (lat != null && lng != null) setMapCenter({ lat, lng });

    setCustomerInfo({
      ...customerInfo,
      address: street || place.formatted_address || customerInfo.address,
      city: city || customerInfo.city,
      zip: zip || customerInfo.zip,
      ...(lat != null && lng != null ? { lat, lng } : {}),
    });
  };

  const toggleEdit = (s: Exclude<SectionKey, null>) =>
    setEditingSection(editingSection === s ? null : s);

  const contactSummary = customerInfo.name && customerInfo.phone
    ? `${customerInfo.name} · ${customerInfo.phone}${customerInfo.email ? ` · ${customerInfo.email}` : ""}`
    : null;

  const orderingSummary = orderType === "delivery"
    ? (customerInfo.address
        ? tc("deliveryTo", { address: `${customerInfo.address}${customerInfo.city ? ", " + customerInfo.city : ""}` })
        : tc("deliveryAddAddress"))
    : orderType === "dine_in" ? tOrd("dineIn")
    : orderType === "take_out" ? tOrd("takeOut")
    : tOrd("pickup");

  // Was hardcoded English ("ASAP · ~20 min" / "Scheduled for …") — reseller
  // report cmq3s5xjl: an Italian customer must read "Appena possibile".
  // tc("asap") carries the per-locale phrase; the rest is i18n'd too.
  const timeSummary = customerInfo.scheduledFor
    ? (() => {
        // Format the scheduled time in the restaurant's chosen 12h/24h format
        // (NOT the browser default) so it matches the slot picker + Hours page.
        const [dPart, tPart] = customerInfo.scheduledFor.split("T");
        const dateLabel = dPart
          ? new Date(`${dPart}T00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
          : "";
        return tc("timeScheduledFor", { when: `${dateLabel} ${formatTime((tPart || "").slice(0, 5), hoursFormat)}`.trim() });
      })()
    : cateringMode
      ? tc("timeCateringNotice", { hours: cateringNoticeHours ?? 24 })
      : `${tc("asap")} · ~${orderType === "delivery" ? estimatedDeliveryMinutes : estimatedPickupMinutes} min`;

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
          ? (orderType === "delivery" ? tc("cardOnDelivery") : tc("cardOnPickup"))
          : (orderType === "delivery" ? tc("cashOnDelivery") : tc("cashOnPickup"));

  const tipsSummary = tipAmount > 0
    ? `${tipPercent}% (${formatCurrency(tipAmount)})`
    : tc("noTip");

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

        {/* Reserve-then-order: this checkout confirms a table booking AND pays
            for the food in one go. Make that explicit up top. Luigi 2026-06-08. */}
        {reservationContext && (
          <div className="rounded-xl px-4 py-3 mb-3 text-sm text-white" style={{ backgroundColor: theme.primaryColor }}>
            <div className="font-bold">{tc("reservationTitle")}</div>
            <div className="opacity-95">
              {tc("reservationDetail", {
                date: reservationContext.date,
                time: formatTime(reservationContext.time, hoursFormat),
                n: reservationContext.partySize,
              })}
            </div>
          </div>
        )}

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
                  {appliedPromos.length + (hasFreeDelivery && baseDeliveryFee > 0 ? 1 : 0) === 1
                    ? tc("unlockedPromoOne")
                    : tc("unlockedPromoMany")}
                </div>
              </div>
              <div className="space-y-1.5">
                {appliedPromos
                  // Free Delivery promos have discount=0 — surface them via
                  // the separate "Free Delivery" line below instead so the
                  // savings amount is accurate (it's the delivery fee).
                  .filter((p) => p.type !== "free_delivery" && p.discount > 0)
                  .map((p) =>
                    // Deal applied more than once → list each freed item with its
                    // own discount, so the customer sees exactly what's free
                    // instead of one mystery lump sum. Luigi 2026-06-07.
                    p.breakdown && p.breakdown.length > 1 ? (
                      <div key={p.promoId} className="space-y-1">
                        <div className="flex items-center gap-1.5 text-emerald-700 font-semibold text-xs">
                          <span aria-hidden>✓</span>
                          <span className="truncate">{p.name}</span>
                          {p.couponCode && (
                            <span className="font-mono bg-white border border-emerald-200 text-emerald-700 rounded px-1.5 py-0.5 ml-1">
                              {p.couponCode}
                            </span>
                          )}
                        </div>
                        {p.breakdown.map((b, i) => (
                          <div key={`${p.promoId}-${i}`} className="flex items-center justify-between text-xs pl-5">
                            <span className="text-emerald-700 truncate">{b.name}</span>
                            <span className="font-semibold text-emerald-800 whitespace-nowrap ml-2">
                              − {formatCurrency(b.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
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
                    ),
                  )}
                {hasFreeDelivery && baseDeliveryFee > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 text-emerald-700 font-medium">
                      <span aria-hidden>🚚</span>
                      <span>{tc("freeDelivery")}</span>
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

        {/* Only-one-exclusive-per-order notice. When two exclusive deals both
            qualified we apply the bigger one and explain the other was set
            aside, so the customer isn't left wondering. Luigi 2026-06-07. */}
        {bumpedExclusives.length > 0 && (
          <div className="px-5 pt-3 flex-shrink-0">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              ℹ️ {tc("exclusiveBumpedNote", {
                winner: bumpedExclusives[0].winnerName,
                names: bumpedExclusives.map((b) => b.name).join(", "),
              })}
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
                {/* Silent guest "remember me" (Luigi 2026-06-10): we pre-filled
                    these fields from details this device saved on a prior order.
                    Offer a one-tap "Not you? Clear" so a different person on a
                    shared device wipes them and starts fresh. */}
                {savedGuestInfo && onClearSavedInfo && (
                  <div className="pt-3 -mb-1 text-xs text-gray-500">
                    {tc("rememberedHint")}{" "}
                    <button
                      type="button"
                      onClick={onClearSavedInfo}
                      className="font-semibold underline hover:no-underline"
                      style={{ color: theme.primaryColor }}
                    >
                      {tc("rememberedClear")}
                    </button>
                  </div>
                )}
                {/* GloriaFood-parity (Luigi 2026-06-01): first + last
                    name as SEPARATE inputs. DB schema unchanged —
                    customerInfo.name still holds the concatenated
                    "First Last" string downstream code already expects,
                    so the server, kitchen receipts, status emails, and
                    every existing consumer keep working without an
                    API contract change. */}
                <div className="grid grid-cols-2 gap-2 pt-3">
                  <input
                    id="checkout-contact-first-name"
                    required
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                    style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                    placeholder={`${tc("firstNamePlaceholder")} *`}
                    value={(customerInfo.name || "").split(" ")[0] ?? ""}
                    onChange={(e) => {
                      const first = e.target.value;
                      const parts = (customerInfo.name || "").split(" ");
                      const last = parts.slice(1).join(" ");
                      setCustomerInfo({
                        ...customerInfo,
                        name: [first, last].filter(Boolean).join(" "),
                      });
                    }}
                  />
                  <input
                    id="checkout-contact-last-name"
                    required
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                    style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                    placeholder={`${tc("lastNamePlaceholder")} *`}
                    value={(customerInfo.name || "").split(" ").slice(1).join(" ")}
                    onChange={(e) => {
                      const last = e.target.value;
                      const first = (customerInfo.name || "").split(" ")[0] ?? "";
                      setCustomerInfo({
                        ...customerInfo,
                        name: [first, last].filter(Boolean).join(" "),
                      });
                    }}
                  />
                  <input
                    id="checkout-contact-phone"
                    type="tel"
                    inputMode="tel"
                    required={requireCustomerPhone}
                    className="col-span-2 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                    style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                    placeholder={`${tc("phonePlaceholder")}${requireCustomerPhone ? " *" : ""}`}
                    value={customerInfo.phone}
                    // Phone numbers only — strip letters and stray symbols as the
                    // customer types (allow digits, spaces, + - ( ) for intl formats).
                    onChange={e => setCustomerInfo({ ...customerInfo, phone: e.target.value.replace(/[^\d+()\-.\s]/g, "") })}
                  />
                  <input
                    id="checkout-contact-email"
                    type="email"
                    required={requireCustomerEmail}
                    className="col-span-2 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                    style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                    placeholder={`${tc("emailPlaceholder")}${requireCustomerEmail ? " *" : " (optional)"}`}
                    value={customerInfo.email}
                    onChange={e => setCustomerInfo({ ...customerInfo, email: e.target.value })}
                  />
                </div>
                {/* Marketing-consent opt-in (Luigi/Fabrizio 2026-06-02
                    GloriaFood parity). Shown only when the customer
                    has typed an email — there's nothing to opt in to
                    if we have no inbox to send to. Stored on
                    Customer.marketingConsent + .marketingConsentAt
                    server-side so it survives across orders and can
                    be flipped back from the customer's account profile
                    or the email unsubscribe link. */}
                {customerInfo.email.trim().length > 0 && (
                  <label className="mt-3 flex items-start gap-2 text-xs text-gray-600 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      // Defaults to TRUE if the field is somehow undefined
                      // — the explicit `false` value from a user uncheck
                      // is preserved (false ?? true is false in JS). This
                      // belt-and-suspenders means a stale bundle or any
                      // missing-field path still pre-ticks the box.
                      checked={customerInfo.marketingConsent ?? true}
                      onChange={e =>
                        onMarketingToggle
                          ? onMarketingToggle(e.target.checked)
                          : setCustomerInfo({ ...customerInfo, marketingConsent: e.target.checked })
                      }
                      style={{ accentColor: theme.primaryColor }}
                    />
                    <span>{tOrd("marketingConsentLabel")}</span>
                  </label>
                )}
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
                {/* Order-type selector — lists every channel the restaurant
                    accepts (pickup / delivery / dine-in / take-out). Only
                    renders when there's an actual choice (2+ enabled).
                    LOCKED OFF when this checkout is confirming a table booking
                    (reservationContext): a reserve-then-order is ALWAYS dine-in
                    — you can't book a table for pickup/delivery/take-out — so we
                    hide the switcher entirely and the order stays dine-in.
                    Luigi 2026-06-08. */}
                {!reservationContext && (() => {
                  const opts = [
                    acceptsPickup && { value: "pickup" as const, icon: <ShoppingBag className="w-4 h-4" />, label: tOrd("pickup") },
                    acceptsDelivery && { value: "delivery" as const, icon: <Truck className="w-4 h-4" />, label: tOrd("delivery") },
                    acceptsDineIn && { value: "dine_in" as const, icon: <Utensils className="w-4 h-4" />, label: tOrd("dineIn") },
                    acceptsTakeOut && { value: "take_out" as const, icon: <Package className="w-4 h-4" />, label: tOrd("takeOut") },
                  ].filter(Boolean) as Array<{ value: "pickup" | "delivery" | "dine_in" | "take_out"; icon: React.ReactNode; label: string }>;
                  return opts.length > 1 && onChangeOrderType ? (
                  <div className="pt-3 grid grid-cols-2 gap-2">
                    {opts.map((opt) => (
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
                  ) : null;
                })()}
                {orderType === "delivery" && (
                  <div className="pt-3 space-y-2">
                    {/* Street address — primary field; drives autocomplete +
                        map pin + zone resolution. Rendered only when the
                        restaurant's form config shows it. */}
                    {deliveryFormConfig.street.show && (
                      googleEnabled && gmapsLoaded ? (
                        <Autocomplete
                          onLoad={(ac) => { autocompleteRef.current = ac; }}
                          onPlaceChanged={handlePlaceChanged}
                          options={autocompleteOptions}
                        >
                          <input
                            id="checkout-delivery-address"
                            type="text" placeholder={`${tc("startTypingAddress")}${deliveryFormConfig.street.required ? " *" : ""}`}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                            style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                            value={customerInfo.address}
                            onChange={e => setCustomerInfo({ ...customerInfo, address: e.target.value })}
                          />
                        </Autocomplete>
                      ) : (
                        <div className="relative">
                          <input
                            id="checkout-delivery-address"
                            type="text" autoComplete="off"
                            placeholder={`${tc("startTypingAddress")}${deliveryFormConfig.street.required ? " *" : ""}`}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                            style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                            value={customerInfo.address}
                            onChange={e => setCustomerInfo({ ...customerInfo, address: e.target.value })}
                            onFocus={() => { if (addrSuggestions.length) setAddrSuggestOpen(true); }}
                            onBlur={() => setTimeout(() => setAddrSuggestOpen(false), 150)}
                          />
                          {addrSuggestOpen && addrSuggestions.length > 0 && (
                            <ul className="absolute z-30 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                              {addrSuggestions.map((sug, i) => (
                                <li key={`${sug.lat}-${sug.lng}-${i}`}>
                                  <button
                                    type="button"
                                    onMouseDown={(e) => { e.preventDefault(); pickAddrSuggestion(sug); }}
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0"
                                  >
                                    <span className="font-medium text-gray-800">{sug.line1 || sug.label}</span>
                                    {sug.city && <span className="text-gray-500"> · {sug.city}{sug.postcode ? ` ${sug.postcode}` : ""}</span>}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )
                    )}
                    {(deliveryFormConfig.city.show || deliveryFormConfig.postcode.show) && (
                      <div className="grid grid-cols-2 gap-2">
                        {deliveryFormConfig.city.show && (
                          <input
                            id="checkout-delivery-city"
                            type="text" placeholder={`${tAddr("city")}${deliveryFormConfig.city.required ? " *" : ""}`}
                            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                            style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                            value={customerInfo.city}
                            onChange={e => setCustomerInfo({ ...customerInfo, city: e.target.value })}
                          />
                        )}
                        {deliveryFormConfig.postcode.show && (
                          <input
                            id="checkout-delivery-zip"
                            type="text" placeholder={`${tAddr("postcode")}${deliveryFormConfig.postcode.required ? " *" : ""}`}
                            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                            style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                            value={customerInfo.zip}
                            onChange={e => setCustomerInfo({ ...customerInfo, zip: e.target.value })}
                          />
                        )}
                      </div>
                    )}
                    {/* Map tiles are always the free Leaflet/OSM pin below now
                        (Luigi 2026-06-13). Google is reserved for autocomplete +
                        distance only, to avoid per-map-load cost. */}
                    {/* Draggable delivery pin — free Leaflet/OSM map for EVERY
                        restaurant now. Appears once an address is picked; drag/
                        click to set the exact door, coords ride along with the
                        order. Google autocomplete above still fills the address. */}
                    {deliveryFormConfig.street.show && mapCenter && (
                      <div className="rounded-lg overflow-hidden border border-gray-200">
                        <CheckoutLeafletPin
                          center={mapCenter}
                          lat={customerInfo.lat ?? null}
                          lng={customerInfo.lng ?? null}
                          onMove={(la, ln) => setCustomerInfo({ ...customerInfo, lat: la, lng: ln })}
                        />
                        <p className="text-xs text-gray-500 px-2 py-1.5 bg-gray-50">{tc("dragPinHint")}</p>
                      </div>
                    )}
                    {/* Customizable extra address fields (Neighbourhood, Block/
                        Building, Intercom, Floor, Apartment, Where to park).
                        Each renders only when the restaurant's form config
                        shows it; a "*" suffix marks the required ones. All flow
                        into the structured deliveryAddressData on submit. */}
                    {EXTRA_FIELD_KEYS.some((k) => deliveryFormConfig[k].show) && (
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        {EXTRA_FIELD_KEYS.filter((k) => deliveryFormConfig[k].show).map((key) => {
                          const prop = FIELD_TO_CI[key];
                          const req = deliveryFormConfig[key].required;
                          return (
                            <input
                              key={key}
                              type="text"
                              placeholder={`${tAddr(key)}${req ? " *" : ""}`}
                              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                              style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                              value={(customerInfo[prop] as string) || ""}
                              onChange={e => setCustomerInfo({ ...customerInfo, [prop]: e.target.value })}
                            />
                          );
                        })}
                      </div>
                    )}
                    {/* Delivery instructions — separate from order notes
                        (which is kitchen-facing). These reach the driver
                        at dispatch time. */}
                    <textarea
                      placeholder={tc("deliveryInstructionsPlaceholder")}
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
                        {resolvedZone.zone.minimumOrder > 0 && (
                          <> {tc("zoneMinimum", { min: formatCurrency(resolvedZone.zone.minimumOrder) })}</>
                        )}
                      </p>
                    )}
                    {hasZones && resolvedZone && !resolvedZone.inside && (
                      acceptOutsideZoneOrders ? (
                        // Out-of-zone orders accepted → soft note; the order can
                        // still be placed and the store follows up. Luigi 2026-06-08.
                        <p className="text-xs text-amber-800">
                          <strong>{tc("outsideStandard")}</strong> {tc("outsideAreaWarning", { fee: formatCurrency(resolvedZone.zone.deliveryFee), minutes: resolvedZone.zone.estimatedMinutes })}
                          {resolvedZone.zone.minimumOrder > 0 && (
                            <> {tc("zoneMinimum", { min: formatCurrency(resolvedZone.zone.minimumOrder) })}</>
                          )}
                          {" "}{tc("outsideMayContact")}
                        </p>
                      ) : (
                        // Out-of-zone orders NOT accepted → hard message.
                        <p className="text-xs text-red-600">
                          <strong>{tc("outsideNotAcceptedTitle")}</strong> {tc("outsideNotAcceptedBody")}
                        </p>
                      )
                    )}
                  </div>
                )}
              </SectionCard>

              {/* AVAILABLE TIME CHOICE — hidden for a reserve-then-order: the
                  slot is LOCKED to the booking time (shown in the banner above),
                  so we never offer a conflicting time picker. Luigi 2026-06-08. */}
              {!reservationContext && (
              <SectionCard
                icon={<Clock className="w-4 h-4" />}
                label={tc("availableTimeChoice")}
                summary={timeSummary}
                onEdit={() => toggleEdit("time")}
                expanded={editingSection === "time"}
                primary={theme.primaryColor}
              >
                <div className="pt-3 space-y-2">
                  {(cateringMode || fulfilItemsPresent) && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-800 px-3 py-2 text-xs space-y-1">
                      {/* Forced-schedule reason (closed / catering / lead). The
                          pure-fulfil case is covered by the named line below, so
                          it's skipped here to avoid a generic + named duplicate. */}
                      {cateringMode && scheduleReason !== "fulfil" && (
                        <div>
                          {scheduleReason === "closed" ? (
                            <>
                              {tc("closedSchedulePrompt")}
                              {closedNextOpenLocal && (
                                <span className="block mt-1 text-amber-900 font-semibold">
                                  {tc("nextOpening", {
                                    date: new Date(closedNextOpenLocal).toLocaleString(undefined, {
                                      weekday: "short", month: "short", day: "numeric",
                                      hour: "numeric", minute: "2-digit",
                                    }),
                                  })}
                                </span>
                              )}
                            </>
                          ) : scheduleReason === "both" ? (
                            tc.rich("closedAndCatering", {
                              hours: cateringNoticeHours ?? 24,
                              strong: (c) => <strong>{c}</strong>,
                            })
                          ) : scheduleReason === "lead" ? (
                            tc("leadTimePrompt")
                          ) : (
                            tc.rich("cateringOnly", {
                              hours: cateringNoticeHours ?? 24,
                              strong: (c) => <strong>{c}</strong>,
                            })
                          )}
                        </div>
                      )}
                      {/* Named time-restriction heads-up — shown whenever the cart
                          holds a fulfilment-restricted item, named, even when it's
                          orderable now. Replaces the old generic fulfil prompt. R4. */}
                      {fulfilItemsPresent && (
                        <div>
                          {tc.rich("fulfilSchedulePromptNamed", {
                            items: fulfilItemNames.join(", "),
                            strong: (c) => <strong>{c}</strong>,
                          })}
                        </div>
                      )}
                    </div>
                  )}
                  {!schedulingEnabled ? (
                    <div className="pt-1 text-xs text-gray-500">{tc("asapOnly")}</div>
                  ) : (<>
                  <label className="block text-xs text-gray-500">{tc("scheduleForLaterOptional")}</label>
                  {/* Date + time-slot picker. Replaces the free-form
                      datetime-local input so customers can no longer
                      schedule 3:02 PM — they pick from the restaurant's
                      configured interval (10/15/30/60 min) within open
                      hours. The combined value is still written back to
                      customerInfo.scheduledFor in datetime-local format
                      so downstream code (validation, server) doesn't
                      need to change. */}
                  {(() => {
                    const parts = (customerInfo.scheduledFor || "").split("T");
                    const datePart = parts[0] || "";
                    const timePart = (parts[1] || "").slice(0, 5);
                    // "Now" in the RESTAURANT's wall clock — the convention
                    // every scheduledFor string uses. Browser-local fallback
                    // only when the parent didn't supply the helper.
                    const wallClock = (ms: number): string => {
                      if (toWallClock) return toWallClock(ms);
                      const d = new Date(ms);
                      const pad = (n: number) => String(n).padStart(2, "0");
                      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                    };
                    const todayISO = wallClock(Date.now()).split("T")[0];
                    const minDate = cateringMode && cateringMinScheduledLocal
                      ? cateringMinScheduledLocal.split("T")[0]
                      : todayISO;
                    const minTimeForDate = (() => {
                      // If the chosen date is today, slots in the past
                      // are off-limits AND the earliest selectable slot
                      // must be at least the restaurant's standard
                      // prep time away from now — pickup uses
                      // estimatedPickupMinutes, delivery uses
                      // estimatedDeliveryMinutes. Otherwise the
                      // dropdown could offer "5 minutes from now" for
                      // a 20-min-prep restaurant, which is impossible.
                      // Luigi 2026-06-01: "first pickup time should
                      // be at least standard pickup time away".
                      if (datePart === todayISO) {
                        const prepMinutes = Math.max(
                          0,
                          orderType === "delivery"
                            ? estimatedDeliveryMinutes
                            : estimatedPickupMinutes,
                        );
                        return wallClock(Date.now() + prepMinutes * 60_000).split("T")[1];
                      }
                      if (cateringMode && cateringMinScheduledLocal && datePart === cateringMinScheduledLocal.split("T")[0]) {
                        return cateringMinScheduledLocal.split("T")[1] || "00:00";
                      }
                      return "00:00";
                    })();
                    // Build slots for this date from openingHours + interval.
                    // Service-aware lookup: a restaurant with separate
                    // pickup vs delivery hours will surface only the
                    // window relevant to the active orderType.
                    let slots: string[] = [];
                    // Opening window for this date — hoisted so the "Exact time"
                    // mode can bound its free time field to the same hours.
                    let winOpen = "10:00";
                    let winClose = "22:00";
                    if (datePart) {
                      const dow = new Date(`${datePart}T12:00:00`).getDay();
                      const serviceKind = orderType === "delivery" ? "delivery" : "pickup";
                      const row = pickHoursForService(openingHours as any, dow, serviceKind);
                      const effective = row && row.isOpen ? row : null;
                      winOpen = effective?.openTime || "10:00";
                      winClose = effective?.closeTime || "22:00";
                      const [oh, om] = winOpen.split(":").map(Number);
                      const [ch, cm] = winClose.split(":").map(Number);
                      const start = (oh ?? 10) * 60 + (om ?? 0);
                      let end = (ch ?? 22) * 60 + (cm ?? 0);
                      // Midnight-wrap fix (Luigi 2026-06-01): when the
                      // close time is at or before the open time, the
                      // window crosses midnight (e.g. 11 AM → 12 AM =
                      // 11:00 → 00:00, meaning "open until midnight at
                      // end of day"). Without rolling `end` past
                      // midnight the loop emits zero slots and the
                      // dropdown reads "Closed this day". pickHoursForService
                      // already stamps closesNextDay=true defensively
                      // for the same shape; we trust either signal here.
                      if (end <= start) end += 24 * 60;
                      const step = Math.max(5, Math.min(120, schedulingInterval || 15));
                      const minMin = (() => {
                        const [mh, mm] = minTimeForDate.split(":").map(Number);
                        return (mh ?? 0) * 60 + (mm ?? 0);
                      })();
                      for (let m = start; m <= end - step; m += step) {
                        if (m < minMin) continue;
                        const hh = Math.floor(m / 60) % 24;
                        const mm = m % 60;
                        slots.push(`${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
                      }
                    }
                    // Phase 2 — restrict the time slots to the cart's fulfilment
                    // window (e.g. an 11:00–15:00 item shows only those slots).
                    if (fulfilFrom && fulfilTo) {
                      slots = slots.filter((s) =>
                        fulfilFrom <= fulfilTo ? s >= fulfilFrom && s < fulfilTo : s >= fulfilFrom || s < fulfilTo,
                      );
                    }
                    // Day-restricted fulfilment ⇒ offer a dropdown of ONLY the valid
                    // upcoming dates (a Monday-only item lists just the next Mondays).
                    const dayRestricted = Array.isArray(fulfilDays) && fulfilDays.length > 0;
                    const validDates: string[] = (() => {
                      if (!dayRestricted) return [];
                      const out: string[] = [];
                      const start = new Date(`${minDate}T12:00:00`);
                      const maxD = maxScheduledDate ? new Date(`${maxScheduledDate}T12:00:00`) : null;
                      for (let i = 0; i < 120 && out.length < 16; i++) {
                        const d = new Date(start);
                        d.setDate(start.getDate() + i);
                        if (maxD && d > maxD) break;
                        if (fulfilDays!.includes(d.getDay())) {
                          out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
                        }
                      }
                      return out;
                    })();
                    const setDate = (d: string) => {
                      // When date changes, snap time to first valid slot if current time
                      // is outside the new slot set.
                      let newTime = timePart;
                      if (slots.length > 0 && !slots.includes(timePart)) newTime = slots[0];
                      setCustomerInfo({ ...customerInfo, scheduledFor: d ? `${d}T${newTime || "12:00"}` : "" });
                    };
                    const setTime = (tt: string) => {
                      const d = datePart || todayISO;
                      setCustomerInfo({ ...customerInfo, scheduledFor: `${d}T${tt}` });
                    };
                    // Exact-time mode bounds: earliest = later of opening time
                    // and the today/lead cutoff; latest = closing time (capped
                    // at 23:59 when the window wraps past midnight). HH:MM strings
                    // compare lexically because they're zero-padded.
                    const exactMode = schedulingMode === "exact"
                      || (schedulingMode === "both" && scheduleExactPref);
                    let exactMin = winOpen > minTimeForDate ? winOpen : minTimeForDate;
                    let exactMax = winClose <= winOpen ? "23:59" : winClose;
                    // Tighten the free-time bounds to the fulfilment window too.
                    if (fulfilFrom && fulfilFrom > exactMin) exactMin = fulfilFrom;
                    if (fulfilTo && fulfilTo < exactMax) exactMax = fulfilTo;
                    return (
                      <>
                      {schedulingMode === "both" && (
                        <div className="flex gap-1 mb-2 p-0.5 bg-gray-100 rounded-lg text-xs font-medium">
                          {([["slots", false], ["exact", true]] as const).map(([k, pref]) => (
                            <button
                              key={k}
                              type="button"
                              onClick={() => setScheduleExactPref(pref)}
                              className={`flex-1 py-1.5 rounded-md transition ${
                                scheduleExactPref === pref ? "bg-white shadow-sm text-gray-900" : "text-gray-500"
                              }`}
                            >
                              {k === "slots" ? tc("scheduleModeSlots") : tc("scheduleModeExact")}
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        {dayRestricted ? (
                          <select
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                            style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                            value={datePart}
                            onChange={(e) => setDate(e.target.value)}
                          >
                            {!validDates.includes(datePart) && <option value="">{tc("pickADateFirst")}</option>}
                            {validDates.map((d) => (
                              <option key={d} value={d}>
                                {new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="date"
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                            style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                            min={minDate}
                            max={maxScheduledDate || undefined}
                            value={datePart}
                            onChange={(e) => setDate(e.target.value)}
                          />
                        )}
                        {exactMode ? (
                          <input
                            type="time"
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                            style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                            value={timePart}
                            min={exactMin}
                            max={exactMax}
                            disabled={!datePart}
                            onChange={(e) => setTime(e.target.value)}
                          />
                        ) : (
                          <select
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                            style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                            value={timePart}
                            onChange={(e) => setTime(e.target.value)}
                            disabled={!datePart || slots.length === 0}
                          >
                            {slots.length === 0 ? (
                              <option value="">{datePart ? tc("closedThisDay") : tc("pickADateFirst")}</option>
                            ) : (
                              <>
                                <option value="">{tc("pickATimePlaceholder")}</option>
                                {slots.map((s) => (
                                  <option key={s} value={s}>{formatTime(s, hoursFormat)}</option>
                                ))}
                              </>
                            )}
                          </select>
                        )}
                      </div>
                      </>
                    );
                  })()}
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
                  </>)}
                </div>
              </SectionCard>
              )}

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
                      label: orderType === "delivery" ? tc("cashOnDelivery") : tc("cashOnPickup"),
                    },
                    {
                      slug: "card_in_person",
                      value: "card_in_person",
                      label: orderType === "delivery" ? tc("cardOnDelivery") : tc("cardOnPickup"),
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
                  // Only offer a method that's actually usable. online_card /
                  // paypal can be in the restaurant's accepted list (e.g. legacy
                  // Connect data) while the capability is OFF — offering them
                  // would create a ghost order that never gets paid or reaches
                  // the kitchen. Hide them unless truly available. (Luigi 2026-06-04)
                  const visible = all.filter(
                    (p) =>
                      acceptedMethods.includes(p.slug) &&
                      !(p.slug === "online_card" && !cardPaymentEnabled) &&
                      !(p.slug === "paypal" && !paypalEnabled),
                  );
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
                    {tc("cardComingSoon", { type: orderType === "delivery" ? tOrd("delivery").toLowerCase() : tOrd("pickup").toLowerCase() })}
                  </div>
                )}
                {customerInfo.paymentMethod === "paypal" && !paypalEnabled && (
                  <div className="mt-2 p-2.5 bg-amber-50 rounded-lg text-xs text-amber-800 flex items-start gap-2">
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
                      <span>{tc("customAmount")}</span>
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
                <div className="flex justify-between text-gray-600"><span>{tc("subTotal")}</span><span>{formatCurrency(subtotal)}</span></div>
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
                          <span className="text-emerald-600 font-semibold">{tc("free")}</span>
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
                  <div className="flex justify-between text-gray-600"><span>{tc("taxWithRate", { rate: taxRate })}</span><span>{formatCurrency(taxAmount)}</span></div>
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
