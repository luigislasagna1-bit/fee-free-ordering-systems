/**
 * Seed N random test orders for a given customer email so reports /
 * customer-detail / "Order again" rails have realistic data to scroll
 * through. Distributes orders across the past 12 months with weighted
 * randomness toward more-recent months (matches real-life ramp).
 *
 * Each fake order:
 *   - picks 1–4 random menu items (with variant + 0–2 modifier options)
 *     from the customer's restaurant
 *   - chooses type (pickup / delivery / dine_in / take_out) weighted to
 *     match a typical mix
 *   - chooses status (completed mostly, some cancelled / rejected /
 *     pending so the dashboard shows variety)
 *   - chooses paymentMethod (cash / card / paypal weighted)
 *   - computes subtotal / tax (13% HST) / delivery fee / tip / total
 *   - picks createdAt in the last 12 months, weighted recent-heavy
 *   - timestamps acceptedAt / completedAt / rejectedAt to match status
 *
 * Marked customerName="[TEST] …" so the kitchen display badges them
 * as TEST and our reports filter / delete script can find them later.
 *
 * Usage:
 *   npx tsx scripts/seed-test-orders.ts <email> [count] [db-url]
 *
 * Examples:
 *   npx tsx scripts/seed-test-orders.ts fabrx900@gmail.com 1000
 *   npx tsx scripts/seed-test-orders.ts fabrx900@gmail.com 1000 \
 *     "postgresql://...purple-brook..."
 */
import { config as dotenvConfig } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const email = process.argv[2];
const count = parseInt(process.argv[3] ?? "1000", 10);
const explicitUrl = process.argv[4];

if (!email) {
  console.error(
    "Usage: npx tsx scripts/seed-test-orders.ts <email> [count] [db-url]",
  );
  process.exit(1);
}
if (!explicitUrl) {
  dotenvConfig({ path: ".env.local" });
  dotenvConfig({ path: ".env" });
}

// ── Helpers ───────────────────────────────────────────────────────────
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;
const weightedPick = <T,>(opts: { value: T; weight: number }[]): T => {
  const total = opts.reduce((s, o) => s + o.weight, 0);
  let r = Math.random() * total;
  for (const o of opts) {
    if ((r -= o.weight) < 0) return o.value;
  }
  return opts[opts.length - 1].value;
};

// recency-weighted timestamp inside the last 12 months
function pickRandomCreatedAt(): Date {
  const now = Date.now();
  const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;
  // square the uniform random — biases toward recent (=1) end
  const r = 1 - Math.pow(Math.random(), 2);
  return new Date(oneYearAgo + r * (now - oneYearAgo));
}

// pickup / delivery / dine-in / take-out distribution
const TYPE_DIST = [
  { value: "pickup", weight: 50 },
  { value: "delivery", weight: 35 },
  { value: "dine_in", weight: 8 },
  { value: "take_out", weight: 7 },
];

// status distribution — most completed, some non-happy-path
const STATUS_DIST = [
  { value: "completed", weight: 78 },
  { value: "accepted", weight: 6 },
  { value: "preparing", weight: 3 },
  { value: "ready", weight: 2 },
  { value: "pending", weight: 2 },
  { value: "cancelled", weight: 5 },
  { value: "rejected", weight: 4 },
];

const PAYMENT_DIST = [
  { value: "card", weight: 60 },
  { value: "cash", weight: 28 },
  { value: "paypal", weight: 12 },
];

const CHANNEL_DIST = [
  { value: "direct", weight: 55 },
  { value: "marketplace", weight: 20 },
  { value: "organic", weight: 8 },
  { value: "social_media", weight: 7 },
  { value: "paid_ads", weight: 5 },
  { value: "email", weight: 3 },
  { value: "referral", weight: 2 },
];

const FAKE_ADDRESSES = [
  { addr: "12 Maple St", city: "Milton", zip: "L9T1A1" },
  { addr: "247 Oak Ave", city: "Milton", zip: "L9T2B3" },
  { addr: "88 Cedar Cres", city: "Milton", zip: "L9T3C4" },
  { addr: "501 Pine Rd", city: "Milton", zip: "L9T4D5" },
  { addr: "33 Birch Blvd", city: "Oakville", zip: "L6H1E6" },
  { addr: "156 Elm Way", city: "Mississauga", zip: "L5M2F7" },
];

