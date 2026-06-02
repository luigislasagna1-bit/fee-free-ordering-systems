import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import prisma from "@/lib/db";
import { generateOrderNumber } from "@/lib/utils";
import { applyPromotions, totalPromoDiscount } from "@/lib/promo-engine";
import { liveOpenStatus, nextOpenAt, parseLocalDateTimeInTz } from "@/lib/restaurant-hours";
import { findZoneForPoint, geocodeAddress, type ZoneLike } from "@/lib/geocode";
import { evaluateApplicableFees, sumAppliedFees, type ServiceFeeRow } from "@/lib/service-fees";
import { resolveMenuRestaurantId } from "@/lib/brand";
import { fireOrderNotifications } from "@/lib/order-notifications";
import { checkOrderCap, incrementOrderCount } from "@/lib/order-cap";
import {
  computeUberEatsEquivalentCents,
  recordMarketplaceOrder,
  isOnMarketplace,
} from "@/lib/marketplace";
import { getCurrentCustomer } from "@/lib/customer-session";
const ALLOWED_ORDER_TYPES = ["pickup", "delivery", "dine_in", "catering"] as const;
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

function sanitize(s: unknown, max = MAX_STRING): string {
  return String(s ?? "").trim().slice(0, max);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      restaurantSlug, type, customerName, customerEmail, customerPhone,
      deliveryAddress, deliveryCity, deliveryZip, notes, paymentMethod,
      scheduledFor, couponId, marketingConsent,
      // Typed coupon code from the cart's Apply field — fed into the
      // engine's couponPromos branch so autoApply=false promos with a
      // Promotion.couponCode match can fire on the server recompute.
      // Empty/undefined → engine ignores. Sanitised below.
      couponCode: bodyCouponCode,
      items, tip: clientTip,
      // Marketplace attribution: the customer was redirected here from
      // /marketplace/[slug] (which appends ?from=marketplace). The client
      // forwards this in the body so we can stamp the order as having
      // come via the marketplace channel. Trusted hint only — we also
      // verify the restaurant is currently entitled before stamping, so
      // a tampered client can't fake-stamp a direct order as marketplace.
      from,
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
    if (type === "delivery" && !deliveryAddress) {
      return NextResponse.json({ error: "Delivery address required" }, { status: 400 });
    }

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
      },
    });
    if (!restaurant) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });

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
        case "catering": return (restaurant as any).cateringPausedUntil;
        default:         return null; // take_out reuses pickup-style; covered above for the known set
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

    let serverSubtotal = 0;
    const validatedItems: Array<{
      menuItemId: string | null; variantId: string | null; variantName: string | null;
      name: string; price: number; quantity: number; notes: string | null; subtotal: number;
      modifiers: Array<{ modifierOptionId: string; name: string; priceAdjustment: number }>;
      bundleItems: unknown | null;
    }> = [];

    for (const raw of items) {
      // ── Bundle line item branch ────────────────────────────────────
      // Promo Type 8 / 13 bundles arrive with a synthetic menuItemId
      // ("bundle:<promoId>") + a non-empty bundleItems array. We do NOT
      // look these up in the menu (the parent isn't a real MenuItem);
      // we trust the client-supplied bundle price (the promo engine
      // enforces eligibility; recomputing the price here would clobber
      // the owner's fixed bundlePrice). We DO validate every child
      // menuItemId belongs to this restaurant — that's the only way a
      // tampered client could sneak unauthorized items into a free
      // bundle wrapper.
      const isBundleLine =
        (typeof raw.menuItemId === "string" && raw.menuItemId.startsWith("bundle:")) ||
        (raw.isBundle === true && Array.isArray(raw.bundleItems) && raw.bundleItems.length > 0);
      if (isBundleLine) {
        if (!Array.isArray(raw.bundleItems) || raw.bundleItems.length === 0) {
          return NextResponse.json({ error: "Bundle item missing children" }, { status: 400 });
        }
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
            specialityFee:
              typeof child.specialityFee === "number" && child.specialityFee >= 0
                ? Math.round(child.specialityFee * 100) / 100
                : undefined,
          });
        }
        const bundleQty = Math.max(1, Math.min(99, parseInt(raw.quantity, 10) || 1));
        // Bundle price = client's lineTotal divided by quantity (always 1
        // in the current UX, but we tolerate >1 in case we change that).
        const clientSubtotal =
          typeof raw.subtotal === "number" ? raw.subtotal : Number(raw.price ?? 0) * bundleQty;
        const bundleLineTotal = Math.max(0, Math.round(clientSubtotal * 100) / 100);
        const bundleUnitPrice = Math.round((bundleLineTotal / bundleQty) * 100) / 100;
        serverSubtotal += bundleLineTotal;

        validatedItems.push({
          menuItemId: null, // synthetic bundle wrapper — not a real MenuItem
          variantId: null,
          variantName: null,
          name: sanitize(
            raw.bundlePromoName ?? raw.name ?? "Bundle",
            200,
          ),
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
      return NextResponse.json({ error: `Minimum order is $${restaurant.minimumOrder.toFixed(2)}` }, { status: 400 });
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

    // ── Promo engine (server-side) ──────────────────────────────────────────
    // Same brand-scope merging as coupons above: this location's own promos
    // AND any "brand"-scoped promos owned by the parent.
    const promoOwnerIds: string[] = [restaurant.id];
    if (restaurant.parentRestaurantId) promoOwnerIds.push(restaurant.parentRestaurantId);
    const activePromos = await prisma.promotion.findMany({
      where: {
        isActive: true,
        OR: [
          { restaurantId: restaurant.id },
          { restaurantId: { in: promoOwnerIds }, scope: "brand" },
        ],
      },
    });
    // ── Delivery fee + zone resolution ──────────────────────────────────────
    // Resolved BEFORE applyPromotions() so the engine can evaluate the
    // Delivery Area restriction (Phase 2a) — free-delivery promos with
    // `deliveryZoneIds` need this context to fire.
    let resolvedZoneId: string | null = null;
    let resolvedZoneMinutes: number | null = null;
    let zoneDeliveryFee = restaurant.deliveryFee;
    let zoneMinimumOrder = restaurant.minimumOrder ?? 0;
    // Captured here so it survives past the zone-resolution block and
    // can be stamped onto the Order for the Delivery Heatmap report.
    // We already pay the geocode cost once for zone resolution — reusing
    // the result is free.
    let deliveryCoords: { lat: number; lng: number } | null = null;

    if (type === "delivery") {
      const zones = await prisma.deliveryZone.findMany({
        where: { restaurantId: restaurant.id, isActive: true },
      });
      if (zones.length > 0 && restaurant.lat != null && restaurant.lng != null && deliveryAddress) {
        const addrParts = [deliveryAddress, deliveryCity, deliveryZip].filter(Boolean).join(", ");
        const coords = await geocodeAddress(addrParts);
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
            resolvedZoneId = resolved.zone.id;
            resolvedZoneMinutes = resolved.zone.estimatedMinutes;
            zoneDeliveryFee = resolved.zone.deliveryFee;
            zoneMinimumOrder = resolved.zone.minimumOrder;
          }
        }
      }
      // Server-side minimum-order enforcement (uses resolved zone if any).
      if (zoneMinimumOrder > 0 && serverSubtotal < zoneMinimumOrder) {
        return NextResponse.json(
          { error: `Minimum order for this delivery area is $${zoneMinimumOrder.toFixed(2)}.` },
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
    if (promoCustomerEmail) {
      // Per-restaurant Customer — drives isNewCustomer (count of prior
      // orders) and feeds hasUsedLifetime lookup.
      const existingCustomer = await prisma.customer.findFirst({
        where: { restaurantId: restaurant.id, email: promoCustomerEmail },
        select: { id: true, totalOrders: true },
      });
      if (existingCustomer && existingCustomer.totalOrders > 0) {
        isNewCustomerForPromo = false;
        // For each promo with onceLifetimePerClient, check if this
        // customer has ever applied it before. We bulk-query OrderItem-
        // free aggregates by Order so a customer can't redeem the same
        // once-per-lifetime promo twice. We match via the campaign
        // sequence (recorded on Order via the deprecated `couponId`
        // field for legacy promos, or via promoDiscount + name for
        // newer pre-made campaigns). For now we approximate: any
        // prior Order with a non-zero promoDiscount that matches the
        // promo's campaignRef.
        const lifetimePromos = activePromos.filter((p) => p.onceLifetimePerClient);
        if (lifetimePromos.length > 0) {
          // Quick approximation: did this customer ever place an order
          // where ANY promo with the lifetime flag was active? We mark
          // them all "used". This is conservative — it errs toward
          // not-applying the promo on a 2nd order, which is the safer
          // failure mode (vs. over-redeeming). Future enhancement:
          // track promoId on Order directly.
          const priorOrderCount = await prisma.order.count({
            where: {
              restaurantId: restaurant.id,
              customerId: existingCustomer.id,
              status: { notIn: ["cancelled", "rejected"] },
              promoDiscount: { gt: 0 },
            },
          });
          if (priorOrderCount > 0) {
            for (const p of lifetimePromos) hasUsedLifetimeForPromo[p.id] = true;
          }
        }
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
    const promoResults = applyPromotions(activePromos as any, {
      orderType: type,
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
          price: i.price,
          quantity: i.quantity,
          subtotal: i.subtotal,
        })),
      paymentMethod,
      // Phase 2a: the Delivery Area restriction needs this. Undefined
      // for pickup/dine-in (the engine short-circuits zone-restricted
      // promos via the orderType check).
      deliveryZoneId: resolvedZoneId ?? undefined,
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
      // Normalise the marketing-consent flag once so both the create
      // and update branches can apply it consistently. Stored only
      // when the customer affirmatively ticked the box (we don't want
      // to silently overwrite a previously-true consent with false
      // just because the customer left the box unchecked on a later
      // order — they explicitly opted in once, that survives).
      const hasOptedInMarketing = marketingConsent === true;
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
            marketingConsent: hasOptedInMarketing,
            marketingConsentAt: hasOptedInMarketing ? new Date() : null,
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
            // Upgrade-only consent: if they tick the box on this order
            // and weren't previously opted in, record it. If they
            // leave it unchecked, we DON'T flip them back to false —
            // a checkout form is not the place to revoke consent
            // (the profile page + email unsubscribe link are).
            ...(hasOptedInMarketing && !customer.marketingConsent
              ? { marketingConsent: true, marketingConsentAt: new Date() }
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
    const viaMarketplace = claimsMarketplace
      ? await isOnMarketplace(restaurant.id)
      : false;
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
    if (typeof sessionHash === "string" && /^[a-f0-9]{16,64}$/i.test(sessionHash)) {
      const visit = await prisma.websiteVisit.findFirst({
        where: { restaurantId: restaurant.id, sessionHash },
        select: { channel: true },
        orderBy: { createdAt: "desc" },
      });
      if (visit) resolvedChannel = visit.channel;
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
    const wantsAutoAccept = !!restaurant.autoAcceptOrders;
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
    const scheduledForDate: Date | null = scheduledFor
      ? (() => {
          const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(String(scheduledFor));
          if (m) {
            const tz = (restaurant as any).timezone ?? undefined;
            return parseLocalDateTimeInTz(m[1], parseInt(m[2], 10), parseInt(m[3], 10), tz);
          }
          return new Date(scheduledFor);
        })()
      : null;
    const hasFutureSchedule =
      scheduledForDate !== null &&
      Number.isFinite(scheduledForDate.getTime()) &&
      scheduledForDate.getTime() > Date.now();

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
    const openingHoursForCheck = (restaurant as any).openingHours
      ?? (restaurant as any).hours
      ?? [];
    const restaurantTz = (restaurant as any).timezone ?? undefined;
    const liveStatus = liveOpenStatus(
      openingHoursForCheck,
      new Date(),
      restaurant.hoursFormat === "12h" ? "12h" : "24h",
      undefined,
      restaurantTz,
    );
    const isClosedNow = liveStatus.kind !== "open";
    let alertAtValue: Date | null = null;
    if (isClosedNow) {
      const next = nextOpenAt(openingHoursForCheck, new Date(), restaurantTz);
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
        orderNumber: generateOrderNumber(),
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
        customerName: sanitize(customerName, 100),
        customerEmail: cleanEmail,
        customerPhone: cleanPhone,
        deliveryAddress: deliveryAddress ? sanitize(deliveryAddress, 300) : null,
        deliveryCity: deliveryCity ? sanitize(deliveryCity, 100) : null,
        deliveryZip: deliveryZip ? sanitize(deliveryZip, 20) : null,
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

    // Bump the monthly counter. Fire-and-forget — if this fails we'd
    // rather take the order than lose it. The increment is racy under
    // simultaneous orders, but the worst case is an occasional +1 over
    // the cap which is fine. See src/lib/order-cap.ts.
    after(
      (async () => {
        try {
          await incrementOrderCount(restaurant.id);
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
