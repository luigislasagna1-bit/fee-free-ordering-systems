"use client";
import { useRef, useState, useEffect } from "react";
import dynamic from "next/dynamic";
import {
  X, User, Truck, ShoppingBag, Clock, CreditCard, Heart, Edit2, Tag,
  AlertCircle, Loader2, ChevronDown, Utensils, Package, Trash2,
} from "lucide-react";
import { useCurrencyFormat } from "@/lib/currency-context";
import { computeApplied } from "@/lib/reward-math";
import { childBuildLines } from "@/lib/bundle-child-lines";
import { pickHoursForService } from "@/lib/service-hours";
import { rowIntervals } from "@/lib/restaurant-hours";
import { parseTheme } from "@/lib/theme";
import { formatTime } from "@/lib/format-time";
import { rangeWindowMinutes } from "@/lib/slot-modes";
import { buildDaySlots } from "@/lib/schedule-slots";
import { useGoogleMaps } from "@/lib/use-google-maps";
import { resolveMapsBrowserKey } from "@/lib/maps-key";
import { useTranslations } from "next-intl";
import { HelpTip } from "@/components/HelpTip";
import {
  type DeliveryFieldKey,
  type DeliveryAddressConfig,
  composeStreetLine,
} from "@/lib/delivery-address-fields";

// Leaflet pin is dynamically imported (ssr:false) — Leaflet touches `window`,
// so it must never be in the server bundle. Google's pin loads statically above.
const CheckoutLeafletPin = dynamic(() => import("./CheckoutLeafletPin"), { ssr: false });

/** Places predictions via the callback form so statuses keep their meaning:
 *  no matches = an empty list (normal), anything else = reject, which flips
 *  the session to the OSM proxy fallback. */
function svcGetPredictions(
  svc: google.maps.places.AutocompleteService,
  req: google.maps.places.AutocompletionRequest,
): Promise<google.maps.places.AutocompletePrediction[]> {
  return new Promise((resolve, reject) => {
    svc.getPlacePredictions(req, (preds, status) => {
      const S = google.maps.places.PlacesServiceStatus;
      if (status === S.OK || status === S.ZERO_RESULTS) resolve(preds ?? []);
      else reject(new Error(String(status)));
    });
  });
}

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
  /** Which time-selection style the customer is using when several are
   *  enabled ("bands" | "range" | "exact"); "" = the service's first enabled
   *  style. Sent as scheduledStyle so the server stamps range windows only
   *  when the customer actually picked one. Luigi 2026-07-04. */
  scheduledStyle: string;
  /** Extra structured fields for the customizable delivery form. Shown only
   *  when the restaurant's deliveryFormConfig enables them. (street→address,
   *  city→city, postcode→zip, apartment→unit, intercom→buzzer.) */
  neighbourhood: string; building: string; floor: string; parking: string;
  /** Precise delivery pin coords (Google-maps restaurants). */
  lat: number | null;
  lng: number | null;
};

type CartLine = {
  menuItem: { id: string; name: string; isRefundableDeposit?: boolean; depositAmount?: number | null };
  variant?: { name: string };
  quantity: number;
  lineTotal: number;
  /** "+ …" build labels (pizza-builder selections — half/half, toppings,
   *  sauce, cheese — or plain modifier picks), pre-computed by the parent so
   *  the checkout summary shows the SAME build as the cart drawer. The
   *  checkout used to drop pizza toppings entirely (Luigi 2026-07-06).
   *  Empty/absent for bundles, which render their children via bundleItems. */
  modifierLabels?: string[];
  /** Bundle line item (Promo Type 8 / 13) — when true the summary
   *  renders this as a parent row + indented children instead of a
   *  single line. The child names come from `bundleItems[]`. */
  isBundle?: boolean;
  bundlePromoName?: string;
  bundleItems?: Array<{
    name: string;
    variantName?: string;
    specialityFee?: number;
    // A combo/bundle child's full build (crust/sauce/half-half/toppings/flavour)
    // is pre-flattened here so checkout shows the same build as the cart — the
    // customer verifies before paying (Luigi 2026-07-08).
    modifiers?: Array<{ name: string; priceAdjustment?: number }>;
    notes?: string;
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
    breakdown?: Array<{ menuItemId: string; name: string; amount: number; lineKey?: string }>;
    /** reward_credit only: store credit earned on completion (not a discount). */
    creditAmount?: number;
    /** meal_bundle only: the concrete bundles formed, so the summary can GROUP the
     *  bundled lines under a "2 pizzas $30 · $30.00 · saved X" card (GloriaFood
     *  parity, Luigi 2026-07-07). `parts` map to cart lines by lineKey. */
    bundles?: Array<{ price: number; saved: number; parts: Array<{ lineKey?: string; menuItemId: string }> }>;
  }>;
  /** "🎯 Add {amount} more to unlock {name}!" nudge — the SAME almost-there
   *  prompt shown on the menu, surfaced at checkout too (where the customer is
   *  looking at the delivery fee and most likely to add one more item to hit
   *  the free-delivery / promo threshold). Pre-translated by the parent; null
   *  when the cart isn't within range of any promo. Luigi 2026-07-07. */
  promoNudgeText?: string | null;
  /** Pre-translated service-conflict message ("'X' is only available for
   *  delivery — please remove it from your cart to continue") — non-null when
   *  a cart line's dish/category isn't offered for the SELECTED ordering
   *  method. Renders a red banner and disables Place order, so the customer
   *  never fills in the whole checkout only to hit the server rejection
   *  (Luigi 2026-07-11, ristorante-test). Recomputed by the parent when the
   *  method changes (including via the in-checkout method switcher). */
  serviceConflictText?: string | null;
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
  /** Sum of refundable-deposit portions across the cart — charged but NOT taxed,
   *  shown as its own line and already folded into `total`. Luigi 2026-07-08. */
  depositLinesTotal?: number;
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
  /** Reward Dollars (store credit) — a signed-in customer's spendable balance +
   *  redeem settings, surfaced by apply-promos. null → no balance / feature off
   *  → the spend control is hidden entirely. Luigi 2026-06-27. */
  rewardInfo?: { balance: number; minRedeemBalance: number; maxRedeemPercent: number; labelSingular: string | null; labelPlural: string | null; redeemExcludedTotal?: number } | null;
  /** How much credit the customer chose to apply on this order (default 0). */
  creditToApply?: number;
  setCreditToApply?: (n: number) => void;
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
  /** ShipDay-dispatched DELIVERY order (Luigi 2026-07-04): the driver only
   *  picks up + drops off — no at-door collection — so the order must be
   *  prepaid online. At-door methods are hidden, the cash safety-net is
   *  suppressed, and a short note explains why. */
  prepaidDeliveryOnly?: boolean;
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
  /** Straight-line km from the store to the typed delivery address (null until
   *  geocoded). Appended to the zone line so the customer sees how far they are. */
  distanceFromStoreKm?: number | null;
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
  /** Restaurant's town — anchors a parallel "<query> <town>" prediction so
   *  the store's OWN town surfaces even when 5 neighboring towns share the
   *  street name (Luigi 2026-07-19: Varedo lost to Milan/Desio/Limbiate). */
  restaurantCity?: string | null;
  onClose: () => void;
  /** Empty the whole cart from the checkout screen (Luigi 2026-06-30). */
  onClearCart?: () => void;
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
  /** Per-(date, slot) fulfilment check for MULTI-WINDOW items (cmr803ovq c).
   *  A single from/to band can't express per-day time differences (Tue 10–15
   *  vs Wed 15–20), so the parent also passes this predicate and the picker
   *  drops any slot outside EVERY restricted item's windows. Both args are
   *  restaurant wall-clock ("YYYY-MM-DD", "HH:MM"). */
  fulfilSlotAllowed?: (dateStr: string, hhmm: string) => boolean;
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
  scheduleReason?: "catering" | "closed" | "service_later" | "service_special_later" | "both" | "lead" | "fulfil" | null;
  /** Today's per-service EXTRAORDINARY/special-day OPEN intervals (if any) +
   *  the date key they apply to — so the slot picker offers the special window
   *  for TODAY instead of the weekly hours. Luigi 2026-07-02. */
  todayServiceSpecialIntervals?: Array<{ open: string; close: string }> | null;
  todayServiceSpecialDateKey?: string | null;
  /** Localized name of the chosen service (Pickup/Delivery) — used by the
   *  "service_later" prompt ("Pickup starts at 2:00 PM"). Luigi 2026-06-22. */
  serviceLabel?: string;
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
  /** Time-selection styles this service offers (any combination; the
   *  customer toggles between them when several are enabled). Replaces the
   *  old single schedulingMode. Luigi 2026-07-04. */
  schedulingModes?: ("bands" | "range" | "exact")[];
  /** Restaurant opening hours by day-of-week, used to constrain the
   *  selectable slots to actual open periods. Each row: dayOfWeek
   *  0=Sunday … 6=Saturday with HH:MM open/close strings. May include
   *  service-scoped rows (with non-null `service`) when the owner has
   *  set different hours for pickup vs delivery vs reservation — the
   *  CheckoutModal picks the matching row via pickHoursForService. */
  openingHours?: Array<{ dayOfWeek: number; openTime: string; closeTime: string; isOpen: boolean; service?: string | null; intervals?: unknown }>;
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
  /** Signed-in customer's saved delivery addresses — a quick-pick above the
   *  street input so they don't retype. Empty for guests / non-delivery. */
  savedAddresses?: Array<{ id: string; label: string | null; street: string; city: string; state: string | null; zip: string | null; lat: number | null; lng: number | null; isDefault: boolean }>;
}

