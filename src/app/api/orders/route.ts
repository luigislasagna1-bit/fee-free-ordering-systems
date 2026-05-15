import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { generateOrderNumber } from "@/lib/utils";
import { sendOrderConfirmationEmail, sendNewOrderNotificationEmail } from "@/lib/email";
import { applyPromotions, totalPromoDiscount } from "@/lib/promo-engine";
import { findZoneForPoint, geocodeAddress, type ZoneLike } from "@/lib/geocode";
import { evaluateApplicableFees, sumAppliedFees, type ServiceFeeRow } from "@/lib/service-fees";

const ALLOWED_ORDER_TYPES = ["pickup", "delivery", "dine_in", "catering"] as const;
const ALLOWED_PAYMENT_METHODS = ["cash", "card"] as const;
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
    const menuItemIds = [...new Set(items.map((i: any) => String(i.menuItemId)))];
    const menuItems = await prisma.menuItem.findMany({
      where: { id: { in: menuItemIds }, restaurantId: restaurant.id, isAvailable: true },
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
    let serverCouponDiscount = 0;
    let resolvedCouponId: string | null = null;
    if (couponId) {
      const coupon = await prisma.coupon.findFirst({
        where: { id: String(couponId), restaurantId: restaurant.id, isActive: true },
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
    const activePromos = await prisma.promotion.findMany({
      where: { restaurantId: restaurant.id, isActive: true },
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

    if (type === "delivery") {
      const zones = await prisma.deliveryZone.findMany({
        where: { restaurantId: restaurant.id, isActive: true },
      });
      if (zones.length > 0 && restaurant.lat != null && restaurant.lng != null && deliveryAddress) {
        const addrParts = [deliveryAddress, deliveryCity, deliveryZip].filter(Boolean).join(", ");
        const coords = await geocodeAddress(addrParts);
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
    let customer = null;
    const cleanEmail = customerEmail ? sanitize(customerEmail, 254).toLowerCase() : null;
    const cleanPhone = customerPhone ? sanitize(customerPhone, 30) : null;
    if (cleanEmail || cleanPhone) {
      const where = cleanEmail ? { restaurantId: restaurant.id, email: cleanEmail } : undefined;
      if (where) customer = await prisma.customer.findFirst({ where });
      if (!customer) {
        customer = await prisma.customer.create({
          data: { restaurantId: restaurant.id, name: sanitize(customerName, 100), email: cleanEmail, phone: cleanPhone },
        });
      } else {
        await prisma.customer.update({
          where: { id: customer.id },
          data: { totalOrders: { increment: 1 }, totalSpent: { increment: serverTotal } },
        });
      }
    }

    // ── Increment coupon usage ──────────────────────────────────────────────
    if (resolvedCouponId) {
      await prisma.coupon.update({ where: { id: resolvedCouponId }, data: { usedCount: { increment: 1 } } });
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

    // ── Emails (fire-and-forget) ────────────────────────────────────────────
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
    if (cleanEmail) {
      sendOrderConfirmationEmail({
        to: cleanEmail,
        customerName: sanitize(customerName, 100),
        orderNumber: order.orderNumber,
        restaurantName: restaurant.name,
        items: validatedItems.map((i) => ({ name: i.name, quantity: i.quantity, price: i.price })),
        total: serverTotal,
        orderType: type,
        estimatedTime: type === "pickup" ? restaurant.estimatedPickup : restaurant.estimatedDelivery,
        trackingUrl: `${baseUrl}/order/${restaurantSlug}/status/${order.id}`,
        locale: restaurant.defaultLanguage || "en",
      }).catch(() => {});
    }
    if (restaurant.email) {
      sendNewOrderNotificationEmail({
        to: restaurant.email ?? "",
        restaurantName: restaurant.name,
        orderNumber: order.orderNumber,
        customerName: sanitize(customerName, 100),
        total: serverTotal,
        dashboardUrl: `${baseUrl}/admin/orders`,
        locale: restaurant.defaultLanguage || "en",
      }).catch(() => {});
    }

    return NextResponse.json({ id: order.id, orderNumber: order.orderNumber, total: serverTotal }, { status: 201 });
  } catch (err) {
    console.error("[orders POST]", err);
    return NextResponse.json({ error: "Failed to place order" }, { status: 500 });
  }
}
