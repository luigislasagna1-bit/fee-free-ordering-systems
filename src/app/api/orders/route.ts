import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import prisma from "@/lib/db";
import { generateOrderNumber, formatCurrency } from "@/lib/utils";
import { applyPromotions, totalPromoDiscount } from "@/lib/promo-engine";
import { liveOpenStatus, nextOpenAt, parseLocalDateTimeInTz, localDowAndHHMM, dateKeyInTimezone } from "@/lib/restaurant-hours";
import { holidayEffectForDay, holidayEffectToday, canonicalHolidayService, hhmmInsideIntervals } from "@/lib/holiday-rules";
import { resolveServiceHours } from "@/lib/service-hours";
import { hasFulfilWindow, isFulfilableAt } from "@/lib/menu-fulfilment";
import { findZoneForPoint, geocodeAddress, type ZoneLike } from "@/lib/geocode";
import {
  resolveDeliveryAddressConfig,
  firstMissingRequiredField,
  composeFlatDeliveryAddress,
  DELIVERY_FIELD_KEYS,
  type DeliveryAddressData,
} from "@/lib/delivery-address-fields";
import { evaluateApplicableFees, sumAppliedFees, type ServiceFeeRow } from "@/lib/service-fees";
import { resolveMenuRestaurantId } from "@/lib/brand";
import { fireOrderNotifications } from "@/lib/order-notifications";
import { resolveInheritedHours } from "@/lib/inherited-data";
import { usedLifetimePromoIds, resolveAssignedPromoByCode } from "@/lib/coupon-ledger";
import { hasFeature } from "@/lib/entitlements";
import { parseComboConfig, comboAllowedVariantIds, comboUpchargeFor } from "@/lib/combo";
import { checkOrderCap, incrementOrderCount } from "@/lib/order-cap";
import { notifyCapWarning80, notifyCapReached100 } from "@/lib/cap-notify";
import {
  computeUberEatsEquivalentCents,
  recordMarketplaceOrder,
  isOnMarketplace,
} from "@/lib/marketplace";
import { recordSmartLinkOrder } from "@/lib/marketing-studio";
import { getCurrentCustomer } from "@/lib/customer-session";
import { getSessionUser } from "@/lib/session";
import { validateBooking, resolveDayHours, resolveReservationIntervals, type ReservationSettingsLike } from "@/lib/reservation-validation";
import { generateConfirmationCode, checkReservationCapacity } from "@/lib/reservation-booking";
import { isPaymentMethodAcceptedForType } from "@/lib/payment-methods";
const ALLOWED_ORDER_TYPES = ["pickup", "delivery", "dine_in", "take_out", "catering"] as const;

/** Human English label for an order type — used only as the en fallback in
 *  service-specific holiday rejections; the client re-localizes from the
 *  structured `service` field. */
function serviceDisplayLabel(orderType: string): string {
  const s = canonicalHolidayService(orderType);
  return s === "delivery" ? "Delivery"
    : s === "dine_in" ? "Dine-in"
    : s === "take_out" ? "Take-out"
    : s === "catering" ? "Catering"
    : s === "reservation" ? "Table reservations"
    : "Pickup";
}
// "cash"           = pay on pickup/delivery in cash
// "card"           = pay online by card via Stripe (gated by cardPaymentEnabled)
// "card_in_person" = customer pays by card in person (restaurant's own POS).
//                    No Stripe charge — same kitchen flow as cash.
// "paypal"         = pay online via PayPal Smart Buttons (gated by
//                    paypalEnabled — restaurant must have a connected
//                    PayPal app). Bug 2026-05-30: PayPal was added to
//                    the client picker and PayPal Smart Buttons flow,
//                    but this allow-list was never extended, so every
//                    PayPal order was rejected at submit with "Invalid
//                    payment method". Now properly listed.
const ALLOWED_PAYMENT_METHODS = ["cash", "card", "card_in_person", "paypal"] as const;
const MAX_ITEMS = 50;
const MAX_STRING = 500;

/** Server-side mirror of the customer page's isItemAvailableNow — evaluates
 *  a menu item's day/time availability window in the RESTAURANT's timezone.
 *  availableDays is stored as a JSON string column. */
function isMenuItemAvailableNow(
  item: { availableDays?: string | number[] | null; availableFrom?: string | null; availableTo?: string | null },
  timezone?: string,
): boolean {
  const { dow, hhmm } = localDowAndHHMM(new Date(), timezone);
  if (item.availableDays) {
    let days: number[] | null = null;
    if (Array.isArray(item.availableDays)) days = item.availableDays;
    else { try { const a = JSON.parse(item.availableDays); if (Array.isArray(a)) days = a; } catch { /* ignore */ } }
    if (days && days.length > 0 && !days.includes(dow)) return false;
  }
  if (item.availableFrom && item.availableTo) {
    if (hhmm < item.availableFrom || hhmm > item.availableTo) return false;
  }
  return true;
}