export function CheckoutModal({
  theme, orderType, onChangeOrderType, acceptsPickup, acceptsDelivery,
  acceptsDineIn = false, acceptsTakeOut = false,
  restaurantSlug, isSignedIn, fromMarketplace,
  cart, subtotal, totalDiscount,
  appliedPromos = [], promoNudgeText = null, serviceConflictText = null, bumpedExclusives = [], hasFreeDelivery = false, baseDeliveryFee = 0,
  deliveryFee, appliedServiceFees, taxAmount, depositLinesTotal = 0,
  tipAmount, tipPercent, setTipPercent, tipsEnabled = true, total, taxRate,
  rewardInfo = null, creditToApply = 0, setCreditToApply,
  customerInfo, setCustomerInfo, onMarketingToggle, savedGuestInfo, onClearSavedInfo,
  savedAddresses = [],
  editingSection, setEditingSection,
  orderLoading, placeOrder,
  cardPaymentEnabled,
  acceptedMethods,
  prepaidDeliveryOnly = false,
  cateringMode = false,
  cateringMinScheduledLocal,
  maxScheduledDate,
  fulfilDays = null,
  fulfilFrom = null,
  fulfilTo = null,
  fulfilSlotAllowed,
  fulfilItemsPresent = false,
  fulfilItemNames = [],
  toWallClock,
  schedulingEnabled = true,
  schedulingInterval = 15,
  schedulingModes = ["bands"],
  openingHours = [],
  requireCustomerEmail = true,
  requireCustomerPhone = true,
  hoursFormat = "24h",
  cateringNoticeHours,
  scheduleReason = null,
  serviceLabel,
  closedNextOpenLocal,
  todayServiceSpecialIntervals = null,
  todayServiceSpecialDateKey = null,
  paypalEnabled,
  couponCode, setCouponCode, couponId, couponDiscount, couponLoading, applyCoupon,
  estimatedDeliveryMinutes, estimatedPickupMinutes,
  hasZones, geocoding, geocodeError, resolvedZone, distanceFromStoreKm = null, acceptOutsideZoneOrders = false,
  googleMapsApiKey, geocodeCountry, restaurantLat, restaurantLng, restaurantCity,
  deliveryFormConfig,
  reservationContext = null,
  onClose,
  onClearCart,
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
  // ASAP vs "Schedule for later" — a clear two-option choice (Fabrizio: the way back to
  // ASAP used to be a buried link). The date/time picker shows when "later" is chosen or a
  // time is already set. Luigi 2026-06-25.
  const [scheduleOpen, setScheduleOpen] = useState(false);
  // Google map + Places autocomplete use the restaurant's own key if they set
  // one, otherwise the PLATFORM key — so every account gets the full Google
  // experience with zero per-restaurant setup (Luigi 2026-06-13). Empty key ⇒
  // gracefully falls back to the free Leaflet map + OSM autocomplete. mapProvider
  // is no longer a gate: a resolved key means Google.
  const mapsKey = resolveMapsBrowserKey(googleMapsApiKey);
  const googleEnabled = !!mapsKey;
  const { isLoaded: gmapsLoaded } = useGoogleMaps(mapsKey);
  // Google Places suggestions are fetched via AutocompleteService and rendered
  // in OUR in-modal dropdown (the same UI the OSM lane uses) instead of the
  // google.maps.places.Autocomplete widget. The widget's .pac-container is
  // body-appended and anchored to LAYOUT-viewport coordinates: inside the
  // checkout's inner-scrolling fixed sheet on a phone, the on-screen keyboard
  // scrolls the field while the widget's list stays put (or opens under the
  // keyboard) — Fabrizio report cmrrkdif9, "autofill no longer available".
  // An in-flow list scrolls WITH the field, so that whole failure class is gone.
  // Session token spans the keystrokes + the final getDetails (per-session
  // billing, same as the widget did internally).
  const placesSessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null);
  const placesAutoSvcRef = useRef<google.maps.places.AutocompleteService | null>(null);
  // A hard Places denial (dead key/quota) sticks for the session: later
  // keystrokes skip the doomed Google call and go straight to the OSM proxy.
  const googleDeniedRef = useRef(false);
  // Latest customerInfo for ASYNC callbacks (getDetails): spreading a captured
  // snapshot would revert fields the customer edited while the lookup was in
  // flight (review 2026-07-19 — apartment text vanishing, pin drag snapping back).
  const ciRef = useRef(customerInfo);
  ciRef.current = customerInfo;
  // Map center is set when an address is picked, but NOT updated while the
  // customer drags the pin — so the map doesn't snap back mid-drag.
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(
    customerInfo.lat != null && customerInfo.lng != null
      ? { lat: customerInfo.lat, lng: customerInfo.lng }
      : null,
  );

  // ── Address autocomplete — ONE in-modal dropdown for every restaurant ───
  // Google-keyed restaurants get Places predictions; everyone else gets
  // OpenStreetMap suggestions via our proxy route (Fabrizio report cmpxdxhxi —
  // Leaflet had none). If the Google script hasn't loaded (still in flight, or
  // blocked), the OSM proxy answers instead — the field is never suggestion-dead.
  type AddrSuggestion =
    | { kind: "google"; label: string; secondary: string; placeId: string }
    | { kind: "osm"; label: string; lat: number; lng: number; line1: string; city: string; postcode: string };
  const [addrSuggestions, setAddrSuggestions] = useState<AddrSuggestion[]>([]);
  const [addrSuggestOpen, setAddrSuggestOpen] = useState(false);
  const [addrHighlightIdx, setAddrHighlightIdx] = useState(-1);
  const addrJustPickedRef = useRef(false);
  // Query only after the CUSTOMER typed in the field. A prefilled address
  // (saved guest info, saved-address chip, pickup→delivery switch) must not
  // fire a billed Places call + pop the dropdown over the form unasked
  // (review 2026-07-19).
  const addrUserTypedRef = useRef(false);
  // The pending debounce timer, so a pick can cancel it — otherwise the
  // leftover timer re-queries the abandoned text after the pick and reopens
  // a stale dropdown (review 2026-07-19).
  const addrDebounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (orderType !== "delivery") { setAddrSuggestions([]); return; }
    // Don't re-query the value we just filled in from a chosen suggestion.
    if (addrJustPickedRef.current) { addrJustPickedRef.current = false; return; }
    if (!addrUserTypedRef.current) return;
    const q = (customerInfo.address || "").trim();
    if (q.length < 3) { setAddrSuggestions([]); setAddrSuggestOpen(false); setAddrHighlightIdx(-1); return; }
    const ctrl = new AbortController();
    const showList = (next: AddrSuggestion[]) => {
      setAddrSuggestions(next);
      setAddrHighlightIdx(-1);
      // Open only while the customer is still IN the field — a late response
      // must not pop the list over city/zip after focus moved on. onFocus
      // reopens from the stored suggestions.
      setAddrSuggestOpen(document.activeElement?.id === "checkout-delivery-address");
    };
    const id = window.setTimeout(async () => {
      const googleReady = !googleDeniedRef.current && googleEnabled && gmapsLoaded
        && typeof google !== "undefined" && !!google.maps?.places;
      if (googleReady) {
        try {
          if (!placesAutoSvcRef.current) {
            placesAutoSvcRef.current = new google.maps.places.AutocompleteService();
          }
          if (!placesSessionTokenRef.current) {
            placesSessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();
          }
          const req: google.maps.places.AutocompletionRequest = {
            input: q,
            sessionToken: placesSessionTokenRef.current,
            types: ["address"],
          };
          if (geocodeCountry) req.componentRestrictions = { country: geocodeCountry.toLowerCase() };
          // Bias toward the restaurant (Luigi 2026-06-13 + 2026-07-19). A
          // tight CIRCLE (location+radius), not a 0.5° box: measured on prod,
          // the box barely moved rankings (Torino 125 km away still ranked)
          // while a 5 km circle surfaces the immediate neighbor towns.
          // `origin` adds distance_meters so we can sort nearest-first.
          if (restaurantLat != null && restaurantLng != null) {
            req.location = new google.maps.LatLng(restaurantLat, restaurantLng);
            req.radius = 5_000;
            req.origin = new google.maps.LatLng(restaurantLat, restaurantLng);
          }
          // Parallel town-anchored query: every Lombard town has a "Via
          // Mazzini", and prominence outranks proximity even inside the
          // circle — the store's OWN town only reliably surfaces by naming
          // it. TOWN-FIRST ("Varedo Via Gi"): measured on prod, a trailing
          // town returns nothing for short partials while town-first
          // completes them (and full streets + house numbers). Same session
          // token, so predictions stay per-session billed. Its failure must
          // NOT flip googleDeniedRef (pre-caught to []).
          const town = (restaurantCity || "").trim();
          const townQuery = town && !q.toLowerCase().includes(town.toLowerCase())
            ? svcGetPredictions(placesAutoSvcRef.current, { ...req, input: `${town} ${q}` }).catch(() => [])
            : Promise.resolve([] as google.maps.places.AutocompletePrediction[]);
          const [near, inTown] = await Promise.all([
            svcGetPredictions(placesAutoSvcRef.current, req),
            townQuery,
          ]);
          if (ctrl.signal.aborted) return;
          // Town hits lead, then everything nearest-first; dedupe on place_id.
          const seenIds = new Set<string>();
          const merged = [...inTown, ...near].filter((p) => !seenIds.has(p.place_id) && !!seenIds.add(p.place_id));
          merged.sort((a, b) =>
            ((a as { distance_meters?: number }).distance_meters ?? Infinity)
            - ((b as { distance_meters?: number }).distance_meters ?? Infinity));
          showList(merged.slice(0, 6).map((p): AddrSuggestion => ({
            kind: "google",
            label: p.structured_formatting?.main_text || p.description,
            secondary: p.structured_formatting?.secondary_text || "",
            placeId: p.place_id,
          })));
          return;
        } catch {
          // Hard rejection (key denied / quota dead) — remember it so we stop
          // paying the doomed round-trip on every keystroke; OSM takes over.
          googleDeniedRef.current = true;
        }
      }
      try {
        const params = new URLSearchParams({ q });
        if (geocodeCountry) params.set("country", geocodeCountry);
        const res = await fetch(`/api/public/geocode/search?${params.toString()}`, { signal: ctrl.signal });
        const data = await res.json().catch(() => ({}));
        showList(Array.isArray(data.suggestions)
          ? data.suggestions.map((s: { label: string; lat: number; lng: number; line1: string; city: string; postcode: string }): AddrSuggestion => ({ kind: "osm", ...s }))
          : []);
      } catch { /* aborted / network — leave list as-is */ }
    }, 400);
    addrDebounceRef.current = id;
    return () => { window.clearTimeout(id); ctrl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerInfo.address, googleEnabled, gmapsLoaded, orderType, geocodeCountry, restaurantLat, restaurantLng, restaurantCity]);

  /** Shared pick teardown: cancel any pending debounce query (its leftover
   *  timer would re-query the abandoned text and reopen a stale list), close,
   *  and mark the coming address change as programmatic. */
  const beginPick = () => {
    if (addrDebounceRef.current !== null) { window.clearTimeout(addrDebounceRef.current); addrDebounceRef.current = null; }
    addrJustPickedRef.current = true;
    addrUserTypedRef.current = false;
    setAddrSuggestOpen(false);
    setAddrSuggestions([]);
    setAddrHighlightIdx(-1);
  };

  const pickAddrSuggestion = (sug: Extract<AddrSuggestion, { kind: "osm" }>) => {
    beginPick();
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

  // Runs in getDetails' ASYNC callback — always spread ciRef.current (the
  // live state), never a captured customerInfo, or edits made while the
  // lookup was in flight get reverted.
  const applyGooglePlace = (place: google.maps.places.PlaceResult) => {
    if (!place.address_components) return;

    const get = (type: string, short = false) =>
      place.address_components!.find((c) => c.types.includes(type))?.[short ? "short_name" : "long_name"] ?? "";

    const streetNumber = get("street_number");
    const route = get("route");
    // House-number position follows the restaurant's country convention:
    // "Via Mazzini 13" (IT/DE/…) vs "13 Main St" (US/CA/GB/…). Fabrizio 2026-06-24.
    const street = composeStreetLine(route, streetNumber, geocodeCountry);
    const city = get("locality") || get("sublocality") || get("administrative_area_level_2");
    const zip = get("postal_code");

    // Capture the precise coordinates so we can show + fine-tune a map pin
    // and send exact coords to the driver.
    const loc = place.geometry?.location;
    const lat = loc ? loc.lat() : null;
    const lng = loc ? loc.lng() : null;
    if (lat != null && lng != null) setMapCenter({ lat, lng });

    const live = ciRef.current;
    setCustomerInfo({
      ...live,
      address: street || place.formatted_address || live.address,
      city: city || live.city,
      zip: zip || live.zip,
      ...(lat != null && lng != null ? { lat, lng } : {}),
    });
  };

  const pickGoogleSuggestion = (sug: Extract<AddrSuggestion, { kind: "google" }>) => {
    beginPick();
    if (typeof google === "undefined" || !google.maps?.places) return;
    if (!placesServiceRef.current) {
      // PlacesService needs a host node; a detached div is the documented
      // pattern when results aren't rendered on a Google map.
      placesServiceRef.current = new google.maps.places.PlacesService(document.createElement("div"));
    }
    // getDetails closes the per-session billing window the token opened.
    const sessionToken = placesSessionTokenRef.current ?? undefined;
    placesSessionTokenRef.current = null;
    placesServiceRef.current.getDetails(
      { placeId: sug.placeId, fields: ["address_components", "formatted_address", "geometry"], sessionToken },
      (place, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && place) {
          applyGooglePlace(place);
        } else {
          // Details unavailable (quota/transient): keep the fullest picked
          // label so the choice isn't lost, and DROP any stale coords from a
          // previous pick — the server's text geocode must own the location.
          setCustomerInfo({
            ...ciRef.current,
            address: sug.secondary ? `${sug.label}, ${sug.secondary}` : sug.label,
            lat: null,
            lng: null,
          });
        }
      },
    );
  };

  // Minimal combobox keyboard support for the suggestion list (both lanes):
  // ArrowUp/Down move the highlight, Enter picks it, Escape closes. Enter
  // without a highlight falls through untouched.
  const onAddrKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!addrSuggestOpen || addrSuggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAddrHighlightIdx((i) => (i + 1) % addrSuggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAddrHighlightIdx((i) => (i <= 0 ? addrSuggestions.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      if (addrHighlightIdx >= 0 && addrHighlightIdx < addrSuggestions.length) {
        e.preventDefault();
        const sug = addrSuggestions[addrHighlightIdx];
        if (sug.kind === "google") pickGoogleSuggestion(sug); else pickAddrSuggestion(sug);
      }
    } else if (e.key === "Escape") {
      setAddrSuggestOpen(false);
      setAddrHighlightIdx(-1);
    }
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

  // Which of the service's enabled time-selection styles is ACTIVE: the
  // customer's chip choice when several are enabled, else the first enabled
  // style. Luigi 2026-07-04 (multi-choice replaced the single "both" mode).
  const activeStyle: "bands" | "range" | "exact" =
    (customerInfo.scheduledStyle === "bands" || customerInfo.scheduledStyle === "range" || customerInfo.scheduledStyle === "exact")
      && schedulingModes.includes(customerInfo.scheduledStyle)
      ? customerInfo.scheduledStyle
      : (schedulingModes[0] ?? "bands");
  // "range" style (Fabrizio cmqqxerxs): every band is a WINDOW —
  // "6:00 – 6:15 PM" = fulfilled within that timeframe. scheduledFor keeps
  // storing the window START so validation/kitchen countdown are untouched;
  // this helper derives the window END purely for display. Width is capped
  // at 15 minutes (rangeWindowMinutes), per Luigi 2026-07-04.
  const slotRangeMode = activeStyle === "range";
  const slotEndOf = (hhmm: string): string => {
    const [h, m] = hhmm.split(":").map(Number);
    const step = rangeWindowMinutes(schedulingInterval);
    const total = ((h ?? 0) * 60 + (m ?? 0) + step) % (24 * 60);
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  };
  const slotTimeLabel = (hhmm: string): string =>
    slotRangeMode
      ? `${formatTime(hhmm, hoursFormat)} – ${formatTime(slotEndOf(hhmm), hoursFormat)}`
      : formatTime(hhmm, hoursFormat);

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
        return tc("timeScheduledFor", { when: `${dateLabel} ${slotTimeLabel((tPart || "").slice(0, 5))}`.trim() });
      })()
    : cateringMode
      ? tc("timeCateringNotice", { hours: cateringNoticeHours ?? 24 })
      : `${tc("asap")} · ~${orderType === "delivery" ? estimatedDeliveryMinutes : estimatedPickupMinutes} min`;

  // Guard (O1, Luigi 2026-06-23): a scheduled time BEFORE "now + standard prep" in the RESTAURANT's
  // wall clock must never reach the server (it 400s with scheduled_in_past). The slot dropdown already
  // filters these out, but the exact-time <input type="time"> min is only a soft hint (the native
  // spinner still lets you pick earlier), so we HARD-block here: disable Place Order + show the inline
  // notice. Mirrors the picker's own minDate/minTimeForDate math via toWallClock, so it can never
  // false-block a slot the picker would legitimately offer (incl. catering — its picks are future).
  const scheduledTooEarly = (() => {
    const sf = customerInfo.scheduledFor;
    if (!sf) return false;
    const [dPart, tFull] = sf.split("T");
    const tPart = (tFull || "").slice(0, 5);
    if (!dPart || !tPart) return false;
    const wc = (ms: number): string => {
      if (toWallClock) return toWallClock(ms);
      const d = new Date(ms);
      const p = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
    };
    const prep = Math.max(0, orderType === "delivery" ? estimatedDeliveryMinutes : estimatedPickupMinutes);
    const [minDate, minTime] = wc(Date.now() + prep * 60_000).split("T");
    if (dPart < minDate) return true;
    if (dPart === minDate && tPart < (minTime || "").slice(0, 5)) return true;
    return false;
  })();

  // ── Reward Dollars spend control ────────────────────────────────────────
  // Ceiling the customer may apply = min(balance, total, max-% of total),
  // gated on a minimum balance. The server re-validates + claims atomically;
  // this is preview UX only. Luigi 2026-06-27.
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const rewardLabelPlural = rewardInfo?.labelPlural?.trim() || tc("reward.defaultPlural");
  const rewardEligible =
    !!rewardInfo && rewardInfo.balance > 0 && rewardInfo.balance >= (rewardInfo.minRedeemBalance ?? 0) && total > 0;
  // Redeemable base excludes gift-card (promo-excluded) lines — the server
  // clamps the claim to the same base at charge, so what we offer here is
  // exactly what will be applied. Luigi 2026-07-02.
  const rewardBase = rewardEligible ? Math.max(0, r2(total - (rewardInfo!.redeemExcludedTotal ?? 0))) : 0;
  const rewardMax = rewardEligible
    ? r2(Math.min(
        rewardInfo!.balance,
        rewardBase,
        (rewardInfo!.maxRedeemPercent > 0 ? rewardBase * (rewardInfo!.maxRedeemPercent / 100) : rewardBase),
      ))
    : 0;
  // Mirror the server's claim EXACTLY (same pure computeApplied the orders
  // route runs), including the card-processor min-charge floor on online
  // payments — otherwise "To pay today" can understate by up to $0.49 on
  // small card orders (preview ≠ charge). Recomputes live when the customer
  // switches payment method. Luigi audit 2026-07-07, fixed 2026-07-11.
  const payingOnline = customerInfo.paymentMethod === "card" || customerInfo.paymentMethod === "paypal";
  const creditChosen = rewardEligible
    ? computeApplied({
        requested: Math.max(0, r2(creditToApply)),
        balance: rewardInfo!.balance,
        orderTotal: rewardBase,
        minRedeemBalance: rewardInfo!.minRedeemBalance ?? 0,
        maxRedeemPercent: rewardInfo!.maxRedeemPercent ?? 100,
        minCharge: payingOnline ? 0.5 : 0,
      }).applied
    : 0;
  const chargeToday = r2(total - creditChosen);
  const setCredit = (n: number) => setCreditToApply?.(Math.min(Math.max(0, r2(n)), rewardMax));

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

  // Per-item discount badges (GloriaFood-style). Prefer PRECISE per-line
  // attribution: the engine echoes each discounted unit's `lineKey` (the cart
  // line's index), so the same dish on two lines each shows its own saving.
  // Breakdown lines without a lineKey fall back to the legacy "sum by menuItemId,
  // attach to the FIRST matching line" path. Whole-cart promos have no breakdown
  // → they stay in the summary below. Luigi 2026-06-27 / per-line 2026-06-30.
  const savedByLineKey = new Map<string, number>();
  const savedByItem = new Map<string, number>();
  for (const p of appliedPromos) {
    if (!p.breakdown) continue;
    for (const b of p.breakdown) {
      if (b.lineKey != null) savedByLineKey.set(b.lineKey, (savedByLineKey.get(b.lineKey) ?? 0) + b.amount);
      else savedByItem.set(b.menuItemId, (savedByItem.get(b.menuItemId) ?? 0) + b.amount);
    }
  }
  const shownSaved = new Set<string>();
  const savedForLine = cart.map((ci, i) => {
    const byKey = savedByLineKey.get(String(i));
    if (byKey != null && byKey > 0) return byKey;
    const id = ci.menuItem?.id;
    if (!id) return 0;
    const amt = savedByItem.get(id);
    if (!amt || shownSaved.has(id)) return 0;
    shownSaved.add(id);
    return amt;
  });

  // Group auto-applied meal bundles into a "2 pizzas $30" card with its pizzas
  // beneath (GloriaFood parity, Luigi 2026-07-07). Instances come from each
  // bundle promo's `bundles`, mapped to cart lines by lineKey (= cart index).
  // The grouped lines are hidden from the flat summary + the bundle promo is
  // dropped from the celebration strip (it's the card now). Display-only.
  const checkoutBundleGroups: Array<{ key: string; promoName: string; price: number; saved: number; lineIdxs: number[] }> = [];
  const checkoutBundledIdx = new Set<number>();
  const checkoutBundlePromoIds = new Set<string>();
  for (const p of appliedPromos as any[]) {
    if (!Array.isArray(p?.bundles) || !p.bundles.length) continue;
    checkoutBundlePromoIds.add(p.promoId);
    p.bundles.forEach((b: any, bi: number) => {
      const seen = new Set<number>();
      for (const part of b?.parts ?? []) {
        const idx = part?.lineKey != null ? Number(part.lineKey) : NaN;
        if (Number.isInteger(idx) && idx >= 0 && idx < cart.length) { seen.add(idx); checkoutBundledIdx.add(idx); }
      }
      if (seen.size) checkoutBundleGroups.push({ key: `${p.promoId}:${bi}`, promoName: p.name, price: Number(b.price) || 0, saved: Number(b.saved) || 0, lineIdxs: [...seen] });
    });
  }

  return (
    // NO backdrop-close on checkout (Luigi 2026-07-04): a stray tap outside
    // the white area was closing it mid-typing and wiping the customer's
    // progress. Checkout closes ONLY via the explicit ✕ button.
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6"
    >
      <div
        className="bg-white sm:rounded-2xl w-full max-w-4xl max-h-[96vh] sm:max-h-[85vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-900 truncate">{tc("title")}</h2>
          <div className="flex items-center gap-1 flex-shrink-0">
            {onClearCart && cart.length > 0 && (
              <button onClick={onClearCart} className="text-xs font-medium text-gray-400 hover:text-red-500 inline-flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-red-50 transition">
                <Trash2 className="w-3.5 h-3.5" /> {tOrd("emptyCartAction")}
              </button>
            )}
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700">
              <X className="w-5 h-5" />
            </button>
          </div>
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

        {/* "Almost there" nudge — the SAME menu prompt, surfaced at checkout
            (Luigi 2026-07-07): the customer is looking at the delivery fee here,
            so "Add $X more to unlock FREE DELIVERY!" is at its most persuasive.
            Prominent dashed banner at the top of the modal body. */}
        {promoNudgeText && (
          <div className="px-5 pt-4 flex-shrink-0">
            <div className="rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50 px-4 py-3 text-center text-sm font-semibold text-emerald-800 shadow-sm">
              🎯 {promoNudgeText}
            </div>
          </div>
        )}

        {/* Service conflict — a cart line isn't offered for the selected
            ordering method. Red banner + Place order disabled below; switching
            the method (or removing the line) clears it live. */}
        {serviceConflictText && (
          <div className="px-5 pt-4 flex-shrink-0">
            <div className="rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3 text-center text-sm font-bold text-red-700 shadow-sm">
              {serviceConflictText}
            </div>
          </div>
        )}

        {/* Celebration banner — applied promos summary. Only renders when
            at least one promo fired OR free delivery was unlocked. Each
            row shows the promo name + savings. Stays sticky-at-top of the
            modal body so customers see what they earned even as they
            scroll the form below. */}
        {(appliedPromos.some((p) => p.type !== "free_delivery" && p.discount > 0 && !checkoutBundlePromoIds.has(p.promoId)) || (hasFreeDelivery && baseDeliveryFee > 0) || appliedPromos.some((p) => p.type === "reward_credit" && (p.creditAmount ?? 0) > 0)) && (
          <div className="px-5 pt-4 flex-shrink-0">
            <div className="rounded-xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-green-50 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl" aria-hidden>🎉</span>
                <div className="text-sm font-bold text-emerald-800">
                  {appliedPromos.filter((p) => p.type !== "free_delivery" && p.discount > 0 && !checkoutBundlePromoIds.has(p.promoId)).length + (hasFreeDelivery && baseDeliveryFee > 0 ? 1 : 0) + appliedPromos.filter((p) => p.type === "reward_credit" && (p.creditAmount ?? 0) > 0).length === 1
                    ? tc("unlockedPromoOne")
                    : tc("unlockedPromoMany")}
                </div>
              </div>
              <div className="space-y-1.5">
                {appliedPromos
                  // Free Delivery promos have discount=0 — surface them via
                  // the separate "Free Delivery" line below instead so the
                  // savings amount is accurate (it's the delivery fee).
                  // Bundle promos are shown as their own grouped card above.
                  .filter((p) => p.type !== "free_delivery" && p.discount > 0 && !checkoutBundlePromoIds.has(p.promoId))
                  // One line per promo (NAME + total). Item-targeted deals now
                  // show WHICH dishes inline on each cart line above (the green
                  // "You saved" badge), so the summary stays a clean per-promo
                  // total — itemised detail isn't duplicated here. Luigi 2026-06-27.
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
                {/* Reward Dollars EARNED via a "Grant Reward Dollars" special —
                    a credit (not a discount), shown as "+ Earn $X". */}
                {appliedPromos
                  .filter((p) => p.type === "reward_credit" && (p.creditAmount ?? 0) > 0)
                  .map((p) => (
                    <div key={p.promoId} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 text-emerald-700 font-medium truncate">
                        <span aria-hidden>🎁</span>
                        <span className="truncate">{p.name}</span>
                      </div>
                      <div className="font-semibold text-emerald-800 whitespace-nowrap ml-2">
                        {tc("reward.earnLine", { amount: formatCurrency(p.creditAmount ?? 0), label: rewardLabelPlural })}
                      </div>
                    </div>
                  ))}
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

        {/* Body. overflow-x-hidden + min-w-0 on form fields stops the mobile
            horizontal-scroll: bare inputs/selects in the grid-cols-2 rows otherwise
            can't shrink below their intrinsic min-width and push the modal sideways
            on a narrow phone (Luigi 2026-06-22). */}
        <div className="flex-1 overflow-y-auto overscroll-contain [&_input]:min-w-0 [&_select]:min-w-0 [&_textarea]:min-w-0">
          <div className="grid md:grid-cols-2 gap-0">
            {/* ── Left column: settings cards ── */}
            <div className="min-w-0 p-5 space-y-3 md:border-r md:border-gray-100">
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
                  <div className="pt-3 -mb-1 text-xs text-gray-500">
                    {tc.rich(fromMarketplace ? "guestSigninMarketplace" : "guestSigninRestaurant", {
                      link: (chunks) => (
                        <a
                          href={fromMarketplace
                            ? `/login?next=${encodeURIComponent(`/order/${restaurantSlug}?from=marketplace`)}`
                            : `/order/${restaurantSlug}/account/login?next=${encodeURIComponent(`/order/${restaurantSlug}`)}`}
                          className="font-semibold underline hover:no-underline"
                          style={{ color: theme.primaryColor }}
                        >
                          {chunks}
                        </a>
                      ),
                    })}
                  </div>
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
                    placeholder={`${tc("emailPlaceholder")}${requireCustomerEmail ? " *" : ` (${tc("emailOptional")})`}`}
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
                    {/* Saved-address quick-pick (signed-in customers). Tap one to
                        fill the form; the default is auto-filled by the parent on
                        load. "Enter a new address" clears for a one-off. Picked or
                        typed both re-trigger the debounced geocode + zone. (#4) */}
                    {isSignedIn && savedAddresses.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pb-1">
                        <span className="w-full text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{tc("savedAddressesLabel")}</span>
                        {savedAddresses.map((a) => {
                          const active = !!customerInfo.address && customerInfo.address.trim() === a.street.trim();
                          return (
                            <button
                              key={a.id}
                              type="button"
                              onClick={() => { addrUserTypedRef.current = false; setCustomerInfo({ ...customerInfo, address: a.street, city: a.city, zip: a.zip ?? "", lat: a.lat ?? null, lng: a.lng ?? null }); }}
                              className="px-2.5 py-1 rounded-full text-xs font-medium border transition"
                              style={active
                                ? { borderColor: theme.primaryColor, backgroundColor: `${theme.primaryColor}15`, color: theme.primaryColor }
                                : { borderColor: "#e5e7eb", color: "#6b7280" }}
                            >
                              {a.label || a.street}
                              {a.isDefault && <span className="ml-1 opacity-70">· {tc("savedAddressDefault")}</span>}
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => { addrUserTypedRef.current = false; setCustomerInfo({ ...customerInfo, address: "", city: "", zip: "", unit: "", buzzer: "", lat: null, lng: null }); }}
                          className="px-2.5 py-1 rounded-full text-xs font-medium border border-dashed border-gray-300 text-gray-500 hover:border-gray-400 transition"
                        >
                          + {tc("enterNewAddress")}
                        </button>
                      </div>
                    )}
                    {/* Street address — primary field; drives autocomplete +
                        map pin + zone resolution. Rendered only when the
                        restaurant's form config shows it. ONE input for both
                        providers; the suggestion list renders IN the modal so
                        it scrolls with the field (the Google widget's body-
                        anchored dropdown detached / hid under the phone
                        keyboard — Fabrizio cmrrkdif9). */}
                    {deliveryFormConfig.street.show && (
                      <div className="relative">
                        <input
                          id="checkout-delivery-address"
                          type="text" autoComplete="off"
                          role="combobox" aria-autocomplete="list"
                          aria-expanded={addrSuggestOpen && addrSuggestions.length > 0}
                          aria-controls="checkout-addr-suggestions"
                          placeholder={`${tc("startTypingAddress")}${deliveryFormConfig.street.required ? " *" : ""}`}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                          style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                          value={customerInfo.address}
                          onChange={e => {
                            addrUserTypedRef.current = true;
                            // Manual typing invalidates picked/dragged coords —
                            // zone + payload must fall back to the text geocode,
                            // not a stale pin (Luigi 2026-07-19).
                            setCustomerInfo({ ...customerInfo, address: e.target.value, lat: null, lng: null });
                          }}
                          onKeyDown={onAddrKeyDown}
                          onFocus={() => { if (addrSuggestions.length) setAddrSuggestOpen(true); }}
                          onBlur={() => setTimeout(() => setAddrSuggestOpen(false), 150)}
                        />
                        {addrSuggestOpen && addrSuggestions.length > 0 && (
                          <ul id="checkout-addr-suggestions" role="listbox" className="absolute z-30 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                            {addrSuggestions.map((sug, i) => (
                              <li key={sug.kind === "google" ? sug.placeId : `${sug.lat}-${sug.lng}-${i}`} role="option" aria-selected={i === addrHighlightIdx}>
                                <button
                                  type="button"
                                  onMouseDown={(e) => { e.preventDefault(); sug.kind === "google" ? pickGoogleSuggestion(sug) : pickAddrSuggestion(sug); }}
                                  className={`w-full text-start px-3 py-2 text-sm border-b border-gray-50 last:border-0 ${i === addrHighlightIdx ? "bg-gray-100" : "hover:bg-gray-50"}`}
                                >
                                  {sug.kind === "google" ? (
                                    <>
                                      <span className="font-medium text-gray-800">{sug.label}</span>
                                      {sug.secondary && <span className="text-gray-500"> · {sug.secondary}</span>}
                                    </>
                                  ) : (
                                    <>
                                      <span className="font-medium text-gray-800">{sug.line1 || sug.label}</span>
                                      {sug.city && <span className="text-gray-500"> · {sug.city}{sug.postcode ? ` ${sug.postcode}` : ""}</span>}
                                    </>
                                  )}
                                </button>
                              </li>
                            ))}
                            {addrSuggestions[0]?.kind === "google" && (
                              /* Places TOS: attribution is required when predictions
                                 render off-map (our pin map is Leaflet/OSM). */
                              <li aria-hidden className="px-3 py-1 text-end text-[10px] text-gray-400 select-none">
                                powered by Google
                              </li>
                            )}
                          </ul>
                        )}
                      </div>
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
                            onChange={e => setCustomerInfo({ ...customerInfo, city: e.target.value, lat: null, lng: null })}
                          />
                        )}
                        {deliveryFormConfig.postcode.show && (
                          <input
                            id="checkout-delivery-zip"
                            type="text" placeholder={`${tAddr("postcode")}${deliveryFormConfig.postcode.required ? " *" : ""}`}
                            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                            style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                            value={customerInfo.zip}
                            onChange={e => setCustomerInfo({ ...customerInfo, zip: e.target.value, lat: null, lng: null })}
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
                      /* relative z-0 flattens Leaflet's internal z-indexes into
                         one stacking context BELOW the suggestion list — without
                         it the map paints over the list and steals its taps
                         (review 2026-07-19, high). */
                      <div className="rounded-lg overflow-hidden border border-gray-200 relative z-0">
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
                        {distanceFromStoreKm != null && <> · {tCommon("kmFromStore", { km: distanceFromStoreKm })}</>}
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
                          {distanceFromStoreKm != null && <> · {tCommon("kmFromStore", { km: distanceFromStoreKm })}</>}
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
                  {/* Clarify that the ASAP delivery "~X min" is an estimate, not a
                      delivery-arrival promise — the restaurant confirms the real
                      time after accepting (Fabrizio report cmqt99i8s). Luigi 2026-07-02. */}
                  {orderType === "delivery" && !customerInfo.scheduledFor && !cateringMode && (
                    <p className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 leading-snug">
                      {tc("asapDeliveryEstimateNote")}
                    </p>
                  )}
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
                          ) : scheduleReason === "service_special_later" ? (
                            tc("serviceOpensTodayPrompt", {
                              service: serviceLabel ?? "",
                              time: closedNextOpenLocal
                                ? new Date(closedNextOpenLocal).toLocaleString(undefined, { hour: "numeric", minute: "2-digit" })
                                : "",
                            })
                          ) : scheduleReason === "service_later" ? (
                            tc("serviceStartsPrompt", {
                              service: serviceLabel ?? "",
                              time: closedNextOpenLocal
                                ? new Date(closedNextOpenLocal).toLocaleString(undefined, { hour: "numeric", minute: "2-digit" })
                                : "",
                            })
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
                  {/* ASAP vs Schedule — two clear options (Fabrizio: the way back to ASAP
                      was a buried underlined link). Shown only when ASAP is actually allowed;
                      when scheduling is FORCED (closed / catering / lead / fulfilment) there is
                      no ASAP, so we skip straight to the picker below. Luigi 2026-06-25. */}
                  {!cateringMode && (
                    <div className="grid grid-cols-2 gap-2">
                      {([["asap", tc("asap")], ["later", tc("scheduleForLater")]] as const).map(([key, label]) => {
                        const selected = key === "asap"
                          ? !scheduleOpen && !customerInfo.scheduledFor
                          : scheduleOpen || !!customerInfo.scheduledFor;
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => {
                              if (key === "asap") {
                                setScheduleOpen(false);
                                if (customerInfo.scheduledFor) setCustomerInfo({ ...customerInfo, scheduledFor: "" });
                              } else setScheduleOpen(true);
                            }}
                            className="py-2 px-3 rounded-lg border-2 text-xs font-semibold transition"
                            style={selected
                              ? { borderColor: theme.primaryColor, backgroundColor: `${theme.primaryColor}12`, color: theme.primaryColor }
                              : { borderColor: "#e5e7eb", color: "#4b5563" }}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {(cateringMode || scheduleOpen || !!customerInfo.scheduledFor) && (<>
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
                      const serviceKind = orderType === "delivery" ? "delivery" : orderType === "pickup" ? "pickup" : null; // dine_in/take_out follow general hours
                      const row = pickHoursForService(openingHours as any, dow, serviceKind);
                      // SPLIT HOURS: a day may open more than once (lunch + dinner).
                      // rowIntervals() returns every window (legacy single-window rows
                      // become a one-element array), so we generate slots PER interval
                      // and the lunch/dinner gap simply has no slots offered.
                      // For TODAY, a per-service EXTRAORDINARY/special-day OPEN
                      // window overrides the weekly row (Fabrizio cmqp8l948). Luigi 2026-07-02.
                      const ivs = (todayServiceSpecialIntervals && todayServiceSpecialDateKey && datePart === todayServiceSpecialDateKey)
                        ? todayServiceSpecialIntervals
                        : (row && row.isOpen ? rowIntervals(row as any) : []);
                      if (ivs.length > 0) {
                        winOpen = ivs[0].open;                       // envelope (exact-mode bounds)
                        winClose = ivs[ivs.length - 1].close;
                      }
                      const step = Math.max(5, Math.min(120, schedulingInterval || 15));
                      const minMin = (() => {
                        const [mh, mm] = minTimeForDate.split(":").map(Number);
                        return (mh ?? 0) * 60 + (mm ?? 0);
                      })();
                      // Overnight-correct slot list (Luigi 2026-07-04): a date
                      // offers yesterday's overnight SPILL (00:00 → spill end)
                      // plus its own windows CLIPPED at midnight — see
                      // buildDaySlots for the full story. Unit-tested in
                      // src/lib/schedule-slots.test.ts.
                      const prevRow = pickHoursForService(openingHours as any, (dow + 6) % 7, serviceKind);
                      slots = buildDaySlots({
                        dayIntervals: ivs as any,
                        prevDayIntervals: (prevRow && prevRow.isOpen ? rowIntervals(prevRow as any) : []) as any,
                        stepMinutes: step,
                        minMinutes: minMin,
                      });
                    }
                    // Phase 2 — restrict the time slots to the cart's fulfilment
                    // window (e.g. an 11:00–15:00 item shows only those slots).
                    if (fulfilFrom && fulfilTo) {
                      slots = slots.filter((s) =>
                        fulfilFrom <= fulfilTo ? s >= fulfilFrom && s < fulfilTo : s >= fulfilFrom || s < fulfilTo,
                      );
                    }
                    // MULTI-WINDOW carts (cmr803ovq c): per-day windows differ
                    // (Tue 10–15 vs Wed 15–20), which the single band above
                    // can't express — also drop slots the per-item windows
                    // reject for the SELECTED date. (Exact-time mode can't be
                    // bounded this way; the server's isFulfilableAt guard still
                    // rejects an off-window exact time with the localized
                    // reschedule message.)
                    if (fulfilSlotAllowed && datePart) {
                      slots = slots.filter((s) => fulfilSlotAllowed(datePart, s));
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
                    const exactMode = activeStyle === "exact";
                    let exactMin = winOpen > minTimeForDate ? winOpen : minTimeForDate;
                    let exactMax = winClose <= winOpen ? "23:59" : winClose;
                    // Tighten the free-time bounds to the fulfilment window too.
                    if (fulfilFrom && fulfilFrom > exactMin) exactMin = fulfilFrom;
                    if (fulfilTo && fulfilTo < exactMax) exactMax = fulfilTo;
                    return (
                      <>
                      {/* Style toggle — one chip per ENABLED style (Luigi
                          2026-07-04: any 1/2/3 combination; the customer picks
                          among what the restaurant allows). */}
                      {schedulingModes.length > 1 && (
                        <div className="flex gap-1 mb-2 p-0.5 bg-gray-100 rounded-lg text-xs font-medium">
                          {schedulingModes.map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setCustomerInfo({ ...customerInfo, scheduledStyle: m })}
                              className={`flex-1 py-1.5 rounded-md transition ${
                                activeStyle === m ? "bg-white shadow-sm text-gray-900" : "text-gray-500"
                              }`}
                            >
                              {m === "bands" ? tc("scheduleModeSlots") : m === "range" ? tc("scheduleModeRanges") : tc("scheduleModeExact")}
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
                                  <option key={s} value={s}>{slotTimeLabel(s)}</option>
                                ))}
                              </>
                            )}
                          </select>
                        )}
                      </div>
                      </>
                    );
                  })()}
                  </>)}
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
                  let visible = all.filter(
                    (p) =>
                      acceptedMethods.includes(p.slug) &&
                      !(p.slug === "online_card" && !cardPaymentEnabled) &&
                      !(p.slug === "paypal" && !paypalEnabled) &&
                      // ShipDay-dispatched delivery: at-door methods are never
                      // offered — the driver can't collect (Luigi 2026-07-04).
                      !(prepaidDeliveryOnly && (p.slug === "cash" || p.slug === "card_in_person")),
                  );
                  // Safety net: if a restaurant's only configured methods for
                  // this order type are online card / PayPal but those are OFF
                  // (no add-on / Stripe not finished), the picker would be empty
                  // and the customer couldn't check out. Fall back to Cash (pay
                  // on pickup/delivery) so an order can always be placed.
                  // EXCEPT for prepaid-only (ShipDay) delivery — cash there
                  // would strand the driver; show the unavailable notice instead.
                  if (visible.length === 0 && !prepaidDeliveryOnly) visible = [all[0]];
                  if (visible.length === 0) {
                    return (
                      <div className="mt-3 p-2.5 bg-amber-50 rounded-lg text-xs text-amber-800 flex items-start gap-2">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                        {tc("prepaidDeliveryUnavailable")}
                      </div>
                    );
                  }
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
                {prepaidDeliveryOnly && (
                  <div className="mt-2 p-2.5 bg-blue-50 rounded-lg text-xs text-blue-700 flex items-start gap-2">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    {tc("prepaidDeliveryNote")}
                  </div>
                )}
                {customerInfo.paymentMethod === "card" && !cardPaymentEnabled && (
                  <div className="mt-2 p-2.5 bg-blue-50 rounded-lg text-xs text-blue-700 flex items-start gap-2">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    {tc("cardComingSoon", { type: orderType === "delivery" ? tOrd("delivery").toLowerCase() : tOrd("pickup").toLowerCase() })}
                  </div>
                )}
                {customerInfo.paymentMethod === "paypal" && !paypalEnabled && (
                  <div className="mt-2 p-2.5 bg-amber-50 rounded-lg text-xs text-amber-800 flex items-start gap-2">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    {tc("paypalNotReady")}
                  </div>
                )}
                {customerInfo.paymentMethod === "paypal" && paypalEnabled && (
                  <div className="mt-2 p-2.5 bg-blue-50 rounded-lg text-xs text-blue-700 flex items-start gap-2">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    {tc("paypalRedirectNotice")}
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
                              {tc("tipBadgeSuggested")}
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
            <div className="min-w-0 p-5 bg-gray-50">
              <div className="grid grid-cols-[40px_1fr_70px] gap-3 text-xs font-bold text-gray-500 uppercase pb-2 border-b border-gray-200">
                <span>{tc("qty")}</span>
                <span>{tc("item")}</span>
                <span className="text-right">{tc("price")}</span>
              </div>
              {cart.length === 0 ? (
                <div className="py-10 text-center text-gray-400 text-sm">{tc("cartEmpty")}</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {/* Auto-applied meal bundles as a GloriaFood-style grouped line:
                      the "2 pizzas $30" deal at its price + savings, with the
                      bundled pizzas beneath. Those lines are hidden below. */}
                  {checkoutBundleGroups.map((g) => (
                    <div key={g.key} className="grid grid-cols-[40px_1fr_70px] gap-3 py-2.5 text-sm items-start">
                      <span className="font-semibold text-gray-700" aria-hidden>🎉</span>
                      <span className="text-gray-700 min-w-0 break-words">
                        <span className="font-semibold">{g.promoName}</span>
                        {g.saved > 0 && (
                          <span className="flex w-fit items-center gap-1 mt-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5">
                            <span aria-hidden>👍</span> {tc("youSaved", { amount: formatCurrency(g.saved) })}
                          </span>
                        )}
                        <span className="block mt-1 pl-3 border-l-2 border-gray-100 text-xs text-gray-500 space-y-0.5">
                          {g.lineIdxs.map((idx) => {
                            const bi = cart[idx];
                            if (!bi) return null;
                            return (
                              <span key={idx} className="block">
                                • {bi.menuItem.name}{bi.variant ? ` (${bi.variant.name})` : ""}
                                {bi.modifierLabels && bi.modifierLabels.length ? ` — ${bi.modifierLabels.join(", ")}` : ""}
                              </span>
                            );
                          })}
                        </span>
                      </span>
                      <span className="text-right text-gray-700 font-medium">{formatCurrency(g.price)}</span>
                    </div>
                  ))}
                  {cart.map((ci, i) => {
                    // Lines folded into a bundle card above are hidden here.
                    if (checkoutBundledIdx.has(i)) return null;
                    return (
                    <div key={i} className="grid grid-cols-[40px_1fr_70px] gap-3 py-2.5 text-sm items-start">
                      <span className="font-semibold text-gray-700">{ci.isBundle ? "1×" : `${ci.quantity}×`}</span>
                      <span className="text-gray-700 min-w-0 break-words">
                        <span className="font-semibold">
                          {ci.isBundle ? (ci.bundlePromoName ?? ci.menuItem.name) : ci.menuItem.name}
                        </span>
                        {ci.variant && <span className="block text-xs text-gray-400">{ci.variant.name}</span>}
                        {ci.menuItem?.isRefundableDeposit && ci.menuItem?.depositAmount != null && ci.menuItem.depositAmount > 0 && (
                          <span className="inline-flex w-fit items-center gap-1 mt-0.5 text-[11px] font-medium text-violet-700 bg-violet-50 border border-violet-100 rounded-full px-2 py-0.5">
                            {tOrd("refundableDepositBadge", { amount: formatCurrency(ci.menuItem.depositAmount) })}
                          </span>
                        )}
                        {ci.modifierLabels && ci.modifierLabels.length > 0 && (
                          <span className="block mt-0.5">
                            {ci.modifierLabels.map((label, mi) => (
                              <span key={mi} className="block text-xs text-gray-400">+ {label}</span>
                            ))}
                          </span>
                        )}
                        {savedForLine[i] > 0 && (
                          // Own line under the item name (Fabrizio 2026-07-04:
                          // "wrap the discount text onto a new line, exactly
                          // how it is in the cart") — inline it squeezed next
                          // to long names on mobile.
                          <span className="flex w-fit items-center gap-1 mt-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5">
                            <span aria-hidden>👍</span> {tc("youSaved", { amount: formatCurrency(savedForLine[i]) })}
                          </span>
                        )}
                        {ci.isBundle && ci.bundleItems && ci.bundleItems.length > 0 && (
                          <span className="block mt-1 pl-3 border-l-2 border-gray-100 text-xs text-gray-500 space-y-0.5">
                            {ci.bundleItems.map((child, ci2) => {
                              // Full child build (crust/sauce/half-half/toppings/
                              // flavour) + note so checkout matches the cart and
                              // the customer can verify before paying (2026-07-08).
                              const { modifierLines, notes } = childBuildLines(child);
                              return (
                              <span key={ci2} className="block">
                                • {child.name}
                                {child.variantName ? ` (${child.variantName})` : ""}
                                {child.specialityFee && child.specialityFee > 0
                                  ? ` (+${formatCurrency(child.specialityFee)})`
                                  : ""}
                                {modifierLines.map((m, mi) => (
                                  <span key={mi} className="block pl-3 text-gray-400">+ {m.name}</span>
                                ))}
                                {notes && <span className="block pl-3 text-gray-400 italic">&ldquo;{notes}&rdquo;</span>}
                              </span>
                              );
                            })}
                          </span>
                        )}
                      </span>
                      <span className="text-right text-gray-700 font-medium">{formatCurrency(ci.lineTotal)}</span>
                    </div>
                  );})}
                </div>
              )}

              {/* Coupon */}
              <div className="mt-4 pt-4 border-t border-gray-200">
                {couponId ? (
                  <div className="flex items-center justify-between text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">
                    <span className="flex items-center gap-1.5"><Tag className="w-3.5 h-3.5" /> {tc.rich("couponAppliedLabel", { couponCode, mono: (chunks) => <span className="font-mono font-bold">{chunks}</span> })}</span>
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
                      // No raw handler reference: it would pass the click EVENT as the
                      // apply function's optional code arg (the checkout-Apply-dead bug,
                      // Fabrizio cmqtllluu 2026-07-03).
                      onClick={() => applyCoupon()} disabled={couponLoading}
                      className="bg-gray-900 text-white text-sm font-semibold px-3 rounded-lg hover:bg-gray-800 transition disabled:opacity-50"
                    >
                      {couponLoading ? "…" : tc("couponApply")}
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
                {/* Refundable deposit — charged, not taxed; already in `total`. */}
                {depositLinesTotal > 0 && (
                  <div className="flex justify-between text-violet-700"><span>{tOrd("refundableDepositNotTaxed")}</span><span>{formatCurrency(depositLinesTotal)}</span></div>
                )}
                <div className="flex justify-between font-bold text-gray-900 text-base pt-2 border-t border-gray-200 mt-1">
                  <span>{tc("total")}</span><span>{formatCurrency(total)}</span>
                </div>
                {creditChosen > 0 && (
                  <>
                    <div className="flex justify-between text-emerald-600 font-medium">
                      <span>{rewardLabelPlural}</span><span>− {formatCurrency(creditChosen)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-gray-900 text-base">
                      <span>{tc("reward.chargeToday")}</span><span>{formatCurrency(chargeToday)}</span>
                    </div>
                  </>
                )}
              </div>

              {/* Reward Dollars spend control — only for a signed-in customer
                  with a spendable balance. Default applies nothing (None). */}
              {rewardEligible && (
                <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-emerald-800">
                      {tc("reward.useTitle", { label: rewardLabelPlural })}
                    </span>
                    <span className="text-xs text-emerald-700">
                      {tc("reward.balance", { amount: formatCurrency(rewardInfo!.balance) })}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={rewardMax}
                      step="0.01"
                      value={creditChosen > 0 ? creditChosen : ""}
                      placeholder="0.00"
                      onChange={(e) => setCredit(parseFloat(e.target.value) || 0)}
                      className="w-28 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    />
                    <button
                      type="button"
                      onClick={() => setCredit(rewardMax)}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                    >
                      {tc("reward.useAll")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCredit(0)}
                      className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
                    >
                      {tc("reward.useNone")}
                    </button>
                  </div>
                  {rewardMax < rewardInfo!.balance && (
                    <p className="mt-1.5 flex items-center gap-1 text-[11px] text-emerald-700/80">
                      {tc("reward.capNote", { amount: formatCurrency(rewardMax) })}
                      {/* Explain WHY it's capped — the restaurant's max-% limit.
                          Only shown when the % (not the order total) is binding. */}
                      {rewardInfo!.maxRedeemPercent > 0 && rewardInfo!.maxRedeemPercent < 100 && (
                        <HelpTip text={tc("reward.capHelp", { percent: rewardInfo!.maxRedeemPercent, label: rewardLabelPlural })} />
                      )}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {scheduledTooEarly && (
          <div className="border-t border-red-100 px-5 py-2.5 bg-red-50 text-xs text-red-700 font-medium flex-shrink-0">
            {/* The key lives under ordering.toasts (NOT checkout.toasts) —
                referencing the wrong namespace rendered the raw key string
                to customers (Luigi 2026-07-04). */}
            {tOrd("toasts.scheduledInPast")}
          </div>
        )}
        {/* Footer — padding + button height deliberately MATCH the item modal's
            add-to-cart footer (p-5 container, py-4 button): Fabrizio's cmrj664ru
            "stuck to the bottom edge" was the footer hugging the modal's own
            bottom border, and his stated spec is "the same distance as when
            opening any dish". Keep these two footers in visual parity.
            ⚠️ Do NOT put the .safe-bottom class here: it sets padding-bottom to
            env(safe-area-inset-bottom), which is 0px on desktop and SILENTLY
            REPLACES the Tailwind bottom padding — that override was the actual
            three-round root cause of the flush footer. The calc() below COMPOSES
            the inset with the real padding instead. */}
        <div className="border-t border-gray-100 p-5 sm:py-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))] bg-white flex-shrink-0 flex items-center gap-3">
          <div className="flex-1">
            <div className="text-xs text-gray-500 uppercase font-bold">{creditChosen > 0 ? tc("reward.chargeToday") : tc("total")}</div>
            <div className="text-lg font-bold text-gray-900">{formatCurrency(creditChosen > 0 ? chargeToday : total)}</div>
          </div>
          <button
            onClick={placeOrder}
            disabled={orderLoading || cart.length === 0 || scheduledTooEarly || !!serviceConflictText}
            className="flex-1 sm:flex-none text-white font-bold py-4 px-6 rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-50 text-base"
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
    /* overflow-visible so the address suggestion list can extend past the
       card edge (it was clipped mid-list on short sections — review
       2026-07-19); the expanded body carries its own bottom rounding. */
    <div className="border border-gray-200 rounded-xl bg-white overflow-visible">
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
        <div className="px-4 pb-3 border-t border-gray-100 rounded-b-xl" style={{ backgroundColor: `${primary}06` }}>
          {children}
        </div>
      )}
    </div>
  );
}
