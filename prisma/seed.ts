import * as dotenv from "dotenv";
import path from "node:path";
// Load .env then .env.local (override) so DATABASE_URL is resolved the same
// way Prisma CLI resolves it.
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

// Postgres seed: Prisma 7 needs the pg adapter even for first-party Postgres.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL missing — set it in .env.local before seeding.");
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  console.log("🌱 Seeding database...");

  // Subscription plans
  const plans = await Promise.all([
    prisma.subscriptionPlan.upsert({
      where: { slug: "starter" },
      update: {},
      create: {
        name: "Starter",
        slug: "starter",
        price: 49.99,
        description: "Perfect for small restaurants getting started",
        features: JSON.stringify([
          "Online ordering widget",
          "Menu management",
          "Order dashboard",
          "Customer list",
          "Basic reports",
          "Email support",
        ]),
      },
    }),
    prisma.subscriptionPlan.upsert({
      where: { slug: "growth" },
      update: {},
      create: {
        name: "Growth",
        slug: "growth",
        price: 149.99,
        description: "For restaurants ready to grow",
        features: JSON.stringify([
          "Everything in Starter",
          "Advanced promotions",
          "Sales-optimized website",
          "Automatic marketing",
          "QR conversion stickers",
          "Advanced receipt editor",
          "Priority support",
        ]),
      },
    }),
    prisma.subscriptionPlan.upsert({
      where: { slug: "pro" },
      update: {},
      create: {
        name: "Pro",
        slug: "pro",
        price: 299.99,
        description: "Full-featured for high-volume restaurants",
        features: JSON.stringify([
          "Everything in Growth",
          "Branded mobile app",
          "Multi-location support",
          "Advanced analytics",
          "Custom integrations",
          "Dedicated account manager",
          "24/7 phone support",
        ]),
      },
    }),
    prisma.subscriptionPlan.upsert({
      where: { slug: "enterprise" },
      update: {},
      create: {
        name: "Enterprise",
        slug: "enterprise",
        price: 399.99,
        description: "For restaurant chains and franchises",
        features: JSON.stringify([
          "Everything in Pro",
          "Unlimited locations",
          "White-label solution",
          "Custom development",
          "SLA guarantee",
          "On-site training",
        ]),
      },
    }),
  ]);
  console.log(`✅ Created ${plans.length} subscription plans`);

  // Superadmin user
  const superadminHash = await bcrypt.hash("admin123", 12);
  const superadmin = await prisma.user.upsert({
    where: { email: "admin@feefreeordering.com" },
    update: {},
    create: {
      email: "admin@feefreeordering.com",
      name: "Super Admin",
      passwordHash: superadminHash,
      role: "superadmin",
    },
  });
  console.log("✅ Created superadmin:", superadmin.email);

  // Demo restaurant
  const demoRestaurant = await prisma.restaurant.upsert({
    where: { slug: "demo-pizza-palace" },
    update: {},
    create: {
      name: "Pizza Palace",
      slug: "demo-pizza-palace",
      description: "The best pizza in town, made fresh with love.",
      phone: "(555) 123-4567",
      email: "info@pizzapalace.com",
      address: "123 Main Street",
      city: "New York",
      state: "NY",
      zip: "10001",
      cuisineType: "Italian / Pizza",
      acceptsPickup: true,
      acceptsDelivery: true,
      deliveryFee: 3.99,
      minimumOrder: 15.0,
      estimatedPickup: 20,
      estimatedDelivery: 45,
      taxRate: 8.875,
      subscriptionStatus: "trial",
      trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      subscriptionPlanId: plans[0].id,
    },
  });
  console.log("✅ Created demo restaurant:", demoRestaurant.name);

  // Restaurant admin user
  const adminHash = await bcrypt.hash("restaurant123", 12);
  await prisma.user.upsert({
    where: { email: "owner@pizzapalace.com" },
    update: {},
    create: {
      email: "owner@pizzapalace.com",
      name: "Pizza Palace Owner",
      passwordHash: adminHash,
      role: "restaurant_admin",
      restaurantId: demoRestaurant.id,
    },
  });

  // Kitchen staff user
  const kitchenHash = await bcrypt.hash("kitchen123", 12);
  await prisma.user.upsert({
    where: { email: "kitchen@pizzapalace.com" },
    update: {},
    create: {
      email: "kitchen@pizzapalace.com",
      name: "Kitchen Staff",
      passwordHash: kitchenHash,
      role: "kitchen_staff",
      restaurantId: demoRestaurant.id,
    },
  });
  console.log("✅ Created restaurant users");

  // Opening hours (Mon-Sun). Compound unique now includes `service`
  // (null = default row for all services). Use findFirst + create
  // pattern since Prisma can't model service=null in compound unique
  // where input.
  for (let i = 0; i < 7; i++) {
    const existing = await prisma.openingHours.findFirst({
      where: { restaurantId: demoRestaurant.id, dayOfWeek: i, service: null },
      select: { id: true },
    });
    if (!existing) {
      await prisma.openingHours.create({
        data: {
          restaurantId: demoRestaurant.id,
          dayOfWeek: i,
          isOpen: i !== 1,
          openTime: "11:00",
          closeTime: "22:00",
        },
      });
    }
  }
  console.log("✅ Created opening hours");

  // Delivery zones
  await prisma.deliveryZone.create({
    data: {
      restaurantId: demoRestaurant.id,
      name: "Local",
      color: "#f97316",
      centerLat: 40.7128,
      centerLng: -74.006,
      radiusKm: 5,
      deliveryFee: 3.99,
      minimumOrder: 15.0,
    },
  });
  console.log("✅ Created delivery zones");

  // Menu categories
  const categories = await Promise.all([
    prisma.menuCategory.create({
      data: { restaurantId: demoRestaurant.id, name: "Pizzas", sortOrder: 1 },
    }),
    prisma.menuCategory.create({
      data: { restaurantId: demoRestaurant.id, name: "Pasta", sortOrder: 2 },
    }),
    prisma.menuCategory.create({
      data: { restaurantId: demoRestaurant.id, name: "Salads", sortOrder: 3 },
    }),
    prisma.menuCategory.create({
      data: { restaurantId: demoRestaurant.id, name: "Drinks", sortOrder: 4 },
    }),
    prisma.menuCategory.create({
      data: { restaurantId: demoRestaurant.id, name: "Desserts", sortOrder: 5 },
    }),
  ]);
  console.log(`✅ Created ${categories.length} menu categories`);

  // Menu items
  const pizzaItems = [
    { name: "Margherita Pizza", description: "Fresh tomato sauce, mozzarella, and basil", price: 14.99, isFeatured: true },
    { name: "Pepperoni Pizza", description: "Classic pepperoni with marinara and mozzarella", price: 16.99, isFeatured: true },
    { name: "BBQ Chicken Pizza", description: "Grilled chicken, BBQ sauce, red onions, cilantro", price: 17.99 },
    { name: "Veggie Supreme", description: "Bell peppers, mushrooms, olives, onions, tomatoes", price: 15.99 },
  ];
  const pastaItems = [
    { name: "Spaghetti Bolognese", description: "House-made meat sauce over spaghetti", price: 13.99 },
    { name: "Fettuccine Alfredo", description: "Rich cream sauce with Parmesan", price: 12.99 },
    { name: "Penne Arrabbiata", description: "Spicy tomato sauce with garlic and chili", price: 11.99 },
  ];
  const salads = [
    { name: "Caesar Salad", description: "Romaine, croutons, Caesar dressing, Parmesan", price: 9.99 },
    { name: "Garden Salad", description: "Mixed greens, veggies, choice of dressing", price: 7.99 },
  ];
  const drinks = [
    { name: "Soda", description: "Coke, Diet Coke, Sprite, or Orange", price: 2.99 },
    { name: "Lemonade", description: "Fresh-squeezed lemonade", price: 3.99 },
    { name: "Water", description: "Still or sparkling", price: 1.99 },
  ];
  const desserts = [
    { name: "Tiramisu", description: "Classic Italian dessert with espresso and mascarpone", price: 6.99 },
    { name: "Cannoli", description: "Crispy shell filled with sweet ricotta cream", price: 5.99 },
  ];

  const allItems = [
    ...pizzaItems.map((i) => ({ ...i, categoryId: categories[0].id })),
    ...pastaItems.map((i) => ({ ...i, categoryId: categories[1].id })),
    ...salads.map((i) => ({ ...i, categoryId: categories[2].id })),
    ...drinks.map((i) => ({ ...i, categoryId: categories[3].id })),
    ...desserts.map((i) => ({ ...i, categoryId: categories[4].id })),
  ];

  const createdItems: any[] = [];
  for (const item of allItems) {
    const created = await prisma.menuItem.create({
      data: { restaurantId: demoRestaurant.id, ...item },
    });
    createdItems.push(created);
  }
  console.log(`✅ Created ${createdItems.length} menu items`);

  // Modifiers for pizzas
  for (const pizza of createdItems.filter((i) => i.categoryId === categories[0].id)) {
    const sizeGroup = await prisma.modifierGroup.create({
      data: { menuItemId: pizza.id, name: "Size", required: true, minSelect: 1, maxSelect: 1, sortOrder: 1 },
    });
    await prisma.modifierOption.createMany({
      data: [
        { modifierGroupId: sizeGroup.id, name: 'Small (10")', priceAdjustment: 0, isDefault: true, sortOrder: 1 },
        { modifierGroupId: sizeGroup.id, name: 'Medium (12")', priceAdjustment: 2, sortOrder: 2 },
        { modifierGroupId: sizeGroup.id, name: 'Large (14")', priceAdjustment: 4, sortOrder: 3 },
        { modifierGroupId: sizeGroup.id, name: 'XL (16")', priceAdjustment: 6, sortOrder: 4 },
      ],
    });

    const crustGroup = await prisma.modifierGroup.create({
      data: { menuItemId: pizza.id, name: "Crust", required: true, minSelect: 1, maxSelect: 1, sortOrder: 2 },
    });
    await prisma.modifierOption.createMany({
      data: [
        { modifierGroupId: crustGroup.id, name: "Thin Crust", priceAdjustment: 0, isDefault: true, sortOrder: 1 },
        { modifierGroupId: crustGroup.id, name: "Regular Crust", priceAdjustment: 0, sortOrder: 2 },
        { modifierGroupId: crustGroup.id, name: "Thick Crust", priceAdjustment: 1, sortOrder: 3 },
        { modifierGroupId: crustGroup.id, name: "Stuffed Crust", priceAdjustment: 2.5, sortOrder: 4 },
      ],
    });

    const toppingsGroup = await prisma.modifierGroup.create({
      data: { menuItemId: pizza.id, name: "Extra Toppings", required: false, minSelect: 0, maxSelect: 5, sortOrder: 3 },
    });
    await prisma.modifierOption.createMany({
      data: [
        { modifierGroupId: toppingsGroup.id, name: "Extra Cheese", priceAdjustment: 1.5, sortOrder: 1 },
        { modifierGroupId: toppingsGroup.id, name: "Mushrooms", priceAdjustment: 1, sortOrder: 2 },
        { modifierGroupId: toppingsGroup.id, name: "Bell Peppers", priceAdjustment: 1, sortOrder: 3 },
        { modifierGroupId: toppingsGroup.id, name: "Olives", priceAdjustment: 1, sortOrder: 4 },
        { modifierGroupId: toppingsGroup.id, name: "Jalapeños", priceAdjustment: 1, sortOrder: 5 },
      ],
    });
  }
  console.log("✅ Created pizza modifiers");

  // Coupon
  await prisma.coupon.create({
    data: {
      restaurantId: demoRestaurant.id,
      code: "WELCOME10",
      description: "10% off your first order",
      discountType: "percentage",
      discountValue: 10,
      minimumOrder: 20,
      maxUses: 100,
      isActive: true,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
  console.log("✅ Created sample coupon (WELCOME10)");

  // Sample customer + order
  const customer = await prisma.customer.create({
    data: {
      restaurantId: demoRestaurant.id,
      name: "Jane Smith",
      email: "jane@example.com",
      phone: "(555) 987-6543",
      totalOrders: 1,
      totalSpent: 16.32,
    },
  });

  const firstPizza = createdItems[0];
  await prisma.order.create({
    data: {
      restaurantId: demoRestaurant.id,
      customerId: customer.id,
      // Random tail: orderNumber is unique per restaurant, so a re-seed with
      // a hardcoded number would P2002.
      orderNumber: `ORD-00${1000 + Math.floor(Math.random() * 9000)}`,
      status: "completed",
      type: "pickup",
      customerName: "Jane Smith",
      customerEmail: "jane@example.com",
      customerPhone: "(555) 987-6543",
      subtotal: 14.99,
      taxAmount: 1.33,
      total: 16.32,
      paymentMethod: "card",
      paymentStatus: "paid",
      completedAt: new Date(),
      items: {
        create: [{ menuItemId: firstPizza.id, name: firstPizza.name, price: firstPizza.price, quantity: 1, subtotal: firstPizza.price }],
      },
    },
  });
  console.log("✅ Created sample customer and order");

  console.log("\n🎉 Database seeded successfully!");
  console.log("\n📋 Login credentials:");
  console.log("   Superadmin:        admin@feefreeordering.com  /  admin123");
  console.log("   Restaurant Admin:  owner@pizzapalace.com      /  restaurant123");
  console.log("   Kitchen Staff:     kitchen@pizzapalace.com    /  kitchen123");
  console.log("\n🍕 Demo restaurant: http://localhost:3000/order/demo-pizza-palace");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
