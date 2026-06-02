/**
 * Seed N random test orders for a given customer email + a SPECIFIC
 * restaurant so reports / customer-detail / "Order again" rails have
 * realistic data to scroll through. Distributes orders across the past
 * 12 months with weighted randomness toward more-recent months
 * (matches real-life ramp).
 *
 * IMPORTANT — the --restaurant flag is REQUIRED.
 *
 * The Customer table is per-restaurant: the same email can have a
 * Customer row under multiple restaurants (a customer who ordered
 * from > 1 shop). Earlier versions of this script matched on email
 * alone, which silently fanned orders out across every restaurant
 * that email had ever touched. We hit that bug on prod (2026-06-01:
 * 503 [TEST] orders landed on Luigi's instead of staying on
 * Ristorante Test). The required slug eliminates the footgun.
 *
 * Each fake order:
 *   - picks 1–4 random menu items (with variant + 0–2 modifier options)
 *     from the target restaurant's menu
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
 *   npx tsx scripts/seed-test-orders.ts \
 *     --email <email> --restaurant <slug> [--count N] [--db-url <url>]
 *
 * Examples:
 *   npx tsx scripts/seed-test-orders.ts \
 *     --email fabrx900@gmail.com --restaurant ristorante-test --count 1000
 *
 *   npx tsx scripts/seed-test-orders.ts \
 *     --email fabrx900@gmail.com --restaurant ristorante-test --count 1000 \
 *     --db-url "postgresql://...dawn-tree..."
 */
import { config as dotenvConfig } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// ── Flag parser (no third-party dep) ──────────────────────────────────
function getFlag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const email = getFlag("email");
const restaurantSlug = getFlag("restaurant");
const count = parseInt(getFlag("count") ?? "1000", 10);
const explicitUrl = getFlag("db-url");

if (!email || !restaurantSlug) {
  console.error(
    "Usage: npx tsx scripts/seed-test-orders.ts \\\n" +
      "  --email <email> --restaurant <slug> [--count N] [--db-url <url>]\n\n" +
      "Both --email and --restaurant are required. The script will only\n" +
      "seed orders for the Customer row attached to THAT restaurant — it\n" +
      "will never fan out across multiple restaurants the email might\n" +
      "have ordered from.",
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
  console.log(`Database:   ${masked}`);
  console.log(`Email:      ${email}`);
  console.log(`Restaurant: ${restaurantSlug}`);
  console.log(`Count:      ${count}`);
  console.log("");

  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  // ── 1. Resolve the restaurant FIRST ─────────────────────────────────
  // We look up by slug because the slug is the human-readable handle
  // the script is invoked with. If the slug doesn't exist we hard-fail
  // — never fall back to "any matching restaurant" — that's how the
  // earlier version sprayed orders across both Luigi's and Ristorante
  // Test (Luigi 2026-06-01).
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug: restaurantSlug },
    select: { id: true, name: true, slug: true },
  });
  if (!restaurant) {
    console.error(
      `❌ No restaurant found with slug="${restaurantSlug}".\n` +
        `   Check the spelling, or list restaurants:\n` +
        `   npx tsx scripts/check-restaurants.ts`,
    );
    await prisma.$disconnect();
    process.exit(1);
  }
  console.log(
    `Target restaurant: ${restaurant.name} (id=${restaurant.id})`,
  );
  console.log("");

  // ── 2. Find the customer row scoped to THIS restaurant ─────────────
  // findMany not findUnique because the (restaurantId, email) tuple
  // can have duplicates in legacy data. We take exactly the first
  // row on this restaurant and ignore Customer rows on any other
  // restaurant the email might also belong to.
  const customerCandidates = await prisma.customer.findMany({
    where: {
      restaurantId: restaurant.id,
      email: { equals: email, mode: "insensitive" },
    },
    select: {
      id: true,
      name: true,
      phone: true,
      address: true,
      restaurantId: true,
    },
    take: 1,
  });
  const customer = customerCandidates[0];

  if (!customer) {
    console.error(
      `❌ No Customer row found on restaurant "${restaurant.slug}" for email=${email}.\n` +
        `   The email must have placed an order on (or been added as a customer to) this\n` +
        `   specific restaurant first — the Customer table is per-restaurant.`,
    );
    await prisma.$disconnect();
    process.exit(1);
  }
  console.log(
    `Scoped customer: ${customer.name} (id=${customer.id})`,
  );
  console.log("");

  // ── 3. Pre-load this restaurant's menu so we can pick fast ─────────
  const menuItems = await prisma.menuItem.findMany({
    where: { restaurantId: restaurant.id, isHidden: false },
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
    where: { restaurantId: restaurant.id, isActive: true },
    select: { id: true },
  });
  console.log(
    `Loaded ${menuItems.length} menu items, deliveryZoneId=${zone?.id ?? "(none)"}`,
  );
  console.log("");

  if (menuItems.length === 0) {
    console.error(
      `❌ Restaurant "${restaurant.slug}" has no menu items to seed orders against.`,
    );
    await prisma.$disconnect();
    process.exit(1);
  }

  // Single-target shape that the inner loop already understands.
  // (Holdover from the previous multi-target shape so the loop didn't
  // need to be rewritten end-to-end.)
  const menusByRestaurant = new Map<string, {
    items: typeof menuItems;
    deliveryZoneId: string | null;
  }>([
    [restaurant.id, { items: menuItems, deliveryZoneId: zone?.id ?? null }],
  ]);
  const seedTargets = [
    { ...customer, restaurant: { name: restaurant.name, slug: restaurant.slug } },
  ];

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