function sanitize(s: unknown, max = MAX_STRING): string {
  return String(s ?? "").trim().slice(0, max);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      restaurantSlug, type, customerName, customerEmail, customerPhone,
      deliveryAddress, deliveryCity, deliveryZip, deliveryAddressData: bodyDeliveryData, notes, paymentMethod,
      scheduledFor, couponId, marketingConsent,
      // Owner "Preview & test ordering" (reseller report cmq3red6b). Only
      // honoured after the admin-session check below — customers can't flag
      // their own orders as tests.
      isTest: bodyIsTest,
      // Typed coupon code from the cart's Apply field — fed into the
      // engine's couponPromos branch so autoApply=false promos with a
      // Promotion.couponCode match can fire on the server recompute.
      // Empty/undefined → engine ignores. Sanitised below.
      couponCode: bodyCouponCode,
      // Promo IDs the customer removed from the cart so a different
      // non-stackable deal could apply — excluded from the server recompute so
      // the charged discount matches the previewed one. Luigi 2026-06-07.
      suppressedPromoIds: bodySuppressedPromoIds,
      items, tip: clientTip,
      // Marketplace attribution: the customer was redirected here from
      // /marketplace/[slug] (which appends ?from=marketplace). The client
      // forwards this in the body so we can stamp the order as having
      // come via the marketplace channel. Trusted hint only — we also
      // verify the restaurant is currently entitled before stamping, so
      // a tampered client can't fake-stamp a direct order as marketplace.
      from,
      // Reserve-then-order (Luigi 2026-06-08): optional table-booking attached
      // to this order. When present (and the restaurant has allowPreOrder on)
      // we create a linked Reservation after the order so the kitchen gets one
      // booking-with-order. Shape: { date:"YYYY-MM-DD", time:"HH:MM",
      // partySize:number, notes?:string, tableId?:string }. Validated against
      // the SAME booking rules as a standalone reservation. Ignored/false-y for
      // every normal order, so this is a no-op for existing checkouts.
      reservation: bodyReservation,
      // Reports attribution: client forwards the same sessionHash the
      // visit-beacon already used so we can join Order.channel to the
      // WebsiteVisit's already-server-validated channel value (no need
      // to trust a `channel` field in the body — we compute it from
      // the sessionHash). Optional; null sessionHash → null channel.
      sessionHash,
    } = body;

    // ── Basic input validation ──────────────────────────────────────────────
    if (!restaurantSlug || !type || !customerName || !customerPhone) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    // Phone must be an actual phone number — digits + intl formatting only, no
    // letters, and at least a handful of digits. (Defense-in-depth: the
    // checkout field also strips letters as you type.)
    if (typeof customerPhone === "string" && customerPhone.trim()) {
      if (/[a-z]/i.test(customerPhone) || (customerPhone.match(/\d/g)?.length ?? 0) < 6) {
        return NextResponse.json({ error: "Please enter a valid phone number.", code: "invalid_phone" }, { status: 400 });
      }
    }
    if (!ALLOWED_ORDER_TYPES.includes(type)) {
      return NextResponse.json({ error: "Invalid order type" }, { status: 400 });
    }
    if (paymentMethod && !ALLOWED_PAYMENT_METHODS.includes(paymentMethod)) {
      return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Order must contain at least one item" }, { status: 400 });
    }
    if (items.length > MAX_ITEMS) {
      return NextResponse.json({ error: `Order cannot exceed ${MAX_ITEMS} items` }, { status: 400 });
    }
    if (sanitize(customerName).length < 2) {
      return NextResponse.json({ error: "Invalid customer name" }, { status: 400 });
    }
    // First AND last name required (the checkout marks both name fields with a
    // "*"). Two+ space-separated tokens; defense-in-depth behind the client
    // guard so a single-name submit can't slip through. (R6, 2026-06-14)
    if (sanitize(customerName).split(/\s+/).filter(Boolean).length < 2) {
      return NextResponse.json({ error: "Please enter a first and last name.", code: "full_name_required" }, { status: 400 });
    }
    // Delivery required-field validation is CONFIG-DRIVEN (customizable form):
    // a restaurant chooses which fields show + are required. We validate after
    // the restaurant (and its deliveryAddressConfig) is loaded — see the
    // "delivery address normalization" block below.

    // ── Load restaurant ─────────────────────────────────────────────────────
    // Includes openingHours because the closed-when-placed check
    // (Luigi 2026-05-30) needs them to determine whether to defer
    // the kitchen alert + use the 15-min closed-placed countdown vs
    // the standard 3-min. Without this include, the live-open check
    // sees an empty hours array → always reads "closed" → EVERY
    // order is stamped placedWhileClosed=true, even normal in-hours
    // ones (bug surfaced live 2026-05-30).
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug: sanitize(restaurantSlug, 100), isActive: true },
      include: {
        openingHours: { orderBy: { dayOfWeek: "asc" } },
        // One-off holiday closures — force "closed today" so holiday orders
        // are routed through the closed/schedule-for-later flow. Luigi 2026-06-04.
        holidays: true,
        // Key-only Stripe provider — used to verify card availability before
        // we ever create a card order (see the guard below).
        paymentProvider: { select: { isActive: true, publishableKey: true } },
      },
    });
    if (!restaurant) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });

    // Live inheritance (Phase 3, Luigi 2026-06-13): a child that inherits "hours"
    // is validated against the BRAND's opening hours — the SAME resolution the
    // customer page uses, so the displayed hours and the server's closed-check
    // always agree. Non-children skip the extra query.
    (restaurant as any).openingHours = await resolveInheritedHours(restaurant as any);

    // Owner "Preview & test ordering" (reseller report cmq3red6b): honour the
    // client's isTest flag ONLY for a logged-in admin of THIS restaurant (or a
    // superadmin). Verified test orders get a TEST- order number + "[TEST]"
    // name, ring the kitchen like real orders, and are excluded from every
    // report (the aggregators filter orderNumber TEST-). A customer sending
    // isTest gets a normal order — no way to self-exclude from revenue.
    let isVerifiedTest = false;
    if (bodyIsTest === true) {
      const adminUser = await getSessionUser().catch(() => null);
      isVerifiedTest =
        !!adminUser && (adminUser.restaurantId === restaurant.id || adminUser.role === "superadmin");
    }

    // ── Reserve-then-order: validate the optional table-booking payload ───────
    // Done EARLY (fail-fast) so we never create an order — or take a payment —
    // for a booking that violates the restaurant's reservation rules. The
    // actual Reservation row is created AFTER order.create (it needs order.id +
    // the server-computed total) and rides the order's payment lifecycle: no
    // separate email, hidden from the kitchen feed until the order is released.
    // Luigi 2026-06-08. Only runs when a `reservation` payload is present, so
    // it's a no-op for every normal order.
    let reservationData:
      | { date: string; time: string; partySize: number; notes: string | null; tableId: string | null }
      | null = null;
    // Whether this restaurant auto-CONFIRMS reservations. A pre-order (booking +
    // food) is ONE unit, so it should auto-accept when auto is on for EITHER
    // side — order auto-accept OR reservation auto-confirm. Captured here at the
    // outer scope so the auto-accept decision below can read it. Luigi 2026-06-09.
    let reservationAutoConfirm = false;
    if (bodyReservation && typeof bodyReservation === "object") {
      const rs = await prisma.reservationSettings.findUnique({
        where: { restaurantId: restaurant.id },
      });
      if (!(restaurant as any).acceptsReservations || !rs?.allowPreOrder) {
        return NextResponse.json(
          { error: "Pre-ordering with a reservation isn't enabled for this restaurant.", code: "preorder_reservation_disabled" },
          { status: 400 },
        );
      }
      // Reservations paused (admin Services page / kitchen app) → block the
      // reserve-then-order booking too, mirroring the standalone reservations
      // guard + the customer paused banner. Without this, pausing reservations
      // would stop standalone bookings but still let a combined-checkout booking
      // through. Auto-resumes when reservationsPausedUntil is in the past.
      const rPaused = (restaurant as any).reservationsPausedUntil;
      if (rPaused && new Date(rPaused).getTime() > Date.now()) {
        const resumesAt = new Date(rPaused).toLocaleString();
        return NextResponse.json(
          { error: `Reservations are temporarily paused by the restaurant. Estimated to resume around ${resumesAt}.`, code: "service_paused" },
          { status: 423 },
        );
      }
      const rDate = sanitize((bodyReservation as any).date, 10);
      const rTime = sanitize((bodyReservation as any).time, 5);
      const rPartySize = parseInt(String((bodyReservation as any).partySize), 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(rDate) || !/^\d{2}:\d{2}$/.test(rTime) || !Number.isFinite(rPartySize) || rPartySize < 1) {
        return NextResponse.json({ error: "Invalid reservation details.", code: "reservation_invalid" }, { status: 400 });
      }
      // SAME validation a standalone booking goes through (notice window, max
      // advance, guest bounds) — evaluated in the restaurant's timezone.
      const v = validateBooking(
        rs as unknown as ReservationSettingsLike,
        { date: rDate, time: rTime, partySize: rPartySize },
        new Date(),
        (restaurant as any).timezone,
        resolveDayHours(rs.reservationHours, (restaurant as any).openingHours ?? [], rDate),
        resolveReservationIntervals((restaurant as any).openingHours ?? [], rDate),
      );
      if (!v.ok) return NextResponse.json({ error: v.reason, code: "reservation_rejected" }, { status: 400 });
      // Holiday/closure gate for the BOOKING — mirror the standalone
      // /api/public/reservations check. A reserve-then-order booking must respect
      // the restaurant's closures for the RESERVATION service on the booking date,
      // exactly like a standalone table booking. (Previously this combined path
      // had no holiday gate — flagged by the Fabrizio-#1 verification.)
      {
        const rHolEff = holidayEffectForDay((restaurant as any).holidays ?? [], rDate, "reservation");
        if (rHolEff?.kind === "closed") {
          return NextResponse.json(
            { error: "We're closed for reservations on that date. Please choose another day.", code: "reservation_holiday_closed" },
            { status: 400 },
          );
        }
        if (rHolEff?.kind === "custom_hours" && !hhmmInsideIntervals(rTime, rHolEff.intervals)) {
          const windows = rHolEff.intervals.map((iv) => `${iv.open}–${iv.close}`).join(", ");
          return NextResponse.json(
            { error: `On that date reservations are only available ${windows}. Please pick a time within those hours.`, code: "reservation_holiday_custom_hours" },
            { status: 400 },
          );
        }
        if (rHolEff?.kind === "closed_windows" && hhmmInsideIntervals(rTime, rHolEff.intervals)) {
          const windows = rHolEff.intervals.map((iv) => `${iv.open}–${iv.close}`).join(", ");
          return NextResponse.json(
            { error: `Reservations are closed ${windows} on that date. Please pick a time outside those hours.`, code: "reservation_holiday_closed_windows" },
            { status: 400 },
          );
        }
      }
      const cap = await checkReservationCapacity(
        restaurant.id,
        rs as unknown as ReservationSettingsLike,
        rDate, rTime, rPartySize,
      );
      if (!cap.ok) return NextResponse.json({ error: cap.reason, code: "reservation_full" }, { status: 409 });
      // Optional table — must belong to this restaurant + be active.
      let rTableId: string | null = null;
      const rawTableId = (bodyReservation as any).tableId ? String((bodyReservation as any).tableId) : null;
      if (rawTableId) {
        const tbl = await prisma.reservationTable.findFirst({
          where: { id: rawTableId, restaurantId: restaurant.id, isActive: true },
          select: { id: true },
        });
        rTableId = tbl?.id ?? null;
      }
      reservationAutoConfirm = !!rs.autoConfirm;
      reservationData = {
        date: rDate,
        time: rTime,
        partySize: rPartySize,
        notes: (bodyReservation as any).notes ? sanitize((bodyReservation as any).notes, 500) : null,
        tableId: rTableId,
      };
    }

    // Reserve-then-order: the BOOKING time is authoritative — the food is FOR
    // the table time. Use it as the order's scheduled slot so the order's
    // requested time ALWAYS matches the reservation, no matter what the client
    // sent (the checkout slot picker must never drift them apart). Luigi 2026-06-08.
    const effectiveScheduledFor = reservationData
      ? `${reservationData.date}T${reservationData.time}`
      : scheduledFor;

    // ── Delivery address normalization + config-driven validation ─────────────
    // The restaurant may have customized which address fields show / are
    // required (deliveryAddressConfig). Build a sanitized structured blob from
    // the body (preferred) or fall back to the legacy flat fields, validate the
    // required fields against the resolved config, then compose the flat
    // deliveryAddress/City/Zip columns from the structured data so receipts,
    // the kitchen display, and dispatch keep working unchanged. Luigi 2026-06-04.
    let deliveryData: DeliveryAddressData | null = null;
    // Address fields belong ONLY to address-bearing orders (delivery, and
    // catering when delivered). A pickup / dine-in / take-out order must NEVER
    // carry a delivery address even if a stale or buggy client sends one — that
    // produced orders with a pickup icon AND an address on the kitchen tile
    // (Luigi 2026-06-13). This is the authoritative guard; the customer page
    // also stops sending it, but the server is the source of truth.
    const typeAllowsAddress = type === "delivery" || type === "catering";
    let flatAddress: string | null = typeAllowsAddress && deliveryAddress ? String(deliveryAddress) : null;
    let flatCity: string | null = typeAllowsAddress && deliveryCity ? String(deliveryCity) : null;
    let flatZip: string | null = typeAllowsAddress && deliveryZip ? String(deliveryZip) : null;
    if (type === "delivery") {
      const cfg = resolveDeliveryAddressConfig((restaurant as any).deliveryAddressConfig);
      const rawData =
        bodyDeliveryData && typeof bodyDeliveryData === "object"
          ? (bodyDeliveryData as Record<string, unknown>)
          : {};
      const data: DeliveryAddressData = {};
      for (const key of DELIVERY_FIELD_KEYS) {
        const v = rawData[key];
        if (typeof v === "string" && v.trim()) data[key] = sanitize(v, 200);
      }
      // Legacy fallback: an older client (or a direct API call) that only sends
      // the flat fields still maps onto street/city/postcode.
      if (Object.keys(data).length === 0) {
        if (flatAddress) data.street = sanitize(flatAddress, 300);
        if (flatCity) data.city = sanitize(flatCity, 100);
        if (flatZip) data.postcode = sanitize(flatZip, 20);
      }
      const missing = firstMissingRequiredField(cfg, data);
      if (missing) {
        return NextResponse.json(
          { error: "Delivery address incomplete", code: "delivery_field_required", field: missing },
          { status: 400 },
        );
      }
      deliveryData = Object.keys(data).length ? data : null;
      // Recompose the flat columns from the structured data (single source).
      flatCity = data.city?.trim() || null;
      flatZip = data.postcode?.trim() || null;
      const composed = composeFlatDeliveryAddress(data);
      flatAddress = composed || flatAddress || null;
    }

    // ── Card / PayPal availability guard (defense-in-depth, Luigi 2026-06-04) ──
    // After the Connect→key-only migration a restaurant can still list
    // "online_card" in its accepted methods (legacy) while having NO active
    // key-only provider. Without this guard, selecting card creates a "ghost"
    // order: payment never happens, notifiedAt stays null, so it never reaches
    // the kitchen — yet the customer sees "Order Placed". Refuse it up-front so
    // they pick a working method (or the restaurant finishes Stripe setup).
    if (paymentMethod === "card") {
      const provider = (restaurant as any).paymentProvider;
      const cardOk =
        !!(provider?.isActive && provider.publishableKey) &&
        (await hasFeature(restaurant.id, "card_payments"));
      if (!cardOk) {
        return NextResponse.json(
          {
            error:
              "Online card payments aren't available for this restaurant right now. Please choose another payment method.",
            code: "card_unavailable",
          },
          { status: 400 },
        );
      }
    }
    if (paymentMethod === "paypal") {
      const paypalOk =
        (restaurant as any).paypalAccountStatus === "connected" &&
        (await hasFeature(restaurant.id, "card_payments"));
      if (!paypalOk) {
        return NextResponse.json(
          {
            error:
              "PayPal isn't available for this restaurant right now. Please choose another payment method.",
            code: "paypal_unavailable",
          },
          { status: 400 },
        );
      }
    }

    // ── Paused-service guard (Luigi 2026-06-01) ─────────────────────────────
    // Server-side mirror of the customer-page banner + disabled button.
    // A tampered client could POST an order for a paused service; this
    // check refuses it. orderType is one of pickup / delivery / dine_in /
    // catering / take_out. The per-service pausedUntil columns auto-resume
    // when their timestamp passes — same logic on both sides.
    const pauseField = (() => {
      switch (type) {
        case "pickup":   return (restaurant as any).pickupPausedUntil;
        case "delivery": return (restaurant as any).deliveryPausedUntil;
        case "dine_in":  return (restaurant as any).dineInPausedUntil;
        case "take_out": return (restaurant as any).takeOutPausedUntil;
        case "catering": return (restaurant as any).cateringPausedUntil;
        default:         return null;
      }
    })();
    if (pauseField && new Date(pauseField).getTime() > Date.now()) {
      const resumesAt = new Date(pauseField).toLocaleString();
      return NextResponse.json(
        {
          error: `${type} is temporarily paused by the restaurant. Estimated to resume around ${resumesAt}.`,
          code: "service_paused",
        },
        { status: 423 },
      );
    }

    // ── Server-side price calculation ───────────────────────────────────────
    // Menu items may live on the parent restaurant if this location inherits
    // the brand menu (useBrandMenu=true). Resolve the effective menu owner
    // before validating — otherwise inherited-menu locations would reject
    // every order with "menu item not found".
    const menuRestaurantId = await resolveMenuRestaurantId(restaurant.id);
    // Collect ids from BOTH the top-level items AND each item's bundleItems
    // children (the child menuItemIds are real menu items that we must
    // validate live on this restaurant). The bundle parent's own
    // `menuItemId` is a synthetic `bundle:<promoId>` string and is
    // skipped from the menu lookup.
    const menuItemIds = [...new Set(
      items.flatMap((i: any) => {
        const ids: string[] = [];
        if (typeof i.menuItemId === "string" && !i.menuItemId.startsWith("bundle:")) {
          ids.push(i.menuItemId);
        }
        if (Array.isArray(i.bundleItems)) {
          for (const child of i.bundleItems) {
            if (child && typeof child.menuItemId === "string") {
              ids.push(child.menuItemId);
            }
          }
        }
        return ids;
      })
    )];
    const menuItems = await prisma.menuItem.findMany({
      where: { id: { in: menuItemIds }, restaurantId: menuRestaurantId, isAvailable: true },
      include: {
        variants: true,
        modifierGroups: { include: { options: { where: { isAvailable: true } } } },
        // Pull the parent category's catering flag AND its category-level
        // shared modifier groups. Categories can carry modifier groups
        // shared across every item in the category (e.g. "Pizza 1 Crust"
        // shared by every pizza in PIZZAS). Without including these the
        // validator below rejects valid category-modifier option IDs as
        // "Invalid modifier option" because they don't appear in
        // menuItem.modifierGroups. Surfaced by Luigi 2026-05-30 right
        // after the GloriaFood importer first populated category groups.
        category: {
          select: {
            isCatering: true,
            modifierGroups: { include: { options: { where: { isAvailable: true } } } },
          },
        },
      },
    });
    const menuItemMap = new Map(menuItems.map((m) => [m.id, m]));

    // Authoritative bundle pricing (audit B3/B6): bundle lines used to trust the
    // client-supplied price, so a tampered request could underpay. Pre-load the
    // referenced meal_bundle / meal_bundle_speciality promotions ONCE here, then
    // recompute each bundle line's price from the saved ruleConfig in the loop
    // below — never from the client. One batched query (bundles are rare).
    const bundlePromoIdSet = new Set<string>();
    for (const raw of items as any[]) {
      const isB =
        (typeof raw?.menuItemId === "string" && raw.menuItemId.startsWith("bundle:")) ||
        (raw?.isBundle === true && Array.isArray(raw?.bundleItems) && raw.bundleItems.length > 0);
      if (!isB) continue;
      const pid =
        typeof raw?.bundlePromoId === "string" && raw.bundlePromoId
          ? raw.bundlePromoId
          : typeof raw?.menuItemId === "string" && raw.menuItemId.startsWith("bundle:")
            ? raw.menuItemId.slice("bundle:".length)
            : "";
      if (pid) bundlePromoIdSet.add(pid);
    }
    const bundlePromoMap = new Map<string, { id: string; name: string; promotionType: string; ruleConfig: unknown; rules: string | null }>();
    if (bundlePromoIdSet.size > 0) {
      const ownerIds = Array.from(new Set([restaurant.id, menuRestaurantId]));
      const bps = await prisma.promotion.findMany({
        where: {
          id: { in: Array.from(bundlePromoIdSet) },
          restaurantId: { in: ownerIds },
          isActive: true,
          promotionType: { in: ["meal_bundle", "meal_bundle_speciality"] },
        },
        select: { id: true, name: true, promotionType: true, ruleConfig: true, rules: true },
      });
      for (const bp of bps) bundlePromoMap.set(bp.id, bp as any);
    }

    let serverSubtotal = 0;
    const validatedItems: Array<{
      menuItemId: string | null; variantId: string | null; variantName: string | null;
      name: string; price: number; quantity: number; notes: string | null; subtotal: number;
      modifiers: Array<{ modifierOptionId: string; name: string; priceAdjustment: number }>;
      bundleItems: unknown | null;
    }> = [];

    for (const raw of items) {
      // ── Combo line item branch ─────────────────────────────────────
      // A combo is a REAL MenuItem (with comboConfig) whose price the
      // customer pays for the whole bundle, PLUS owner-defined per-item
      // upcharges. Unlike promo bundles we DON'T trust the client price:
      // we recompute it server-side from the saved comboConfig so a
      // tampered client can't underpay. We validate every child against
      // the combo's slot pools (eligibility + min/max), assign each pick
      // to a slot greedily, and sum the configured upcharges. The combo
      // is fixed-price, so a customized-pizza child's modifier price
      // adjustments are display-only (never added to the total).
      const isComboLine =
        raw.isCombo === true &&
        typeof raw.menuItemId === "string" &&
        Array.isArray(raw.bundleItems) &&
        raw.bundleItems.length > 0;
      if (isComboLine) {
        const comboParent = menuItemMap.get(String(raw.menuItemId));
        if (!comboParent) {
          return NextResponse.json({ error: `Combo item not found: ${raw.menuItemId}` }, { status: 400 });
        }
        const comboConfig = parseComboConfig((comboParent as any).comboConfig);
        if (!comboConfig) {
          return NextResponse.json({ error: "Item is not a combo" }, { status: 400 });
        }
        // Same day/time availability guard as normal items (restaurant tz).
        if (!isMenuItemAvailableNow(comboParent, (restaurant as any).timezone)) {
          return NextResponse.json(
            { error: `"${comboParent.name}" isn't available at this time.`, code: "item_unavailable_now" },
            { status: 400 },
          );
        }
        const slotFill = comboConfig.slots.map(() => 0);
        let comboUpcharge = 0;
        const comboChildren: Array<{
          menuItemId: string; variantId?: string | null;
          name: string; variantName?: string | null;
          modifiers?: Array<{ name: string; priceAdjustment?: number }>;
          notes?: string | null; specialityFee?: number; extrasFee?: number;
          pizzaCustomization?: unknown;
        }> = [];
        for (const child of raw.bundleItems) {
          if (!child || typeof child !== "object") {
            return NextResponse.json({ error: "Invalid combo child" }, { status: 400 });
          }
          const cid = String(child.menuItemId ?? "");
          const cm = menuItemMap.get(cid);
          if (!cm) {
            return NextResponse.json({ error: `Combo references unknown menu item: ${cid}` }, { status: 400 });
          }
          // Greedily assign to the first slot that accepts this item and
          // still has room. Eligibility = explicit itemId OR category match.
          let assigned = -1;
          for (let si = 0; si < comboConfig.slots.length; si++) {
            const s = comboConfig.slots[si];
            const eligible =
              s.itemIds.includes(cid) ||
              (!!(cm as any).categoryId && s.categoryIds.includes((cm as any).categoryId));
            if (eligible && slotFill[si] < s.max) { assigned = si; break; }
          }
          if (assigned < 0) {
            return NextResponse.json({ error: `"${cm.name}" isn't a valid choice for this combo.` }, { status: 400 });
          }
          slotFill[assigned] += 1;
          const slot = comboConfig.slots[assigned];

          // Resolve + validate the chosen SIZE (variant). We never trust the
          // client's variant blindly: it must be a real variant of the item,
          // and for non-pizza sized items it must be one the owner allowed in
          // this combo slot. Pizza sizes come from the builder and aren't
          // size-restricted here.
          const cmVariants: Array<{ id: string; name: string }> =
            Array.isArray((cm as any).variants) ? (cm as any).variants : [];
          // Server-safe pizza detection (the full parser is a client module).
          // A pizza item carries a non-empty pizzaConfig JSON with isPizza.
          const isPizzaChild = (() => {
            const raw = (cm as any).pizzaConfig;
            if (typeof raw !== "string" || !raw.trim()) return false;
            try { const o = JSON.parse(raw); return !!o && typeof o === "object" && o.isPizza === true; } catch { return false; }
          })();
          const reqVar = child.variantId ? String(child.variantId) : null;
          let variantId: string | null = null;
          let variantName: string | null = null;
          if (cmVariants.length > 0) {
            if (isPizzaChild) {
              const chosen = reqVar ? cmVariants.find((v) => v.id === reqVar) : null;
              if (chosen) { variantId = chosen.id; variantName = chosen.name; }
            } else {
              const allowedIds = comboAllowedVariantIds(slot, cid); // null ⇒ all
              let chosen = reqVar ? cmVariants.find((v) => v.id === reqVar) : null;
              if (!chosen) {
                const pool = allowedIds ? cmVariants.filter((v) => allowedIds.includes(v.id)) : cmVariants;
                if (pool.length === 1) chosen = pool[0]; // single fixed size — auto-apply
              }
              if (!chosen) {
                return NextResponse.json({ error: `Please choose a size for "${cm.name}".` }, { status: 400 });
              }
              if (allowedIds && !allowedIds.includes(chosen.id)) {
                return NextResponse.json({ error: `"${chosen.name}" isn't an available size for this combo.` }, { status: 400 });
              }
              variantId = chosen.id; variantName = chosen.name;
            }
          }

          const up = comboUpchargeFor(slot, cid, variantId);

          // Modifiers + add-on surcharge. The combo's extrasCharge flag decides
          // whether add-ons cost extra. Non-pizza modifiers are re-priced from
          // the DB (authoritative); a pizza's extra-topping surcharge is trusted
          // from the client, the same model standalone pizzas already use.
          const rawChildMods: any[] = Array.isArray(child.modifiers) ? child.modifiers : [];
          let childMods: Array<{ name: string; priceAdjustment?: number }> | undefined;
          let extras = 0;
          if (isPizzaChild) {
            childMods = rawChildMods.slice(0, 60).map((m: any) => ({
              name: sanitize(m?.name ?? "", 200),
              priceAdjustment: typeof m?.priceAdjustment === "number" ? m.priceAdjustment : 0,
            }));
            if (childMods.length === 0) childMods = undefined;
            if (comboConfig.extrasCharge) {
              extras = Math.max(0, Math.round((Number(child.extrasFee) || 0) * 100) / 100);
            }
          } else {
            // Re-validate each modifier against the item's own + category groups,
            // pricing from the DB. Unknown options are dropped (never trusted).
            const candidateGroups = [
              ...((cm as any).modifierGroups ?? []),
              ...(((cm as any).category as any)?.modifierGroups ?? []),
            ];
            const validated: Array<{ name: string; priceAdjustment?: number }> = [];
            let modSum = 0;
            for (const rm of rawChildMods.slice(0, 60)) {
              let found: any = null;
              for (const g of candidateGroups) {
                const o = g.options.find((x: any) => x.id === rm?.modifierOptionId);
                if (o) { found = o; break; }
              }
              if (found) {
                modSum += found.priceAdjustment;
                validated.push({ name: sanitize(rm?.name ?? found.name, 200), priceAdjustment: found.priceAdjustment });
              }
            }
            childMods = validated.length ? validated : undefined;
            if (comboConfig.extrasCharge) extras = Math.max(0, Math.round(modSum * 100) / 100);
          }

          comboUpcharge += up + extras;
          comboChildren.push({
            menuItemId: cid,
            variantId,
            // Name/variantName from the server's record (not client) — display
            // truth; keeps a tampered label out of the kitchen ticket.
            name: sanitize(cm.name, 200),
            variantName: variantName ? sanitize(variantName, 100) : null,
            modifiers: childMods,
            notes: child.notes ? sanitize(child.notes, 200) : null,
            specialityFee: up > 0 ? Math.round(up * 100) / 100 : undefined,
            extrasFee: extras > 0 ? extras : undefined,
            pizzaCustomization:
              child.pizzaCustomization && typeof child.pizzaCustomization === "object"
                ? child.pizzaCustomization
                : undefined,
          });
        }
        // Every slot's minimum must be satisfied.
        for (let si = 0; si < comboConfig.slots.length; si++) {
          if (slotFill[si] < comboConfig.slots[si].min) {
            return NextResponse.json({ error: "Please complete all combo choices." }, { status: 400 });
          }
        }
        const comboQty = Math.max(1, Math.min(99, parseInt(raw.quantity, 10) || 1));
        const comboUnit = Math.max(0, Math.round((comboParent.price + comboUpcharge) * 100) / 100);
        const comboLineTotal = Math.round(comboUnit * comboQty * 100) / 100;
        serverSubtotal += comboLineTotal;
        validatedItems.push({
          menuItemId: comboParent.id, // combos ARE real menu items
          variantId: null,
          variantName: null,
          name: comboParent.name,
          price: comboUnit,
          quantity: comboQty,
          notes: raw.notes ? sanitize(raw.notes, 200) : null,
          subtotal: comboLineTotal,
          modifiers: [],
          bundleItems: comboChildren,
        });
        continue;
      }

      // ── Bundle line item branch ────────────────────────────────────
      // Promo Type 8 / 13 bundles arrive with a synthetic menuItemId
      // ("bundle:<promoId>") + a non-empty bundleItems array. The parent
      // isn't a real MenuItem, so we don't look it up in the menu — but we
      // DO recompute the price server-side from the promotion's saved
      // ruleConfig (audit B3/B6): fixed bundlePrice + per-slot speciality
      // fees, NEVER the client-supplied subtotal/specialityFee. We validate
      // every child belongs to this restaurant AND fills a real bundle slot
      // (eligibility + min/max) so a tampered client can't underpay or stuff
      // extra items into the flat bundle price.
      const isBundleLine =
        (typeof raw.menuItemId === "string" && raw.menuItemId.startsWith("bundle:")) ||
        (raw.isBundle === true && Array.isArray(raw.bundleItems) && raw.bundleItems.length > 0);
      if (isBundleLine) {
        if (!Array.isArray(raw.bundleItems) || raw.bundleItems.length === 0) {
          return NextResponse.json({ error: "Bundle item missing children" }, { status: 400 });
        }
        const bundlePromoId =
          typeof raw.bundlePromoId === "string" && raw.bundlePromoId
            ? raw.bundlePromoId
            : typeof raw.menuItemId === "string" && raw.menuItemId.startsWith("bundle:")
              ? raw.menuItemId.slice("bundle:".length)
              : "";
        const bundlePromo = bundlePromoId ? bundlePromoMap.get(bundlePromoId) : undefined;
        if (!bundlePromo) {
          return NextResponse.json(
            { error: "This bundle is no longer available.", code: "bundle_unavailable" },
            { status: 400 },
          );
        }
        const isSpeciality = bundlePromo.promotionType === "meal_bundle_speciality";
        // Parse ruleConfig (JSON column) with a fallback to the legacy `rules`
        // string, mirroring the engine's getRules.
        let bRC: any = bundlePromo.ruleConfig;
        if (typeof bRC === "string") { try { bRC = JSON.parse(bRC); } catch { bRC = null; } }
        if (!bRC || typeof bRC !== "object") { try { bRC = JSON.parse(bundlePromo.rules ?? "{}"); } catch { bRC = {}; } }
        const bundlePrice = Math.max(0, Number(bRC?.bundlePrice ?? 0));
        const bundleGroups: any[] = Array.isArray(bRC?.groups) ? bRC.groups : [];

        const slotFill = bundleGroups.map(() => 0);
        let specialityUpcharge = 0;
        const sanitisedChildren: Array<{
          menuItemId: string; variantId?: string | null;
          name: string; variantName?: string | null;
          modifiers?: Array<{ name: string; priceAdjustment?: number }>;
          notes?: string | null;
          specialityFee?: number;
        }> = [];
        for (const child of raw.bundleItems) {
          if (!child || typeof child !== "object") {
            return NextResponse.json({ error: "Invalid bundle child" }, { status: 400 });
          }
          const cid = String(child.menuItemId ?? "");
          const childMenuItem = menuItemMap.get(cid);
          if (!childMenuItem) {
            return NextResponse.json(
              { error: `Bundle item references unknown menu item: ${cid}` },
              { status: 400 },
            );
          }
          // Greedy slot assignment (mirrors the combo branch + the customer's
          // composer): the child must be eligible for some slot (by id or
          // category) that still has room (maxCount). The slot's CONFIGURED
          // speciality fee — not the client's — is what we charge.
          let assigned = -1;
          for (let gi = 0; gi < bundleGroups.length; gi++) {
            const g = bundleGroups[gi] ?? {};
            const idSet: string[] = [
              ...(Array.isArray(g.itemIds) ? g.itemIds : []),
              ...(Array.isArray(g.menuItemIds) ? g.menuItemIds : []),
            ];
            const catSet: string[] = Array.isArray(g.categoryIds) ? g.categoryIds : [];
            const eligible =
              idSet.includes(cid) ||
              (!!(childMenuItem as any).categoryId && catSet.includes((childMenuItem as any).categoryId));
            const max = Math.max(1, Number(g.maxCount ?? g.minCount ?? 1));
            if (eligible && slotFill[gi] < max) { assigned = gi; break; }
          }
          if (bundleGroups.length > 0 && assigned < 0) {
            return NextResponse.json(
              { error: `"${sanitize(child.name ?? childMenuItem.name, 200)}" isn't a valid choice for this bundle.` },
              { status: 400 },
            );
          }
          let slotFee = 0;
          if (assigned >= 0) {
            slotFill[assigned] += 1;
            if (isSpeciality) slotFee = Math.max(0, Number(bundleGroups[assigned]?.extraFee ?? 0));
            specialityUpcharge += slotFee;
          }
          sanitisedChildren.push({
            menuItemId: cid,
            variantId: child.variantId ? String(child.variantId) : null,
            name: sanitize(child.name ?? childMenuItem.name, 200),
            variantName: child.variantName ? sanitize(child.variantName, 100) : null,
            modifiers: Array.isArray(child.modifiers)
              ? child.modifiers.slice(0, 20).map((m: any) => ({
                  name: sanitize(m?.name ?? "", 200),
                  priceAdjustment:
                    typeof m?.priceAdjustment === "number" ? m.priceAdjustment : 0,
                }))
              : undefined,
            notes: child.notes ? sanitize(child.notes, 200) : null,
            // Server-derived fee (clamped to config), never the client's value.
            specialityFee: slotFee > 0 ? Math.round(slotFee * 100) / 100 : undefined,
          });
        }
        // Every slot's minimum must be satisfied (server-enforced).
        for (let gi = 0; gi < bundleGroups.length; gi++) {
          const min = Math.max(0, Number(bundleGroups[gi]?.minCount ?? 1));
          if (slotFill[gi] < min) {
            return NextResponse.json({ error: "Please complete all bundle choices." }, { status: 400 });
          }
        }
        const bundleQty = Math.max(1, Math.min(99, parseInt(raw.quantity, 10) || 1));
        // Authoritative price: fixed bundlePrice + configured speciality fees.
        const bundleUnitPrice = Math.max(0, Math.round((bundlePrice + specialityUpcharge) * 100) / 100);
        const bundleLineTotal = Math.round(bundleUnitPrice * bundleQty * 100) / 100;
        serverSubtotal += bundleLineTotal;

        validatedItems.push({
          menuItemId: null, // synthetic bundle wrapper — not a real MenuItem
          variantId: null,
          variantName: null,
          name: sanitize(raw.bundlePromoName ?? raw.name ?? bundlePromo.name ?? "Bundle", 200),
          price: bundleUnitPrice,
          quantity: bundleQty,
          notes: raw.notes ? sanitize(raw.notes, 200) : null,
          subtotal: bundleLineTotal,
          modifiers: [],
          bundleItems: sanitisedChildren,
        });
        continue;
      }

      const menuItem = menuItemMap.get(String(raw.menuItemId));
      if (!menuItem) {
        return NextResponse.json({ error: `Menu item not found: ${raw.menuItemId}` }, { status: 400 });
      }

      // Day/time availability guard (server-side defence). The customer page
      // already hides out-of-window items, but a crafted request could still
      // include one — the restaurant set the limit for a reason (lunch-only,
      // weekend special, etc.), so enforce it here in the RESTAURANT tz.
      if (!isMenuItemAvailableNow(menuItem, (restaurant as any).timezone)) {
        return NextResponse.json(
          { error: `"${menuItem.name}" isn't available at this time.`, code: "item_unavailable_now" },
          { status: 400 },
        );
      }

      const qty = Math.max(1, Math.min(99, parseInt(raw.quantity, 10) || 1));

      // Validate variant
      let variantId: string | null = null;
      let variantName: string | null = null;
      let basePrice = menuItem.price;
      if (menuItem.hasVariants) {
        const variant = menuItem.variants.find((v) => v.id === raw.variantId);
        if (!variant) {
          return NextResponse.json({ error: `Invalid variant for ${menuItem.name}` }, { status: 400 });
        }
        variantId = variant.id;
        variantName = variant.name;
        basePrice = variant.price;
      }

      // Validate modifiers
      let modTotal = 0;
      const validatedMods: Array<{ modifierOptionId: string; name: string; priceAdjustment: number }> = [];
      const rawMods: any[] = Array.isArray(raw.modifiers) ? raw.modifiers : [];

      // Search both item-level groups (menuItem.modifierGroups — covers
      // item-scoped AND variant-scoped because both have menuItemId set)
      // AND category-level shared groups. Category-level groups are how
      // platforms like GloriaFood model "every pizza shares the same
      // Crust + Cooked options" without duplicating onto each item.
      const candidateGroups = [
        ...menuItem.modifierGroups,
        ...((menuItem.category as any)?.modifierGroups ?? []),
      ];
      for (const rawMod of rawMods) {
        let found = false;
        for (const group of candidateGroups) {
          const opt = group.options.find((o: any) => o.id === rawMod.modifierOptionId);
          if (opt) {
            modTotal += opt.priceAdjustment;
            // Prefer the client-supplied display name when present — this is how
            // PizzaBuilder labels modifiers with their role and placement
            // (e.g. "Sauce: Pizza Sauce (Left Half)", "Pepperoni (Whole)").
            // Price is always taken from the DB option, so this can't be abused
            // for price tampering. Length-capped via sanitize().
            const clientName = typeof rawMod.name === "string" ? sanitize(rawMod.name, 200) : "";
            validatedMods.push({
              modifierOptionId: opt.id,
              name: clientName || opt.name,
              priceAdjustment: opt.priceAdjustment,
            });
            found = true;
            break;
          }
        }
        if (!found) {
          return NextResponse.json({ error: `Invalid modifier option: ${rawMod.modifierOptionId}` }, { status: 400 });
        }
      }

      const unitPrice = Math.max(0, basePrice + modTotal);
      const lineTotal = Math.round(unitPrice * qty * 100) / 100;
      serverSubtotal += lineTotal;

      validatedItems.push({
        menuItemId: menuItem.id,
        variantId,
        variantName,
        name: menuItem.name + (variantName ? ` (${variantName})` : ""),
        price: unitPrice,
        quantity: qty,
        notes: raw.notes ? sanitize(raw.notes, 200) : null,
        subtotal: lineTotal,
        modifiers: validatedMods,
        bundleItems: null,
      });
    }

    serverSubtotal = Math.round(serverSubtotal * 100) / 100;

    // ── Minimum order check (delivery uses zone-specific minimum below) ─────
    if (type !== "delivery" && restaurant.minimumOrder > 0 && serverSubtotal < restaurant.minimumOrder) {
      return NextResponse.json({ error: `Minimum order is ${formatCurrency(restaurant.minimumOrder, (restaurant as any).currency ?? "usd")}` }, { status: 400 });
    }

    // ── Coupon validation (server-side) ─────────────────────────────────────
    // Effective coupon pool = this location's coupons + any "brand"-scoped
    // coupons owned by the parent (chain-wide promos work at any location).
    // We build the where-clause via an OR so a single query covers both.
    let serverCouponDiscount = 0;
    let resolvedCouponId: string | null = null;
    if (couponId) {
      const couponOwnerIds: string[] = [restaurant.id];
      if (restaurant.parentRestaurantId) couponOwnerIds.push(restaurant.parentRestaurantId);
      const coupon = await prisma.coupon.findFirst({
        where: {
          id: String(couponId),
          isActive: true,
          OR: [
            { restaurantId: restaurant.id }, // local coupon
            { restaurantId: { in: couponOwnerIds }, scope: "brand" }, // brand-wide
          ],
        },
      });
      if (coupon) {
        // Personal-assignment gate. When `customerId` is set on the coupon,
        // it's only redeemable by that specific Customer — the per-restaurant
        // signed-in customer. We resolve the logged-in customer via the
        // session cookie + match against the coupon's customerId.
        //
        // Quiet skip (no error response) if the gate fails — keeps the
        // existing UX of "invalid coupon = applied as 0 discount" rather
        // than throwing a hard error mid-checkout. The customer just
        // doesn't get the discount and can pick a different code.
        let personalCouponOk = true;
        if (coupon.customerId) {
          try {
            const { getCurrentRestaurantCustomer } = await import("@/lib/restaurant-customer-session");
            const me = await getCurrentRestaurantCustomer({ expectedRestaurantId: restaurant.id });
            if (!me || me.id !== coupon.customerId) {
              personalCouponOk = false;
            }
          } catch {
            personalCouponOk = false;
          }
        }
        if (personalCouponOk && (!coupon.expiresAt || new Date(coupon.expiresAt) > new Date())) {
          if (!coupon.maxUses || coupon.usedCount < coupon.maxUses) {
            if (serverSubtotal >= coupon.minimumOrder) {
              serverCouponDiscount = coupon.discountType === "percentage"
                ? Math.min(serverSubtotal * (coupon.discountValue / 100), serverSubtotal)
                : Math.min(coupon.discountValue, serverSubtotal);
              serverCouponDiscount = Math.round(serverCouponDiscount * 100) / 100;
              resolvedCouponId = coupon.id;
            }
          }
        }
      }
    }

    // ── Catering advance-notice enforcement ─────────────────────────────────
    // If ANY cart line is a catering item — flagged either at the menu-item
    // level (MenuItem.isCatering) OR via its parent category
    // (MenuCategory.isCatering) — the order must be scheduled at least
    // Restaurant.cateringNoticeHours in the future. ASAP orders containing
    // catering items are blocked here. The client-side checkout also
    // enforces this (forces schedule-for-later mode + min slot), but server
    // enforcement is the source of truth — a tampered client can't bypass.
    const hasCateringInCart = validatedItems.some((vi) => {
      if (!vi.menuItemId) return false; // bundle wrapper — skip
      const mi = menuItemMap.get(vi.menuItemId) as any;
      return mi && (mi.isCatering === true || mi.category?.isCatering === true);
    });
    if (hasCateringInCart) {
      const noticeHours = Math.max(1, (restaurant as any).cateringNoticeHours ?? 24);
      const earliest = new Date(Date.now() + noticeHours * 3600 * 1000);
      if (!scheduledFor) {
        return NextResponse.json(
          {
            error: `This order includes catering items which need at least ${noticeHours}h advance notice. Pick a scheduled time at least ${noticeHours} hours from now.`,
            code: "catering_needs_schedule",
            requiredScheduleFromIso: earliest.toISOString(),
          },
          { status: 400 },
        );
      }
      // Interpret scheduledFor in the RESTAURANT's timezone, not the
      // server's. Without this, a 3:45 PM Toronto pickup parses as
      // 3:45 PM UTC = 11:45 AM EST on Vercel, which fails the 24h
      // check even when the customer's chosen time is well past the
      // notice window. Luigi bug 2026-06-01: "earliest slot should
      // be 24h from now but 24h from now is selected and it doesn't
      // work." Same TZ fix the reservation validator got earlier
      // today (commit c13c8b9).
      const restaurantTz = (restaurant as any).timezone ?? undefined;
      const requested = (() => {
        const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(String(scheduledFor));
        if (m) {
          return parseLocalDateTimeInTz(m[1], parseInt(m[2], 10), parseInt(m[3], 10), restaurantTz);
        }
        // Fallback for ISO with offset / Z — already absolute.
        return new Date(scheduledFor);
      })();
      if (!Number.isFinite(requested.getTime()) || requested < earliest) {
        // Format the earliest cutoff in the restaurant's timezone so
        // the customer sees their own wall-clock instead of UTC.
        const earliestLabel = restaurantTz
          ? earliest.toLocaleString("en-US", {
              timeZone: restaurantTz,
              year: "numeric", month: "numeric", day: "numeric",
              hour: "numeric", minute: "2-digit",
            })
          : earliest.toLocaleString();
        return NextResponse.json(
          {
            error: `Catering orders need at least ${noticeHours}h notice. Earliest available slot is ${earliestLabel}.`,
            code: "catering_schedule_too_soon",
            requiredScheduleFromIso: earliest.toISOString(),
          },
          { status: 400 },
        );
      }
    }

    // ── Pre-order advance limits (pickup/delivery) ──────────────────────────
    // Server-side guard for the per-service "minimum time in advance" + "maximum
    // days in advance" controls (Fabrizio cmq14gy64). Pickup/delivery only —
    // dine-in/catering have their own rules. Defense-in-depth vs the picker.
    // SKIPPED for reserve-then-order: the booking time is governed by the
    // reservation rules (notice window etc.) already validated above, not the
    // order's scheduling controls. Luigi 2026-06-08.
    if (!reservationData
        && (type === "pickup" || type === "delivery" || type === "dine_in" || type === "take_out")
        && (restaurant as any).allowScheduledOrders !== false) {
      const tz = (restaurant as any).timezone ?? undefined;
      const minLead = type === "delivery" ? ((restaurant as any).deliveryMinLeadMinutes ?? 0)
        : type === "dine_in" ? ((restaurant as any).dineInMinLeadMinutes ?? 0)
        : ((restaurant as any).pickupMinLeadMinutes ?? 0);
      const maxAdv = type === "delivery" ? ((restaurant as any).deliveryMaxAdvanceDays ?? 0)
        : type === "dine_in" ? ((restaurant as any).dineInMaxAdvanceDays ?? 0)
        : ((restaurant as any).pickupMaxAdvanceDays ?? 0);
      // "Hide ASAP" forces every order to be scheduled even with no min lead.
      const mustSchedule = minLead > 0 || (restaurant as any).requireScheduledOrders === true;
      if (mustSchedule || maxAdv > 0) {
        const sched: Date | null = (() => {
          if (!scheduledFor) return null;
          const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(String(scheduledFor));
          const d = m ? parseLocalDateTimeInTz(m[1], parseInt(m[2], 10), parseInt(m[3], 10), tz) : new Date(scheduledFor);
          return Number.isFinite(d.getTime()) ? d : null;
        })();
        const nowMs = Date.now();
        const TOL = 60_000; // 1-min tolerance for rounding/clock skew
        if (mustSchedule && !sched) {
          return NextResponse.json(
            { error: "This restaurant requires orders to be scheduled in advance. Please pick a time.", code: "preorder_schedule_required" },
            { status: 400 },
          );
        }
        if (minLead > 0 && sched && sched.getTime() < nowMs + minLead * 60_000 - TOL) {
          return NextResponse.json(
            { error: "That time is too soon — please choose a later slot.", code: "preorder_too_soon" },
            { status: 400 },
          );
        }
        if (maxAdv > 0 && sched && sched.getTime() > nowMs + maxAdv * 86_400_000 + TOL) {
          return NextResponse.json(
            { error: `You can only pre-order up to ${maxAdv} day${maxAdv === 1 ? "" : "s"} ahead.`, code: "preorder_too_far" },
            { status: 400 },
          );
        }
      }
    }

    // ── Promo engine (server-side) ──────────────────────────────────────────
    // Same brand-scope merging as coupons above: this location's own promos
    // AND any "brand"-scoped promos owned by the parent.
    const promoOwnerIds: string[] = [restaurant.id];
    if (restaurant.parentRestaurantId) promoOwnerIds.push(restaurant.parentRestaurantId);
    const activePromosAll = await prisma.promotion.findMany({
      where: {
        isActive: true,
        OR: [
          { restaurantId: restaurant.id },
          { restaurantId: { in: promoOwnerIds }, scope: "brand" },
        ],
      },
      // Cap per the standing scaling rule (no unbounded findMany on a hot path).
      // No real restaurant has anywhere near this many ACTIVE promos, so this
      // never truncates a real result; it only bounds worst-case memory. No
      // orderBy → evaluation order is unchanged for every real case. (Audit fix.)
      take: 500,
    });
    // Honour the customer's manual promo removals so the charged discount
    // matches the cart preview (apply-promos does the same).
    const suppressedSet = new Set(
      Array.isArray(bodySuppressedPromoIds) ? bodySuppressedPromoIds.map((x: unknown) => String(x)) : [],
    );
    // Acquisition channel gate (Luigi 2026-06-09): a marketplace-channel order
    // only gets "marketplace"/"both" promos; a website order only "website"/
    // "both". Resolved authoritatively here (via isOnMarketplace) so the charged
    // discount matches the cart preview; reused for the viaMarketplace stamp +
    // billing below, so isOnMarketplace runs exactly once.
    const orderViaMarketplace = from === "marketplace" ? await isOnMarketplace(restaurant.id) : false;
    const orderChannel = orderViaMarketplace ? "marketplace" : "website";
    const activePromos = activePromosAll.filter(
      (p) =>
        !suppressedSet.has(p.id) &&
        ((p as any).channel === "both" || (p as any).channel === orderChannel),
    );
    // ── Delivery fee + zone resolution ──────────────────────────────────────
    // Resolved BEFORE applyPromotions() so the engine can evaluate the
    // Delivery Area restriction (Phase 2a) — free-delivery promos with
    // `deliveryZoneIds` need this context to fire.
    let resolvedZoneId: string | null = null;
    let resolvedZoneMinutes: number | null = null;
    let zoneDeliveryFee = restaurant.deliveryFee;
    let zoneMinimumOrder = restaurant.minimumOrder ?? 0;
    // True when the address geocoded but matched NO active zone (accepted only
    // because the restaurant opted into out-of-zone orders) → flag for kitchen.
    let outsideDeliveryZone = false;
    // Captured here so it survives past the zone-resolution block and
    // can be stamped onto the Order for the Delivery Heatmap report.
    // We already pay the geocode cost once for zone resolution — reusing
    // the result is free.
    let deliveryCoords: { lat: number; lng: number } | null = null;

    // Precise customer-dropped map pin (Google-maps restaurants). When the
    // customer picked an autocomplete suggestion / dragged the marker, trust
    // those exact coords over a server-side address geocode — the driver
    // gets the real spot. Validated to plausible lat/lng ranges.
    const pinLat = Number(body.deliveryLat);
    const pinLng = Number(body.deliveryLng);
    const hasPin =
      Number.isFinite(pinLat) && Number.isFinite(pinLng) &&
      Math.abs(pinLat) <= 90 && Math.abs(pinLng) <= 180 &&
      !(pinLat === 0 && pinLng === 0);

    if (type === "delivery") {
      if (hasPin) deliveryCoords = { lat: pinLat, lng: pinLng };
      const zones = await prisma.deliveryZone.findMany({
        where: { restaurantId: restaurant.id, isActive: true },
      });
      if (zones.length > 0 && restaurant.lat != null && restaurant.lng != null && flatAddress) {
        const addrParts = [flatAddress, flatCity, flatZip].filter(Boolean).join(", ");
        // Reuse the pin coords if we have them; only geocode when we don't.
        const coords = deliveryCoords ?? (await geocodeAddress(addrParts));
        deliveryCoords = coords;
        if (coords) {
          const resolved = findZoneForPoint(
            zones as unknown as ZoneLike[],
            restaurant.lat,
            restaurant.lng,
            coords.lat,
            coords.lng,
          );
          if (resolved) {
            // findZoneForPoint always returns a zone when active zones exist —
            // the smallest CONTAINING zone, or the OUTERMOST (largest) zone with
            // inside=false when the address is beyond them all. Either way its
            // fee + minimum apply (Luigi: out-of-zone uses the largest zone's
            // fee/minimum, closest to the address).
            resolvedZoneMinutes = resolved.zone.estimatedMinutes;
            zoneDeliveryFee = resolved.zone.deliveryFee;
            zoneMinimumOrder = resolved.zone.minimumOrder;
            if (resolved.inside) {
              resolvedZoneId = resolved.zone.id;
            } else {
              // Outside every zone but accepted (restaurant opted in). Flag it
              // so the kitchen sees a "may be outside your delivery area" note.
              // Leave resolvedZoneId null so a zone-restricted promo doesn't
              // treat this address as inside that zone (matches the cart
              // preview, which sends no zone for out-of-zone). Luigi 2026-06-08:
              // the old `else` was dead code — findZoneForPoint never returns
              // null here — so this flag never got set.
              outsideDeliveryZone = true;
            }
          }
        }
      }
      // Server-side minimum-order enforcement (uses resolved zone if any).
      if (zoneMinimumOrder > 0 && serverSubtotal < zoneMinimumOrder) {
        return NextResponse.json(
          { error: `Minimum order for this delivery area is ${formatCurrency(zoneMinimumOrder, (restaurant as any).currency ?? "usd")}.` },
          { status: 400 },
        );
      }
    }

    // ── Customer context for restriction enforcement ────────────────────────
    // Restrictions like Client Type "new"/"returning"/"member" and
    // Frequency "once per client lifetime" need to know who's ordering.
    // We look up the Customer row (per-restaurant order history) AND
    // the CustomerAccount row (marketplace-wide membership) by email.
    // Both are nullable — guest checkouts with no email match nothing
    // and fall through to defaults (isNewCustomer=true, isMember=false,
    // hasUsedLifetime={}). Pickup/dine-in carts without email also
    // fall through.
    const promoCustomerEmail = customerEmail
      ? String(customerEmail).trim().toLowerCase()
      : null;
    let isNewCustomerForPromo = true; // optimistic: no email → treat as new
    let isMemberForPromo = false;
    const hasUsedLifetimeForPromo: Record<string, boolean> = {};
    // Captured so the precise per-promo lifetime check below can scope its
    // order-history scan to this customer by id (not just email/phone).
    let lifetimeCustomerId: string | null = null;
    if (promoCustomerEmail) {
      // Per-restaurant Customer — drives isNewCustomer (count of prior
      // orders) and feeds hasUsedLifetime lookup.
      const existingCustomer = await prisma.customer.findFirst({
        where: { restaurantId: restaurant.id, email: promoCustomerEmail },
        select: { id: true },
      });
      if (existingCustomer) {
        // "New customer" (and "has already used a once-per-lifetime promo")
        // must be judged on FULFILLED orders only — never on orders that
        // failed. An order that was MISSED (auto-rejected on the unattended
        // timeout), rejected, or cancelled never actually served the customer,
        // so it must NOT flip them to "returning" nor consume a first-time-only
        // promo: they keep the offer until an order genuinely goes through.
        // (Replaces the old `totalOrders > 0` test — totalOrders is incremented
        // at PLACEMENT regardless of outcome, so a missed first order wrongly
        // disqualified the customer from the new-customer / first-buy promo on
        // their retry.) The fulfillment-tied coupon-grant ledger (next phase)
        // will make this exact and also match on phone; this is the surgical
        // correctness fix. Luigi 2026-06-09.
        const FAILED_ORDER_STATES = ["cancelled", "rejected"]; // "missed" == auto-rejected
        const priorFulfilledCount = await prisma.order.count({
          where: {
            restaurantId: restaurant.id,
            customerId: existingCustomer.id,
            status: { notIn: FAILED_ORDER_STATES },
            // Per-channel new-customer (Luigi 2026-06-09, H2): the marketplace is
            // a SEPARATE customer base, so "new" is judged WITHIN this order's
            // channel. A website regular ordering via the marketplace counts as
            // new there (and vice-versa) — so each channel gets its own first-buy.
            viaMarketplace: orderViaMarketplace,
          },
        });
        if (priorFulfilledCount > 0) {
          isNewCustomerForPromo = false;
        }
        // Capture the customerId so the precise per-promo lifetime check below
        // (usedLifetimePromoIds) can scan THIS customer's own order history.
        // NOTE (Luigi 2026-06-26): the old coarse heuristic that lived here —
        // "any prior promo-discounted order ⇒ block ALL once-per-lifetime
        // promos" — was REMOVED. It over-blocked returning customers from a
        // brand-new lifetime promo they'd never used, and (because the cart
        // preview didn't replicate it) made the previewed total disagree with
        // the charge. Enforcement is now PER-PROMO via usedLifetimePromoIds,
        // which both this route and the apply-promos preview share.
        lifetimeCustomerId = existingCustomer.id;
      }
      // Marketplace-wide CustomerAccount — drives isMember (true iff a
      // CustomerAccount exists for this email, regardless of whether
      // they've ordered here before).
      const account = await prisma.customerAccount.findUnique({
        where: { email: promoCustomerEmail },
        select: { id: true },
      });
      if (account) isMemberForPromo = true;
    }

    // ── Coupon ledger (precise, phone-aware) ────────────────────────────────
    // The fulfilled-order heuristic above is keyed on the email→Customer row, so
    // it can miss a guest who used the offer with an email and returns with only
    // a phone (or vice-versa). The ledger matches on email OR phone and records
    // redemption by FULFILLMENT — a missed/rejected order is "released", never
    // "used" — so this both tightens once-per-lifetime enforcement across
    // identities AND keeps a missed first order's offer alive. Additive: it can
    // only mark MORE lifetime promos used, never fewer. Luigi 2026-06-09.
    {
      const lifetimeIds = activePromos.filter((p) => p.onceLifetimePerClient).map((p) => p.id);
      if (lifetimeIds.length > 0 && (promoCustomerEmail || customerPhone || lifetimeCustomerId)) {
        const usedIds = await usedLifetimePromoIds({
          restaurantId: restaurant.id,
          promotionIds: lifetimeIds,
          customerId: lifetimeCustomerId,
          email: promoCustomerEmail,
          phone: customerPhone,
        });
        for (const id of usedIds) hasUsedLifetimeForPromo[id] = true;
      }
    }

    // ── Promo engine evaluation (now has resolved zone + customer context) ──
    // Run AFTER zone resolution so Delivery Area-restricted promos (Phase 2a)
    // see the deliveryZoneId and can fire correctly. Server-authoritative —
    // the client's hasFreeDelivery flag from /api/public/apply-promos is not
    // trusted; we recompute here with the same engine + same restrictions.
    // Normalise typed coupon code — uppercase + cap length so the engine
    // match is stable regardless of how the customer entered it.
    const normalizedCouponCode = typeof bodyCouponCode === "string"
      ? bodyCouponCode.trim().toUpperCase().slice(0, 50) || undefined
      : undefined;

    // Customer-ASSIGNED code redemption (Luigi 2026-06-26, Fabrizio F-92452C):
    // a personal promo code applies by matching the EMAIL/PHONE entered at
    // checkout — no login required. If a grant with this code exists but for a
    // DIFFERENT identity, reject BEFORE creating the order / payment intent so
    // the customer gets a clear message and the code can't leak to others. When
    // no assigned grant carries the code ("none"), fall through silently — it's
    // a normal open promo code (or a typo) handled by the engine below.
    if (normalizedCouponCode) {
      const assigned = await resolveAssignedPromoByCode({
        restaurantId: restaurant.id,
        code: normalizedCouponCode,
        email: promoCustomerEmail,
        phone: customerPhone,
      });
      if (assigned.kind === "mismatch") {
        return NextResponse.json(
          { error: "This code is registered to a different email address.", code: "promo_email_mismatch" },
          { status: 400 },
        );
      }
    }
    // Happy-Hour / day-of-week windows must be evaluated against WHEN THE ORDER
    // WILL BE FULFILLED, not when it's being placed. For a scheduled order
    // ("order for later"), that's the chosen slot — so a 20:15 pickup qualifies
    // for an 18:00–21:00 promo even if it's placed at 17:04. ASAP → undefined
    // (the engine uses current time). Fabrizio report cmpxejjev.
    const promoEvalNow: Date | undefined = (() => {
      if (!effectiveScheduledFor) return undefined;
      const tz = (restaurant as any).timezone ?? undefined;
      const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(String(effectiveScheduledFor));
      const d = m ? parseLocalDateTimeInTz(m[1], parseInt(m[2], 10), parseInt(m[3], 10), tz) : new Date(effectiveScheduledFor);
      return Number.isFinite(d.getTime()) ? d : undefined;
    })();
    const promoResults = applyPromotions(activePromos as any, {
      orderType: type,
      now: promoEvalNow,
      isNewCustomer: isNewCustomerForPromo,
      isMember: isMemberForPromo,
      hasUsedLifetime: hasUsedLifetimeForPromo,
      subtotal: serverSubtotal,
      // Bundle line items (menuItemId === null) are EXCLUDED from the
      // promo engine — their price is already the discounted bundle
      // total and applying further per-item promos would double-dip.
      //
      // categoryId is critical: BOGO / Buy-N-Get-Free / Meal Bundle /
      // Free Item / Free Dish promos commonly target whole CATEGORIES
      // (no specific itemIds) via `groups[].categoryIds`. Without
      // categoryId here, `itemsMatchingGroup()` can't match any cart
      // item against a category-only group → the promo silently
      // returns 0 and disappears from `appliedPromos`.
      // Luigi bug 2026-05-30: BOGO targeting Beverages didn't fire on
      // a 22-beverage cart because categoryId wasn't being threaded.
      items: validatedItems
        .filter((i) => i.menuItemId !== null)
        .map((i) => ({
          menuItemId: i.menuItemId as string,
          categoryId: menuItemMap.get(i.menuItemId as string)?.categoryId ?? undefined,
          variantId: i.variantId ?? null,
          price: i.price,
          quantity: i.quantity,
          subtotal: i.subtotal,
        })),
      paymentMethod,
      // Phase 2a: the Delivery Area restriction needs this. Undefined
      // for pickup/dine-in (the engine short-circuits zone-restricted
      // promos via the orderType check).
      deliveryZoneId: resolvedZoneId ?? undefined,
      // Lets a free_delivery EXCLUSIVE win the slot at its real fee value
      // instead of $0 (audit B10). 0 for non-delivery orders.
      deliveryFee: type === "delivery" ? Math.max(0, zoneDeliveryFee) : 0,
      // Customer-typed coupon code — engine matches it against
      // Promotion.couponCode for autoApply=false promos.
      couponCode: normalizedCouponCode,
      // Restaurant timezone for Happy Hour / day-of-week evaluation.
      // Same fix as /api/public/apply-promos — without this the
      // server-side recompute on order placement would disagree with
      // the client-side promo banner that just told the customer
      // "your promo applied" (the public route uses tz too).
      restaurantTimezone: restaurant.timezone,
    });
    const serverPromoDiscount = Math.round(totalPromoDiscount(promoResults, serverSubtotal) * 100) / 100;
    const hasFreeDelivery = promoResults.some((r: any) => r.type === "free_delivery");

    const serverDeliveryFee = (type === "delivery" && !hasFreeDelivery)
      ? Math.max(0, zoneDeliveryFee)
      : 0;

    // ── Service fees (server-side evaluation; client values ignored) ────────
    const feeOrderType: "pickup" | "delivery" = type === "delivery" ? "delivery" : "pickup";
    const activeFees = await prisma.serviceFee.findMany({
      where: { restaurantId: restaurant.id, isActive: true },
      orderBy: { sortOrder: "asc" },
    });
    const appliedFees = evaluateApplicableFees(activeFees as unknown as ServiceFeeRow[], {
      subtotal: serverSubtotal,
      type: feeOrderType,
      at: new Date(),
    });
    const serverServiceFeesTotal = sumAppliedFees(appliedFees);

    // ── Tax & total ─────────────────────────────────────────────────────────
    const totalDiscount = serverCouponDiscount + serverPromoDiscount;
    const taxBase = Math.max(0, serverSubtotal - totalDiscount + serverDeliveryFee + serverServiceFeesTotal);
    const serverTax = Math.round(taxBase * (restaurant.taxRate / 100) * 100) / 100;
    // Hard server-side clamp when the restaurant has tipping disabled.
    // Owners flip Restaurant.tipsEnabled = false from /admin/service-fees
    // (typically European markets where tipping isn't a thing). The UI
    // hides the picker, but a hand-crafted POST or a stale client could
    // still try to send a tip — refuse to charge it.
    const tippingAllowed = restaurant.tipsEnabled !== false;
    const serverTip = tippingAllowed && typeof clientTip === "number" && clientTip >= 0
      ? Math.min(Math.round(clientTip * 100) / 100, serverSubtotal * 2) // cap at 200% of subtotal
      : 0;
    const serverTotal = Math.round((taxBase + serverTax + serverTip) * 100) / 100;

    // ── Find or create customer ─────────────────────────────────────────────
    //
    // Two layers of customer identity:
    //   1. CustomerAccount — marketplace-wide signed-in identity (Phase 1).
    //      If the customer is logged into their account, we link this order's
    //      per-restaurant Customer row to it, so /account/orders can later
    //      aggregate across every restaurant they've ordered from.
    //   2. Customer — per-restaurant ledger entry (legacy). One per email per
    //      restaurant, tallies totalOrders + totalSpent for THAT restaurant.
    //
    // For guest checkouts the account link stays null and behavior is unchanged.
    const currentAccount = await getCurrentCustomer();
    let customer = null;
    const cleanEmail = customerEmail ? sanitize(customerEmail, 254).toLowerCase() : null;
    const cleanPhone = customerPhone ? sanitize(customerPhone, 30) : null;
    if (cleanEmail || cleanPhone) {
      const where = cleanEmail ? { restaurantId: restaurant.id, email: cleanEmail } : undefined;
      if (where) customer = await prisma.customer.findFirst({ where });
      // BIDIRECTIONAL marketing consent (GloriaFood-parity, Luigi 2026-06-03).
      // The checkbox state IS the customer's explicit choice on this order:
      //   ticked   → opt IN
      //   unticked → opt OUT
      // The choice is authoritative every time and persists (sticky) in the
      // DB until they change it again — so an opted-out customer stays out of
      // every marketing send (autopilot reads marketingConsent) and only
      // receives transactional emails (order confirmations never check it).
      //
      // GUARD: the marketing box is meaningless without an email, so we ONLY
      // act on consent when the customer supplied an email on THIS order.
      // (The client already sends marketingConsent=false whenever the email
      // field is empty — without this guard a phone-only reorder would wrongly
      // opt-out a customer who has an email on file.) Since `customer` is only
      // ever looked up via the email where-clause above, the update branch
      // always has an email; the guard mainly protects the create branch.
      const emailPresent = !!cleanEmail;
      const consentChoice = emailPresent && marketingConsent === true;
      if (!customer) {
        customer = await prisma.customer.create({
          data: {
            restaurantId: restaurant.id,
            name: sanitize(customerName, 100),
            email: cleanEmail,
            phone: cleanPhone,
            customerAccountId: currentAccount?.id ?? null,
            // Reports — populated at create so first-time customers are
            // captured in the lapsed-customer / cohort queries.
            lastOrderAt: new Date(),
            marketingConsent: consentChoice,
            // Stamp the moment we recorded their choice (opt-in OR opt-out)
            // so we keep an audit trail; null only when there's no email.
            marketingConsentAt: emailPresent ? new Date() : null,
          },
        });
      } else {
        await prisma.customer.update({
          where: { id: customer.id },
          data: {
            totalOrders: { increment: 1 },
            totalSpent: { increment: serverTotal },
            // Reports — refresh the last-order timestamp so the "Clients"
            // dashboard + lapsed-customer segments stay accurate.
            lastOrderAt: new Date(),
            // Backfill the account link on subsequent orders from a signed-in
            // user who originally ordered as a guest. Only set if currently null
            // so we don't overwrite a previous link.
            ...(currentAccount && !customer.customerAccountId
              ? { customerAccountId: currentAccount.id }
              : {}),
            // Flip consent in EITHER direction when the customer's choice
            // differs from what we have stored — and only re-stamp the
            // timestamp when it actually changes, to keep the audit trail
            // meaningful and avoid needless writes on every reorder.
            ...(emailPresent && customer.marketingConsent !== consentChoice
              ? { marketingConsent: consentChoice, marketingConsentAt: new Date() }
              : {}),
          },
        });
      }
    }

    // ── Coupon usage already claimed atomically pre-create above. ────────
    // Kept comment here as a breadcrumb; the increment used to live at
    // this spot before the race-safe rewrite (audit #74, 2026-05-30).

    // ── Marketplace attribution + savings snapshot ──────────────────────────
    // Stamp this order as "via marketplace" ONLY if the client hint is set
    // AND the restaurant is currently on a marketplace plan (monthly OR
    // payg). A tampered client request can't fake-stamp a direct order —
    // membership is enforced server-side. Direct widget/website orders
    // (no ?from=marketplace) stay viaMarketplace=false → never billed.
    const claimsMarketplace = from === "marketplace";
    // Resolved once above (orderViaMarketplace) for promo channel gating — reuse
    // it so isOnMarketplace isn't queried twice for the same order.
    const viaMarketplace = orderViaMarketplace;
    const savedVsUberEatsCents = viaMarketplace
      ? computeUberEatsEquivalentCents(Math.round(serverTotal * 100))
      : null;

    // ── Channel attribution (Reports) ──────────────────────────────────────
    // Look up the channel from the WebsiteVisit row written when the
    // session started. Server-validated values only — we never trust a
    // client-provided channel slug. Falls back to "marketplace" when
    // the order is genuinely a marketplace order (the WebsiteVisit row
    // may not exist for older sessions / bots), then to null when
    // there's no sessionHash at all.
    //
    // The query is indexed (sessionHash unique-ish), cheap. We
    // limit + order by createdAt DESC because a long session could
    // have multiple visit rows across re-navigations — the most
    // recent one is the truest attribution.
    let resolvedChannel: string | null = null;
    // Marketing Studio per-link attribution rides the SAME visit lookup (Luigi
    // 2026-06-10): the /m/<code> redirect stored ?ref=<code> on the visit; we
    // resolve it to the SmartLink after the order is created (idempotent).
    let resolvedRefCode: string | null = null;
    if (typeof sessionHash === "string" && /^[a-f0-9]{16,64}$/i.test(sessionHash)) {
      const visit = await prisma.websiteVisit.findFirst({
        where: { restaurantId: restaurant.id, sessionHash },
        select: { channel: true, refCode: true },
        orderBy: { createdAt: "desc" },
      });
      if (visit) {
        resolvedChannel = visit.channel;
        resolvedRefCode = visit.refCode;
      }
    }
    if (!resolvedChannel && viaMarketplace) resolvedChannel = "marketplace";

    // Marketplace orders are online-card-only by platform contract.
    // The customer-side checkout forces "card" as the only option when
    // ?from=marketplace, but a tampered client could POST cash. Reject
    // explicitly here so the only way a marketplace order ends up in
    // the DB is with paymentMethod="card" — keeps the kitchen from ever
    // accepting a cash-on-pickup marketplace order that we can't bill.
    if (viaMarketplace && (paymentMethod ?? "cash") !== "card") {
      return NextResponse.json(
        {
          error: "Marketplace orders must be paid online by card. Cash and pay-in-person aren't supported for marketplace orders.",
          code: "marketplace_card_required",
        },
        { status: 400 },
      );
    }

    // ── Per-order-type accepted-method guard (defense-in-depth) ──────────────
    // The customer checkout only offers methods the restaurant accepts FOR THIS
    // order type, but a tampered client could POST another. Reject a method that
    // isn't accepted for `type`. Skipped for marketplace (forced card above) and
    // when no method was sent (defaults to cash). Legacy flat configs apply to
    // every type, so existing restaurants are unaffected. Luigi 2026-06-08.
    if (!viaMarketplace && paymentMethod &&
        !isPaymentMethodAcceptedForType((restaurant as any).paymentMethods, type, paymentMethod)) {
      return NextResponse.json(
        { error: "That payment method isn't accepted for this order type.", code: "payment_method_not_accepted" },
        { status: 400 },
      );
    }

    // ── FREE-plan order cap ─────────────────────────────────────────────────
    // Restaurants on the FREE plan are limited to 100 orders/month. Any
    // active paid add-on (Online Payments, Marketplace, Unlimited Orders,
    // etc.) exempts them. The check also handles the lazy monthly
    // rollover — if we've crossed into a new calendar month the counter
    // resets to 0 first. Failing here is a 402 — the customer-side UX
    // should display a friendly "this restaurant has paused new orders
    // until next month" message rather than a generic error.
    const cap = await checkOrderCap(restaurant.id);
    if (!cap.allowed) {
      // Owner alert: a real order just got turned away ("you're losing orders").
      // Fire AFTER the response (rate-limited ~3h inside) so the rejection isn't
      // slowed by an email round-trip. Luigi 2026-06-16.
      after(
        (async () => {
          try { await notifyCapReached100(restaurant.id); }
          catch (e) { console.error("[orders POST] notifyCapReached100:", e); }
        })(),
      );
      return NextResponse.json(
        {
          error:
            "This restaurant has reached its monthly order limit. Please try again next month, or contact the restaurant directly.",
          code: "monthly_cap_reached",
          monthlyOrderCount: cap.currentCount,
          monthlyOrderCap: cap.cap,
        },
        { status: 402 },
      );
    }

    // ── Auto-accept handling ────────────────────────────────────────────────
    // A pre-order (booking + food) auto-accepts when auto is on for EITHER side:
    // the restaurant's order auto-accept OR its reservation auto-confirm. A
    // normal order respects only order auto-accept. Luigi 2026-06-09.
    const wantsAutoAccept = !!restaurant.autoAcceptOrders || (!!reservationData && reservationAutoConfirm);
    const fulfillmentMinutes = type === "delivery"
      ? restaurant.estimatedDelivery
      : restaurant.estimatedPickup;
    const initialStatus = wantsAutoAccept ? "accepted" : "pending";
    const acceptedAtValue: Date | null = wantsAutoAccept ? new Date() : null;

    // Parse scheduledFor up-front so the kitchen-promise math below can
    // honour it (Luigi 2026-06-02 bug: auto-accepted scheduled orders
    // were getting estimatedReady = now + 20min, ignoring the scheduled
    // time entirely; kitchen tablet then showed "Ready in 14:31" for a
    // tomorrow-10:30-PM order).
    const scheduledForDate: Date | null = effectiveScheduledFor
      ? (() => {
          const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(String(effectiveScheduledFor));
          if (m) {
            const tz = (restaurant as any).timezone ?? undefined;
            return parseLocalDateTimeInTz(m[1], parseInt(m[2], 10), parseInt(m[3], 10), tz);
          }
          return new Date(effectiveScheduledFor);
        })()
      : null;
    // Reject schedules in the PAST (reseller report cmqa5nlv0: at 01:49 AM
    // the picker's UTC-based "today" still offered yesterday, and a stale
    // scheduledFor sailed through here as a quasi-ASAP order). The grace
    // window absorbs clock skew and a customer who picked the earliest
    // slot, then sat on the payment screen for a few minutes.
    if (
      scheduledForDate !== null &&
      Number.isFinite(scheduledForDate.getTime()) &&
      scheduledForDate.getTime() < Date.now() - 10 * 60_000
    ) {
      return NextResponse.json(
        {
          error: "The scheduled time you picked has already passed. Please choose a new time.",
          code: "scheduled_in_past",
        },
        { status: 400 },
      );
    }
    const hasFutureSchedule =
      scheduledForDate !== null &&
      Number.isFinite(scheduledForDate.getTime()) &&
      scheduledForDate.getTime() > Date.now();

    // ── Special-day / holiday enforcement (Gloriafood parity) ───────────────
    // Reseller report cmpxds2d2: holiday closures must actually BLOCK orders.
    // We resolve the holiday rule for the day the order is FOR (the scheduled
    // slot's calendar day, else today) and the order's service:
    //   - closed       → reject outright (an ASAP order on a closed holiday
    //                    can't be cooked, and a scheduled order must move to
    //                    another day)
    //   - custom hours → the order's time (now for ASAP, the slot for
    //                    scheduled) must fall inside the special intervals
    // Legacy single-date rows resolve as "closed, all services" — same
    // behaviour they had, but now enforced. Luigi 2026-06-11.
    {
      const holidayTzKey = (restaurant as any).timezone ?? "UTC";
      const holidayTargetDate = hasFutureSchedule ? scheduledForDate! : new Date();
      const holidayDayKey = dateKeyInTimezone(holidayTargetDate, holidayTzKey);
      const holidayEffect = holidayEffectForDay(
        (restaurant as any).holidays ?? [],
        holidayDayKey,
        canonicalHolidayService(type),
      );
      if (holidayEffect?.kind === "closed") {
        // Distinguish a FULL closure from a single-service one: if the
        // all-services rule isn't closed, only THIS service is unavailable
        // (the restaurant is still open for others). Drives a clearer,
        // service-named message instead of a blanket "we're closed".
        // Luigi 2026-06-12, report cmpxds2d2.
        const generalEffect = holidayEffectForDay(
          (restaurant as any).holidays ?? [],
          holidayDayKey,
          null,
        );
        const fullyClosed = generalEffect?.kind === "closed";
        const label = holidayEffect.name ? ` (${holidayEffect.name})` : "";
        const error = fullyClosed
          ? `We're closed on this date${label}. Please choose a different day.`
          : `${serviceDisplayLabel(type)} isn't available on this date${label}. Please choose a different day or service.`;
        return NextResponse.json(
          {
            error,
            code: "holiday_closed",
            // Client localizes from these (en fallback above).
            fullyClosed,
            service: canonicalHolidayService(type),
            holidayName: holidayEffect.name ?? null,
            holidayMessage: holidayEffect.message ?? null,
          },
          { status: 400 },
        );
      }
      if (holidayEffect?.kind === "custom_hours") {
        const { hhmm } = localDowAndHHMM(holidayTargetDate, holidayTzKey);
        if (!hhmmInsideIntervals(hhmm, holidayEffect.intervals)) {
          const windows = holidayEffect.intervals.map((iv) => `${iv.open}–${iv.close}`).join(", ");
          return NextResponse.json(
            {
              error: `On this date we're only open ${windows}. Please pick a time within those hours.`,
              code: "holiday_custom_hours",
            },
            { status: 400 },
          );
        }
      }
      // Partial-day closure ("close a time range"): the service follows its
      // normal hours EXCEPT during these windows. Reject an order whose time
      // lands inside a closed window; outside them normal hours apply as usual.
      // (Fabrizio #1b: "closed pickup 4–8 PM still let a 5 PM order through.")
      if (holidayEffect?.kind === "closed_windows") {
        const { hhmm } = localDowAndHHMM(holidayTargetDate, holidayTzKey);
        if (hhmmInsideIntervals(hhmm, holidayEffect.intervals)) {
          const windows = holidayEffect.intervals.map((iv) => `${iv.open}–${iv.close}`).join(", ");
          return NextResponse.json(
            {
              error: `${serviceDisplayLabel(type)} is closed ${windows} on this date. Please pick a time outside those hours.`,
              code: "holiday_closed_windows",
            },
            { status: 400 },
          );
        }
      }

      // ── Weekly-hours backstop for SCHEDULED orders (SPLIT HOURS) ────────────
      // The client slot picker already blocks times outside the service's open
      // windows — including the lunch/dinner GAP. This is the server backstop
      // against a tampered/stale client (the gap the pre-existing code left open).
      // Runs ONLY for a FUTURE scheduled slot on a NORMAL day — a holiday rule, if
      // present, already governed the time above (holidayEffect would be non-null).
      // ASAP orders are intentionally accepted when closed (they defer the kitchen
      // alert), so they're NOT gated here. FAIL OPEN: a shop with no hours
      // configured is never blocked. Reuses the same resolveServiceHours +
      // liveOpenStatus the customer page uses for its per-service gate.
      if (hasFutureSchedule && !holidayEffect) {
        const allHours = (restaurant as any).openingHours ?? [];
        if (allHours.some((h: any) => h.isOpen)) {
          // MUST mirror the client slot picker (CheckoutModal.tsx) exactly:
          // non-delivery types ALL use the PICKUP window (pickHoursForService
          // falls back to the general row when there's no pickup row). Using
          // `null` here would resolve GENERAL hours and wrongly reject valid
          // dine-in / take-out / CATERING slots the client offered from the
          // pickup window (catering always schedules → highest impact).
          const svcKind = type === "delivery" ? "delivery" : "pickup";
          const fmt = restaurant.hoursFormat === "12h" ? "12h" : "24h";
          const slotStatus = liveOpenStatus(
            resolveServiceHours(allHours, svcKind as any) as any,
            scheduledForDate!, fmt, undefined, holidayTzKey,
          );
          if (slotStatus.kind !== "open") {
            // Service-specific message so the customer knows it's THIS service
            // (not the restaurant) that isn't open yet, and when it starts.
            const svcLabel = type === "delivery" ? "Delivery"
              : type === "dine_in" ? "Dine-in"
              : type === "take_out" ? "Take-out" : "Pickup";
            const msg = slotStatus.kind === "opens_at"
              ? `Not open for ${svcLabel} yet — ${svcLabel} starts at ${slotStatus.opensAt}.`
              : `That time is outside ${svcLabel} hours. Please pick a time when ${svcLabel} is open.`;
            return NextResponse.json(
              { error: msg, code: "outside_opening_hours" },
              { status: 400 },
            );
          }
        }
      }
    }

    // ── Per-item Fulfilment Time enforcement (Luigi 2026-06-12, Phase 2) ──────
    // An item with a fulfilment window can only be ordered FOR days/times inside
    // it (visible all week, but e.g. orderable only on Tuesdays). Validate every
    // cart item against the order's EFFECTIVE fulfilment moment — the scheduled
    // slot, else now for ASAP. Mirrors catering's "must schedule" gate, per item.
    {
      const fulfilTz = (restaurant as any).timezone ?? undefined;
      const fulfilMoment = hasFutureSchedule ? scheduledForDate! : new Date();
      for (const vi of validatedItems) {
        if (!vi.menuItemId) continue; // bundle wrapper
        const mi = menuItemMap.get(vi.menuItemId) as any;
        if (!mi || !hasFulfilWindow(mi)) continue;
        if (!isFulfilableAt(mi, fulfilMoment, fulfilTz)) {
          // In reservation mode the order time is LOCKED to the booking (no
          // schedule picker), so "schedule your order for when it's available" is
          // a dead-end — tell them to remove it or rebook on a day it's offered.
          // The client localizes BOTH variants from `code` + itemName (so neither
          // is an English-only string). Luigi 2026-06-16.
          const forReservation = !!reservationData;
          return NextResponse.json(
            {
              error: forReservation
                ? `"${mi.name}" isn't available on your reservation day. Please remove it, or book your table on a day it's offered.`
                : `"${mi.name}" can only be ordered for certain days/times. Please schedule your order for when it's available.`,
              code: forReservation ? "item_fulfilment_window_reservation" : "item_fulfilment_window",
              itemName: mi.name,
              fulfilDays: mi.fulfilDays ?? null,
              fulfilFrom: mi.fulfilFrom ?? null,
              fulfilTo: mi.fulfilTo ?? null,
            },
            { status: 400 },
          );
        }
      }
    }

    // For SCHEDULED orders, estimatedReady IS the customer's chosen
    // slot — they asked for "ready at 10:30 PM tomorrow", so that's
    // when it'll be ready. preparationTime is the gap from now until
    // that slot, so the kitchen-display countdown lines up.
    //
    // For ASAP orders, estimatedReady is a soft now + prep estimate
    // that gives the customer a countdown on the status page right
    // away. Kitchen Accept later overwrites this with the actual
    // promised ready time, matching the DoorDash/Uber/Toast pattern
    // of "estimate now, tighten on confirmation".
    const estimatedReadyValue: Date = hasFutureSchedule
      ? scheduledForDate!
      : new Date(Date.now() + fulfillmentMinutes * 60_000);
    const preparationTimeValue: number | null = wantsAutoAccept
      ? hasFutureSchedule
        ? Math.max(
            fulfillmentMinutes,
            Math.round((scheduledForDate!.getTime() - Date.now()) / 60_000),
          )
        : fulfillmentMinutes
      : null;

    // ── Closed-when-placed handling (Luigi 2026-05-30) ──────────────────────
    // If the restaurant is closed RIGHT NOW, we don't want the kitchen
    // alert to ring in the middle of the night when nobody's there. Stamp
    // the order with `placedWhileClosed=true` and defer `alertAt` to the
    // restaurant's next opening moment. Kitchen display: orders with
    // alertAt > now appear silently in the pending tab but DON'T trigger
    // the ring/countdown until alertAt fires.
    // The kitchen RING follows GENERAL restaurant hours, NOT the ordered service's
    // hours (Fabrizio re-open, confirmed Luigi 2026-06-22): if the restaurant is
    // open by general hours the order rings IMMEDIATELY, even when that service's
    // window opens later (the later time is just when the food is DUE — same as a
    // pre-order). Only a GENERAL-closed restaurant defers the ring to its next
    // general opening. liveOpenStatus + nextOpenAt both prefer the service=null
    // (general) row via pickDayRow, so the RAW hours array yields the general
    // schedule. The per-service ASAP/slot ORDERING gate is enforced separately
    // (client ASAP hide + CheckoutModal slot picker) — that part is unchanged.
    const rawHoursForCheck = (restaurant as any).openingHours
      ?? (restaurant as any).hours
      ?? [];
    const openingHoursForCheck = rawHoursForCheck;
    const restaurantTz = (restaurant as any).timezone ?? undefined;
    // General (all-services) holiday effect for today — closed → liveStatus
    // "holiday"; custom hours → the intervals replace the weekly schedule.
    const holidayToday = holidayEffectToday((restaurant as any).holidays, restaurantTz, null);
    const liveStatus = liveOpenStatus(
      openingHoursForCheck,
      new Date(),
      restaurant.hoursFormat === "12h" ? "12h" : "24h",
      holidayToday
        ? {
            name: holidayToday.name ?? undefined,
            intervals: holidayToday.kind === "custom_hours" ? holidayToday.intervals : undefined,
          }
        : undefined,
      restaurantTz,
    );
    const isClosedNow = liveStatus.kind !== "open";
    let alertAtValue: Date | null = null;
    if (isClosedNow) {
      // Holiday-aware: the deferred kitchen alert must not fire on a day a
      // holiday rule closes — skip to the first genuinely open moment.
      const next = nextOpenAt(openingHoursForCheck, new Date(), restaurantTz, (restaurant as any).holidays ?? []);
      alertAtValue = next ?? null;
    }
    // Sanity guard: if we couldn't resolve a next-open (e.g. restaurant
    // has no opening hours configured), fall back to null — kitchen will
    // alert immediately. Better to over-alert than to silently never alert.

    // ── Atomic coupon usage claim ───────────────────────────────────────────
    // Previously the coupon usedCount was incremented AFTER order.create
    // outside any transaction (audit 2026-05-30 #74). Two simultaneous
    // customers using the same coupon could both pass the `usedCount <
    // maxUses` check, both succeed, and the cap would be breached. The
    // atomic conditional UPDATE below increments only if the cap still
    // has headroom — race-loser sees 0 rows affected and we 4xx them.
    //
    // Done BEFORE order.create so the order never lands without an
    // accompanying usage claim. If order.create then fails for a
    // separate reason, we decrement the coupon back as a best-effort
    // compensating action so the legitimate next customer can still
    // redeem it.
    if (resolvedCouponId) {
      const claimed = await prisma.$executeRaw`
        UPDATE "Coupon"
        SET "usedCount" = "usedCount" + 1
        WHERE id = ${resolvedCouponId}
          AND ("maxUses" IS NULL OR "usedCount" < "maxUses")
      `;
      if (claimed === 0) {
        return NextResponse.json(
          {
            error:
              "This coupon has just reached its usage limit. Please try a different one.",
            code: "coupon_exhausted",
          },
          { status: 409 },
        );
      }
    }

    // ── Create order ────────────────────────────────────────────────────────
    let order;
    try {
      order = await prisma.order.create({
      data: {
        restaurantId: restaurant.id,
        customerId: customer?.id || null,
        // Verified owner test orders take the kitchen-test TEST- prefix so the
        // kitchen badges them and the report aggregators exclude them.
        orderNumber: isVerifiedTest ? `TEST-${Date.now()}` : generateOrderNumber(),
        status: initialStatus,
        acceptedAt: acceptedAtValue,
        estimatedReady: estimatedReadyValue,
        preparationTime: preparationTimeValue,
        appliedServiceFees: appliedFees.length > 0 ? JSON.stringify(appliedFees) : null,
        // Snapshot every promo that fired (incl. free-delivery with
        // discount=0) so the receipt/email/confirmation can render a
        // labelled box months after the underlying promo is edited.
        // Free-delivery entries carry the saved delivery fee so the
        // receipt can show "−$7.99" against the named promo.
        appliedPromos: promoResults.length > 0
          ? JSON.stringify(
              promoResults.map((r: any) => ({
                promoId: r.promoId,
                name: r.name,
                type: r.type,
                discount: r.type === "free_delivery" ? zoneDeliveryFee : r.discount,
                couponCode: r.couponCode ?? undefined,
              })),
            )
          : null,
        type,
        customerName: isVerifiedTest
          ? `[TEST] ${sanitize(customerName, 92).replace(/^\[TEST\] /, "")}`
          : sanitize(customerName, 100),
        customerEmail: cleanEmail,
        customerPhone: cleanPhone,
        deliveryAddress: flatAddress ? sanitize(flatAddress, 300) : null,
        deliveryCity: flatCity ? sanitize(flatCity, 100) : null,
        deliveryZip: flatZip ? sanitize(flatZip, 20) : null,
        // Structured per-field address (customizable form). Null for non-delivery
        // or legacy orders with no structured data.
        deliveryAddressData: deliveryData ?? undefined,
        outsideDeliveryZone,
        notes: notes ? sanitize(notes, 500) : null,
        couponId: resolvedCouponId,
        couponDiscount: serverCouponDiscount,
        promoDiscount: serverPromoDiscount,
        subtotal: serverSubtotal,
        taxAmount: serverTax,
        deliveryFee: serverDeliveryFee,
        tip: serverTip,
        total: serverTotal,
        paymentMethod: paymentMethod || "cash",
        paymentStatus: "pending",
        // scheduledForDate is parsed up-front in the restaurant's
        // local timezone — see the comment block where it's computed,
        // above the auto-accept handling. Same Date object reused for
        // the kitchen estimatedReady math so the two can never drift.
        scheduledFor: scheduledForDate,
        // Closed-when-placed routing — see compute block above.
        placedWhileClosed: isClosedNow,
        alertAt: alertAtValue,
        deliveryZoneId: resolvedZoneId,
        deliveryEstimatedMinutes: resolvedZoneMinutes,
        viaMarketplace,
        savedVsUberEatsCents,
        channel: resolvedChannel,
        // Reports — coordinates already resolved during zone lookup
        // (delivery orders only). Heatmap report uses these directly;
        // null for pickup / dine-in / unresolved-address orders.
        deliveryLat: deliveryCoords?.lat ?? null,
        deliveryLng: deliveryCoords?.lng ?? null,
        items: {
          create: validatedItems.map((item) => ({
            menuItemId: item.menuItemId,
            variantId: item.variantId,
            variantName: item.variantName,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            notes: item.notes,
            subtotal: item.subtotal,
            modifiers: { create: item.modifiers },
            // Bundle line items carry their child picks here. Null for
            // normal line items. See prisma/schema.prisma `OrderItem.bundleItems`.
            bundleItems: item.bundleItems ?? undefined,
          })),
        },
      },
      include: { items: { include: { modifiers: true } } },
    });
    } catch (createErr) {
      // Best-effort rollback of the coupon claim above. If THIS update
      // also fails, log loudly — the operator can correct by hand. The
      // coupon being briefly over by 1 is a much smaller harm than an
      // under-cap by 1 (which would have let a customer cap-bust).
      if (resolvedCouponId) {
        prisma.$executeRaw`
          UPDATE "Coupon"
          SET "usedCount" = GREATEST(0, "usedCount" - 1)
          WHERE id = ${resolvedCouponId}
        `.catch((rollbackErr) => {
          console.error(
            `[orders POST] order.create failed AFTER coupon claim; coupon ${resolvedCouponId} usedCount may be over by 1. Rollback also failed:`,
            rollbackErr,
          );
        });
      }
      throw createErr;
    }

    // ── Reserve-then-order: create the linked table booking ──────────────────
    // The order is the food + the payment; this is the table. We link via
    // Reservation.orderId and stamp preOrderTotal so the kitchen + customer see
    // one booking-with-order. NO separate reservation email fires here — the
    // order confirmation IS the single combined notification, and the kitchen
    // Reservations feed hides this booking until the order is released
    // (notifiedAt set by fireOrderNotifications), so an unpaid online-card
    // booking stays hidden until payment clears.
    //
    // ONE acceptance: the booking mirrors the ORDER's acceptance state. An
    // auto-accepted order confirms the table immediately; a manual-accept order
    // leaves it "pending" (hidden from the kitchen reservation feed) until the
    // kitchen accepts the ORDER, which flips it to "confirmed" via the
    // /api/orders/[id] PATCH sync. Luigi 2026-06-08.
    if (reservationData) {
      try {
        await prisma.reservation.create({
          data: {
            restaurantId: restaurant.id,
            orderId: order.id,
            confirmationCode: generateConfirmationCode(),
            status: order.status === "accepted" ? "confirmed" : "pending",
            customerName: sanitize(customerName, 100),
            customerEmail: cleanEmail,
            customerPhone: cleanPhone,
            partySize: reservationData.partySize,
            date: reservationData.date,
            time: reservationData.time,
            notes: reservationData.notes,
            tableId: reservationData.tableId,
            preOrderTotal: serverTotal,
          },
        });
      } catch (resErr) {
        // The order (and any payment) already succeeded — don't fail the whole
        // request and orphan a paid order. Log loudly so the booking can be
        // reconciled by hand; the kitchen still gets the order itself.
        console.error(`[orders POST] order ${order.id} created but reservation link failed:`, resErr);
      }
    }

    // Bump the monthly counter. Fire-and-forget — if this fails we'd
    // rather take the order than lose it. The increment is racy under
    // simultaneous orders, but the worst case is an occasional +1 over
    // the cap which is fine. See src/lib/order-cap.ts.
    after(
      (async () => {
        try {
          const newCount = await incrementOrderCount(restaurant.id);
          // First order to land in the 80-99 band this month → email the owner
          // a heads-up (sender is idempotent per month + skips paid restaurants).
          if (newCount >= 80 && newCount < 100) await notifyCapWarning80(restaurant.id);
        } catch (e) {
          console.error("[orders POST] incrementOrderCount:", e);
        }
      })(),
    );

    // ── Release the order to kitchen + customer (or defer if paying card) ──
    // Cash / pay-at-store → fire notifications NOW. The order goes straight
    //   to the kitchen display and the customer gets the confirmation email.
    // Online card or PayPal → DO NOT fire. The order exists in the DB but
    //   `notifiedAt` stays null, so the kitchen GET filters it out. We release
    //   only after the payment is actually authorized:
    //     - Stripe: payment_intent.succeeded webhook
    //     - PayPal: /api/public/paypal-order/[id]/authorize endpoint hits
    //       fireOrderNotifications after the customer approves on PayPal.
    //   This prevents a customer from "placing" an online order, never paying,
    //   and the kitchen cooking food we'll never get paid for.
    const method = paymentMethod || "cash";
    const deferKitchenRelease = method === "card" || method === "paypal";
    if (!deferKitchenRelease) {
      // IMPORTANT: schedule via after() — Vercel kills bare unawaited
      // promises the moment we return the response below. We hit this
      // exact bug with card orders (ORD-529226215, fixed in commit 9ae4745
      // by awaiting). Customer-facing routes can't just `await` because
      // it adds Resend latency to the response; after() runs the work
      // post-response but keeps the lambda alive until it completes.
      after(
        (async () => {
          try {
            await fireOrderNotifications(order.id);
          } catch (e) {
            console.error("[orders POST] fireOrderNotifications:", e);
          }
        })(),
      );
    }

    // Marketplace counters — bump monthly orders / revenue / lifetime
    // savings. We bump on order CREATE (not on payment success) because
    // even an abandoned card order represents marketplace engagement.
    // If the order later gets rejected/cancelled, the reject path calls
    // unrecordMarketplaceOrder to roll back currentMonth counters
    // (lifetime savings stays — it's a "what could have been" metric).
    if (viaMarketplace) {
      after(
        (async () => {
          try {
            await recordMarketplaceOrder({
              orderId: order.id,
              restaurantId: restaurant.id,
              orderTotalCents: Math.round(serverTotal * 100),
              savedVsUberEatsCents: savedVsUberEatsCents ?? 0,
            });
          } catch (e) {
            console.error("[orders POST] recordMarketplaceOrder:", e);
          }
        })(),
      );
    }

    // Marketing Studio per-link attribution (Luigi 2026-06-10): if this session
    // arrived via a smart-link scan (?ref=), bump that link's order + revenue
    // counters EXACTLY once (idempotent claim). after() so it never delays the
    // response; recordSmartLinkOrder is internally try/caught.
    if (resolvedRefCode) {
      after(
        recordSmartLinkOrder({
          orderId: order.id,
          refCode: resolvedRefCode,
          restaurantId: restaurant.id,
          revenueCents: Math.round(serverTotal * 100),
        }),
      );
    }

    return NextResponse.json({
      id: order.id,
      orderNumber: order.orderNumber,
      total: serverTotal,
      // Client uses this to decide whether to redirect straight to the
      // status page (cash / pay-in-person) or first take the customer
      // through a payment surface (Stripe Elements or PayPal approval).
      requiresPayment: deferKitchenRelease,
    }, { status: 201 });
  } catch (err) {
    console.error("[orders POST]", err);
    return NextResponse.json({ error: "Failed to place order" }, { status: 500 });
  }
}
