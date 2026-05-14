import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";

const TEST_CUSTOMERS = [
  { name: "Alex Johnson",   phone: "(555) 012-3456", email: "alex@test.com",   type: "pickup"   },
  { name: "Maria Garcia",   phone: "(555) 987-6543", email: "maria@test.com",  type: "delivery" },
  { name: "Sam Chen",       phone: "(555) 456-7890", email: "sam@test.com",    type: "pickup"   },
  { name: "Taylor Brown",   phone: "(555) 321-0987", email: "taylor@test.com", type: "delivery" },
  { name: "Jordan Williams",phone: "(555) 654-3210", email: "jw@test.com",     type: "pickup"   },
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
    const user = await getSessionUser();
    const restaurantId = user?.restaurantId;
    if (!restaurantId) return NextResponse.json({ error: "No restaurant" }, { status: 400 });

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { taxRate: true, deliveryFee: true },
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

    const customer = TEST_CUSTOMERS[Math.floor(Math.random() * TEST_CUSTOMERS.length)];
    const orderType = customer.type as "pickup" | "delivery";
    const note = TEST_NOTES[Math.floor(Math.random() * TEST_NOTES.length)];

    // Build item totals
    const orderItems = picked.map(item => ({
      menuItemId: item.id,
      name: item.name,
      price: item.price,
      quantity: 1,
      subtotal: item.price,
      variantName: null,
      notes: null,
    }));

    const subtotal = orderItems.reduce((s, i) => s + i.subtotal, 0);
    const deliveryFee = orderType === "delivery" ? (restaurant?.deliveryFee ?? 3.99) : 0;
    const taxRate = restaurant?.taxRate ?? 8;
    const taxAmount = parseFloat(((subtotal + deliveryFee) * (taxRate / 100)).toFixed(2));
    const total = parseFloat((subtotal + deliveryFee + taxAmount).toFixed(2));

    // Generate order number
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
        customerEmail: customer.email,
        deliveryAddress: orderType === "delivery" ? "123 Test Street" : null,
        deliveryCity: orderType === "delivery" ? "Testville" : null,
        notes: note || null,
        subtotal,
        taxAmount,
        deliveryFee,
        total,
        paymentMethod: "cash",
        paymentStatus: "pending",
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

    return NextResponse.json(order, { status: 201 });
  } catch (err: any) {
    console.error("[kitchen/test-order POST]", err);
    return NextResponse.json({ error: err.message ?? "Failed to create test order" }, { status: 500 });
  }
}
