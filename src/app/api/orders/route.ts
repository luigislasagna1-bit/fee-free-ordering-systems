import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import prisma from "@/lib/db";
import { generateOrderNumber } from "@/lib/utils";
import { applyPromotions, totalPromoDiscount } from "@/lib/promo-engine";
import { findZoneForPoint, geocodeAddress, type ZoneLike } from "@/lib/geocode";
import { evaluateApplicableFees, sumAppliedFees, type ServiceFeeRow } from "@/lib/service-fees";
import { resolveMenuRestaurantId } from "@/lib/brand";
import { fireOrderNotifications } from "@/lib/order-notifications";
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
const ALLOWED_PAYMENT_METHODS = ["cash", "card", "card_in_person"] as const;
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
      scheduledFor, couponId, items, tip: clientTip,
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
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug: sanitize(restaurantSlug, 100), isActive: true },
    });
    if (!restaurant) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });

    // ── Server-side price calculation ───────────────────────────────────────
    // Menu items may live on the parent restaurant if this location inherits
    // the brand menu (useBrandMenu=true). Resolve the effective menu owner
    // before validating — otherwise inherited-menu locations would reject
    // every order with "menu item not found".
    const menuRestaurantId = await resolveMenuRestaurantId(restaurant.id);
    const menuItemIds = [...new Set(items.map((i: any) => String(i.menuItemId)))];
    const menuItems = await prisma.menuItem.findMany({
      where: { id: { in: menuItemIds }, restaurantId: menuRestaurantId, isAvailable: true },
      include: {
        variants: true,
        modifierGroups: { include: { options: { where: { isAvailable: true } } } },
      },
    });
    const menuItemMap = new Map(menuItems.map((m) => [m.id, m]));

    let serverSubtotal = 0;
    const validatedItems: Array<{
      menuItemId: string; variantId: string | null; variantName: string | null;
      name: string; price: number; quantity: number; notes: string | null; subtotal: number;
      modifiers: Array<{ modifierOptionId: string; name: string; priceAdjustment: number }>;
    }> = [];

    for (const raw of items) {
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

      for (const rawMod of rawMods) {
        let found = false;
        for (const group of menuItem.modifierGroups) {
          const opt = group.options.find((o) => o.id === rawMod.modifierOptionId);
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
        if (!coupon.expiresAt || new Date(coupon.expiresAt) > new Date()) {
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
    const promoResults = applyPromotions(activePromos as any, {
      orderType: type,
      isNewCustomer: false,
      subtotal: serverSubtotal,
      items: validatedItems.map((i) => ({ menuItemId: i.menuItemId, price: i.price, quantity: i.quantity, subtotal: i.subtotal })),
      paymentMethod,
    });
    const serverPromoDiscount = Math.round(totalPromoDiscount(promoResults, serverSubtotal) * 100) / 100;
    const hasFreeDelivery = promoResults.some((r: any) => r.type === "free_delivery");

    // ── Delivery fee + zone resolution ──────────────────────────────────────
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
    const serverTip = typeof clientTip === "number" && clientTip >= 0
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
          },
        });
      }
    }

    // ── Increment coupon usage ──────────────────────────────────────────────
    if (resolvedCouponId) {
      await prisma.coupon.update({ where: { id: resolvedCouponId }, data: { usedCount: { increment: 1 } } });
    }

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

    // ── Auto-accept handling ────────────────────────────────────────────────
    const wantsAutoAccept = !!restaurant.autoAcceptOrders;
    const fulfillmentMinutes = type === "delivery"
      ? restaurant.estimatedDelivery
      : restaurant.estimatedPickup;
    const initialStatus = wantsAutoAccept ? "accepted" : "pending";
    const acceptedAtValue: Date | null = wantsAutoAccept ? new Date() : null;
    const estimatedReadyValue: Date | null = wantsAutoAccept
      ? new Date(Date.now() + fulfillmentMinutes * 60_000)
      : null;
    const preparationTimeValue: number | null = wantsAutoAccept ? fulfillmentMinutes : null;

    // ── Create order ────────────────────────────────────────────────────────
    const order = await prisma.order.create({
      data: {
        restaurantId: restaurant.id,
        customerId: customer?.id || null,
        orderNumber: generateOrderNumber(),
        status: initialStatus,
        acceptedAt: acceptedAtValue,
        estimatedReady: estimatedReadyValue,
        preparationTime: preparationTimeValue,
        appliedServiceFees: appliedFees.length > 0 ? JSON.stringify(appliedFees) : null,
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
        scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
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
          })),
        },
      },
      include: { items: { include: { modifiers: true } } },
    });

    // ── Release the order to kitchen + customer (or defer if paying card) ──
    // Cash / pay-at-store → fire notifications NOW. The order goes straight
    //   to the kitchen display and the customer gets the confirmation email.
    // Online card → DO NOT fire. The order exists in the DB but `notifiedAt`
    //   stays null, so the kitchen GET filters it out. We release in the
    //   payment_intent.succeeded webhook once Stripe confirms payment cleared.
    //   This prevents a customer from "placing" a card order, never paying,
    //   and the kitchen cooking food they'll never get paid for.
    const isCardOrder = (paymentMethod || "cash") === "card";
    if (!isCardOrder) {
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
      // status page (cash) or first take the customer through Stripe
      // Elements (card).
      requiresPayment: isCardOrder,
    }, { status: 201 });
  } catch (err) {
    console.error("[orders POST]", err);
    return NextResponse.json({ error: "Failed to place order" }, { status: 500 });
  }
}
