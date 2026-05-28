import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { notifyCustomer, notifyStaff } from "@/lib/notifications";

/**
 * Test-order endpoint — kitchen "Test Order" button.
 *
 * Goal: behaviorally indistinguishable from a real customer order so the
 * restaurant can see exactly what happens when one comes in. Uses the
 * RESTAURANT'S OWN info (owner's name, restaurant phone + address, real
 * menu items) for every field so the test order is fully grounded in the
 * restaurant's reality — receipts print with familiar info, the email
 * arrives in the owner's inbox addressed to them, delivery test orders
 * route to the restaurant's own address.
 *
 *   - Real DB Order row, with [TEST] prefix on the customer name so it's
 *     visually flagged but otherwise identical
 *   - Customer-confirmation email goes to the LOGGED-IN OWNER's email
 *     (real send → real receipt visible in owner's inbox)
 *   - Staff notification fans out through the SAME notifyStaff path as a
 *     real order, exercising the full notification chain
 *   - Kitchen Display picks it up via the 4s poll, bell rings, auto-print
 *     on accept fires — same as a real flow
 */

export async function POST() {
  try {
    // The "Test Order" button is most commonly clicked from the kitchen
    // display — both in the web browser and (now) inside the Capacitor
    // native app. The previous getServerSession(authOptions) call only
    // recognized the ADMIN session, so kitchen-side clicks failed with
    // 401. Use getSessionUser with preferKitchen so the same endpoint
    // works for both contexts. The downstream role check is still strict.
    const user = await getSessionUser({ preferKitchen: true });
    const restaurantId = user?.restaurantId;
    const role = user?.role;
    if (!user || !["restaurant_admin", "kitchen_staff", "superadmin"].includes(role ?? "")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!restaurantId) return NextResponse.json({ error: "No restaurant" }, { status: 400 });

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        id: true,
        slug: true,
        name: true,
        phone: true,
        address: true,
        city: true,
        zip: true,
        acceptsPickup: true,
        acceptsDelivery: true,
        taxRate: true,
        deliveryFee: true,
        estimatedPickup: true,
        estimatedDelivery: true,
      },
    });
    if (!restaurant) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });

    // Pull the owner's User row so we can use THEIR name as the customer
    // name on the test order. Falls back to the restaurant name if the
    // owner hasn't set a name on their profile (rare — signup form
    // captures it).
    const owner = await prisma.user.findUnique({
      where: { id: user.id },
      select: { name: true, email: true },
    });

    // Find available menu items to make a realistic order
    const menuItems = await prisma.menuItem.findMany({
      where: { restaurantId, isAvailable: true, isSoldOut: false },
      take: 20,
      orderBy: { sortOrder: "asc" },
    });

    if (menuItems.length === 0) {
      return NextResponse.json({ error: "No menu items found. Add some items to your menu first." }, { status: 400 });
    }

    // Pick 1-3 random items
    const shuffled = [...menuItems].sort(() => Math.random() - 0.5);
    const picked = shuffled.slice(0, Math.min(3, Math.ceil(Math.random() * 3)));

    // Resolve customer-side fields from the RESTAURANT'S OWN data, not
    // hardcoded fake records. The order looks like it came from the
    // owner ordering from their own restaurant — most-realistic test
    // because every field on the receipt is something the owner recognises.
    const customerName = owner?.name?.trim() || restaurant.name;
    const customerPhone = restaurant.phone || null;
    const ownerEmail = owner?.email || (user as any)?.email || null;

    // Order type: prefer pickup when accepted (most common; no address
    // required), fall back to delivery if that's the only option.
    const orderType: "pickup" | "delivery" =
      restaurant.acceptsPickup ? "pickup"
      : restaurant.acceptsDelivery ? "delivery"
      : "pickup";

    // Optional friendly note so the receipt isn't bare. Empty string
    // works fine; we only set it when there's a non-trivial value.
    const note = "Test order from kitchen panel";

    // Build item totals
    const orderItems = picked.map(item => ({
      menuItemId: item.id,
      name: item.name,
      price: item.price,
      quantity: 1,
      subtotal: item.price,
      variantName: null as string | null,
      notes: null as string | null,
    }));

    const subtotal = orderItems.reduce((s, i) => s + i.subtotal, 0);
    const deliveryFee = orderType === "delivery" ? (restaurant.deliveryFee ?? 3.99) : 0;
    const taxRate = restaurant.taxRate ?? 8;
    const taxAmount = parseFloat(((subtotal + deliveryFee) * (taxRate / 100)).toFixed(2));
    const total = parseFloat((subtotal + deliveryFee + taxAmount).toFixed(2));

    // Generate order number — `TEST-` prefix so it's identifiable in
    // reports, but the rest is the same 6-digit timestamp tail used in
    // real order numbers.
    const ts = Date.now().toString().slice(-6);
    const orderNumber = `TEST-${ts}`;

    const order = await prisma.order.create({
      data: {
        restaurantId,
        orderNumber,
        status: "pending",
        type: orderType,
        customerName: `[TEST] ${customerName}`,
        customerPhone: customerPhone,
        customerEmail: ownerEmail,
        // For a delivery test order we route to the RESTAURANT'S OWN
        // address — owner ordering from their own restaurant. If the
        // restaurant doesn't have an address on file yet (rare), the
        // delivery fields stay null and the order still goes through
        // as a pickup-style row.
        deliveryAddress: orderType === "delivery" ? (restaurant.address ?? null) : null,
        deliveryCity:    orderType === "delivery" ? (restaurant.city ?? null) : null,
        deliveryZip:     orderType === "delivery" ? (restaurant.zip ?? null) : null,
        notes: note || null,
        subtotal,
        taxAmount,
        deliveryFee,
        total,
        paymentMethod: "cash",
        paymentStatus: "pending",
        // Test orders are always immediately released to the kitchen.
        // (They behave like cash orders for fan-out purposes.)
        notifiedAt: new Date(),
        items: {
          create: orderItems.map(i => ({
            menuItemId: i.menuItemId,
            name: i.name,
            price: i.price,
            quantity: i.quantity,
            subtotal: i.subtotal,
            variantName: i.variantName,
            notes: i.notes,
          })),
        },
      },
      include: {
        items: {
          include: { modifiers: { select: { name: true, priceAdjustment: true } } },
        },
      },
    });

    // ── Notifications — exact same fan-out as /api/orders POST ────────────
    // We fire BOTH the customer-confirmation email (to the owner's inbox)
    // and the staff notification (to the kitchen recipients). This is the
    // critical bit that was missing before — a test order now exercises
    // the entire email chain end-to-end.
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";

    notifyCustomer({
      restaurantId,
      customerEmail: ownerEmail,
      orderType,
      payload: {
        event: "orderConfirmed",
        customerName: `[TEST] ${customerName}`,
        orderNumber: order.orderNumber,
        items: orderItems.map((i) => ({ name: i.name, quantity: i.quantity, price: i.price })),
        total,
        orderType,
        estimatedTime: orderType === "pickup"
          ? restaurant.estimatedPickup
          : restaurant.estimatedDelivery,
        trackingUrl: `${baseUrl}/order/${restaurant.slug}/status/${order.id}`,
      },
    }).catch((e) => console.error("[test-order notifyCustomer]", e));

    notifyStaff({
      restaurantId,
      payload: {
        event: "orderPlaced",
        orderNumber: order.orderNumber,
        customerName: `[TEST] ${customerName}`,
        total,
        dashboardUrl: `${baseUrl}/admin/orders`,
      },
    }).catch((e) => console.error("[test-order notifyStaff]", e));

    return NextResponse.json(order, { status: 201 });
  } catch (err: any) {
    console.error("[kitchen/test-order POST]", err);
    return NextResponse.json({ error: err.message ?? "Failed to create test order" }, { status: 500 });
  }
}