const REJECTION_REASONS = [
  "Out of stock",
  "Kitchen too busy",
  "Closing soon",
  "Cannot fulfil dietary request",
  "Unable to verify address",
];

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  const url = explicitUrl ?? process.env.DATABASE_URL;
  if (!url) {
    console.error("No DATABASE_URL");
    process.exit(1);
  }
  const masked = url.replace(/:[^:@]+@/, ":****@");
  console.log(`Database: ${masked}`);
  console.log(`Email:    ${email}`);
  console.log(`Count:    ${count}`);
  console.log("");

  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  // ── 1. Find the customer row(s) for this email ──────────────────────
  const customers = await prisma.customer.findMany({
    where: { email: { equals: email, mode: "insensitive" } },
    select: {
      id: true,
      name: true,
      phone: true,
      address: true,
      restaurantId: true,
      restaurant: { select: { name: true, slug: true } },
    },
  });

  if (customers.length === 0) {
    console.error(`❌ No Customer row found with email=${email}.`);
    console.error(
      "   The customer must have ordered (or been added) to at least one restaurant first.",
    );
    await prisma.$disconnect();
    process.exit(1);
  }

  // Pick the first customer row (usually only one). If they're attached
  // to multiple restaurants, we spread orders across all of them.
  console.log(`Found ${customers.length} Customer row(s):`);
  for (const c of customers) {
    console.log(`  - ${c.restaurant.name} (${c.restaurant.slug}) → id=${c.id}`);
  }
  console.log("");

  // ── 2. Pre-load menu items per restaurant so we can pick fast ──────
  type MenuLoad = {
    items: {
      id: string;
      name: string;
      price: number;
      variants: { id: string; name: string; price: number }[];
      modifierGroups: {
        id: string;
        name: string;
        options: { id: string; name: string; priceAdjustment: number }[];
      }[];
    }[];
    deliveryZoneId: string | null;
  };
  const menusByRestaurant = new Map<string, MenuLoad>();
  for (const c of customers) {
    const items = await prisma.menuItem.findMany({
      where: { restaurantId: c.restaurantId, isHidden: false },
      select: {
        id: true,
        name: true,
        price: true,
        variants: { select: { id: true, name: true, price: true } },
        modifierGroups: {
          select: {
            id: true,
            name: true,
            options: {
              select: { id: true, name: true, priceAdjustment: true },
            },
          },
        },
      },
    });
    const zone = await prisma.deliveryZone.findFirst({
      where: { restaurantId: c.restaurantId, isActive: true },
      select: { id: true },
    });
    menusByRestaurant.set(c.restaurantId, {
      items,
      deliveryZoneId: zone?.id ?? null,
    });
    console.log(
      `  Loaded ${items.length} menu items for restaurant ${c.restaurant.name}`,
    );
  }
  console.log("");

  // Filter out restaurants with no usable menu items.
  const seedTargets = customers.filter(
    (c) => (menusByRestaurant.get(c.restaurantId)?.items.length ?? 0) > 0,
  );
  if (seedTargets.length === 0) {
    console.error(
      "❌ None of the restaurants for this customer have any menu items.",
    );
    await prisma.$disconnect();
    process.exit(1);
  }

  // ── 3. Build the orders ─────────────────────────────────────────────
  let inserted = 0;
  let skipped = 0;
  const startedAt = Date.now();
  const BATCH = 25;

  for (let batchStart = 0; batchStart < count; batchStart += BATCH) {
    const batchSize = Math.min(BATCH, count - batchStart);
    const writes: Promise<unknown>[] = [];

    for (let i = 0; i < batchSize; i++) {
      const orderIndex = batchStart + i;
      const customer = pick(seedTargets);
      const menu = menusByRestaurant.get(customer.restaurantId)!;

      const type = weightedPick(TYPE_DIST);
      const status = weightedPick(STATUS_DIST);
      const paymentMethod = weightedPick(PAYMENT_DIST);
      const channel = weightedPick(CHANNEL_DIST);
      const createdAt = pickRandomCreatedAt();

      // 1–4 line items
      const lineCount = randInt(1, 4);
      const lineSpecs: {
        item: (typeof menu.items)[0];
        variant: { id: string; name: string; price: number } | null;
        modifiers: { id: string; name: string; priceAdjustment: number }[];
        qty: number;
      }[] = [];
      for (let k = 0; k < lineCount; k++) {
        const item = pick(menu.items);
        const variant = item.variants.length > 0 ? pick(item.variants) : null;
        // 0–2 modifier options across all groups
        const modCount = randInt(0, 2);
        const modifiers: { id: string; name: string; priceAdjustment: number }[] = [];
        for (let m = 0; m < modCount; m++) {
          const group =
            item.modifierGroups.length > 0 ? pick(item.modifierGroups) : null;
          if (group && group.options.length > 0) {
            modifiers.push(pick(group.options));
          }
        }
        lineSpecs.push({ item, variant, modifiers, qty: randInt(1, 3) });
      }

      // Compute totals
      let subtotal = 0;
      for (const l of lineSpecs) {
        const base = l.variant ? l.variant.price : l.item.price;
        const modSum = l.modifiers.reduce((s, m) => s + m.priceAdjustment, 0);
        subtotal += (base + modSum) * l.qty;
      }
      // Round subtotal to 2 decimals
      subtotal = Math.round(subtotal * 100) / 100;
      const taxAmount = Math.round(subtotal * 0.13 * 100) / 100;
      const deliveryFee =
        type === "delivery" ? pick([3.99, 4.99, 5.99, 6.99]) : 0;
      const tip = ["completed", "accepted", "preparing", "ready"].includes(
        status,
      )
        ? Math.round(subtotal * (Math.random() * 0.2) * 100) / 100 // 0–20%
        : 0;
      const total =
        Math.round((subtotal + taxAmount + deliveryFee + tip) * 100) / 100;

      // Status-dependent timestamps
      const acceptedAt =
        status === "completed" ||
        status === "accepted" ||
        status === "preparing" ||
        status === "ready"
          ? new Date(createdAt.getTime() + randInt(60, 600) * 1000)
          : null;
      const completedAt =
        status === "completed"
          ? new Date(createdAt.getTime() + randInt(900, 3600) * 1000)
          : null;
      const rejectedAt =
        status === "rejected"
          ? new Date(createdAt.getTime() + randInt(30, 240) * 1000)
          : null;

      const address = type === "delivery" ? pick(FAKE_ADDRESSES) : null;

      // Most fake orders get notifiedAt set so they hit the kitchen
      // counters / reports — pending ones don't.
      const notifiedAt =
        status === "pending" ? null : new Date(createdAt.getTime() + 5000);

      // ── Create the order + items + modifiers in a single transaction
      const customerName = `[TEST] ${customer.name}`;
      const customerEmail = email;
      const customerPhone = customer.phone ?? "555-0100";
      const orderNumber = `TST-${Date.now().toString(36)}-${orderIndex
        .toString(36)
        .padStart(3, "0")}`;

      writes.push(
        prisma.order.create({
          data: {
            restaurantId: customer.restaurantId,
            customerId: customer.id,
            orderNumber,
            status,
            type,
            customerName,
            customerEmail,
            customerPhone,
            deliveryAddress: address?.addr ?? null,
            deliveryCity: address?.city ?? null,
            deliveryZip: address?.zip ?? null,
            subtotal,
            taxAmount,
            deliveryFee,
            tip,
            total,
            paymentMethod,
            paymentStatus:
              paymentMethod === "cash"
                ? status === "completed"
                  ? "paid"
                  : "pending"
                : status === "completed" ||
                    status === "accepted" ||
                    status === "preparing" ||
                    status === "ready"
                  ? "paid"
                  : status === "rejected" || status === "cancelled"
                    ? "refunded"
                    : "pending",
            channel,
            viaMarketplace: channel === "marketplace",
            createdAt,
            notifiedAt,
            acceptedAt,
            completedAt,
            rejectedAt,
            rejectionReason: status === "rejected" ? pick(REJECTION_REASONS) : null,
            deliveryZoneId: type === "delivery" ? menu.deliveryZoneId : null,
            items: {
              create: lineSpecs.map((l) => ({
                menuItemId: l.item.id,
                variantId: l.variant?.id ?? null,
                variantName: l.variant?.name ?? null,
                name: l.item.name,
                price: l.variant ? l.variant.price : l.item.price,
                quantity: l.qty,
                subtotal:
                  Math.round(
                    ((l.variant ? l.variant.price : l.item.price) +
                      l.modifiers.reduce((s, m) => s + m.priceAdjustment, 0)) *
                      l.qty *
                      100,
                  ) / 100,
                modifiers: {
                  create: l.modifiers.map((m) => ({
                    modifierOptionId: m.id,
                    name: m.name,
                    priceAdjustment: m.priceAdjustment,
                  })),
                },
              })),
            },
          },
          select: { id: true },
        }),
      );
    }

    const results = await Promise.allSettled(writes);
    for (const r of results) {
      if (r.status === "fulfilled") inserted++;
      else {
        skipped++;
        // Only log the first few errors so we don't flood the console.
        if (skipped <= 3) {
          console.warn(`  ! insert failed: ${(r.reason as Error).message}`);
        }
      }
    }
    if ((batchStart + batchSize) % 100 === 0 || batchStart + batchSize >= count) {
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.log(
        `  Progress: ${inserted}/${count} inserted (${skipped} skipped) — ${elapsed}s`,
      );
    }
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log("");
  console.log(`✅ Done. Inserted ${inserted} orders in ${elapsed}s.`);
  if (skipped > 0) console.log(`   ${skipped} insert(s) failed.`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
