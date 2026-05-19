import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { notifyCustomer, notifyStaff } from "@/lib/notifications";

/**
 * Test-order endpoint — kitchen "Test Order" button.
 *
 * Goal: behaviorally indistinguishable from a real customer order so the
 * restaurant can see exactly what happens when one comes in:
 *   - Real DB Order row, with [TEST] prefix on the customer name so it's
 *     visually flagged but otherwise identical
 *   - Customer-confirmation email is sent to the LOGGED-IN OWNER's email
 *     (not a fake @test.com address) so the owner sees what a real
 *     customer would receive in their inbox
 *   - Staff notification email goes through the SAME notifyStaff fan-out
 *     to all configured NotificationRecipient rows, exactly like a real
 *     order — so the kitchen team verifies their notification chain works
 *   - Kitchen Display picks it up via its 4s poll → new-order detection
 *     fires → bell rings → auto-print on accept (same as real flow)
 */

const TEST_CUSTOMERS = [
  { name: "Alex Johnson",   phone: "(555) 012-3456", type: "pickup"   },
  { name: "Maria Garcia",   phone: "(555) 987-6543", type: "delivery" },
  { name: "Sam Chen",       phone: "(555) 456-7890", type: "pickup"   },
  { name: "Taylor Brown",   phone: "(555) 321-0987", type: "delivery" },
  { name: "Jordan Williams",phone: "(555) 654-3210", type: "pickup"   },
];

const TEST_NOTES = [
  "Extra napkins please",
  "Allergy: no nuts",
  "Ring doorbell twice",
  "",
  "Leave at door",
  "",
  "Extra hot sauce on the side",
];

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role;
    if (!["restaurant_admin", "kitchen_staff", "superadmin"].includes(role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user = await getSessionUser({ preferKitchen: true });
    const restaurantId = user?.restaurantId;
    if (!restaurantId) return NextResponse.json({ error: "No restaurant" }, { status: 400 });

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        id: true,
        slug: true,
        taxRate: true,
        deliveryFee: true,
        estimatedPickup: true,
        estimatedDelivery: true,
      },
    });
    if (!restaurant) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });

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

    const customer = TEST_CUSTOMERS[Math.floor(Math.random() * TEST_CUSTOMERS.length)];
    const orderType = customer.type as "pickup" | "delivery";
    const note = TEST_NOTES[Math.floor(Math.random() * TEST_NOTES.length)];

    // Use the logged-in owner's email as the "customer email" for this test
    // order. We do NOT want to send to @test.com addresses (bounces hurt our
    // domain reputation) and we DO want the owner to see what their real
    // customers receive. session.user.email is set by next-auth from the
    // owner User row.
    const ownerEmail = (session?.user as any)?.email
      || (user as any)?.email
      || null;

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
        customerName: `[TEST] ${customer.name}`,
        customerPhone: customer.phone,
        customerEmail: ownerEmail,
        deliveryAddress: orderType === "delivery" ? "123 Test Street" : null,
        deliveryCity: orderType === "delivery" ? "Testville" : null,
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
        customerName: `[TEST] ${customer.name}`,
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
        customerName: `[TEST] ${customer.name}`,
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
