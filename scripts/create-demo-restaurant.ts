/**
 * Create a COMPLETE, ready-to-use demo restaurant + owner login so Google Play
 * (and App Store) reviewers can sign into the Kitchen Order App and test it.
 *
 * Mirrors the real signup (src/app/api/auth/register/route.ts): restaurant +
 * owner User (bcrypt, role restaurant_admin) + 7 opening-hours rows + free plan.
 * Difference from signup: the demo is LIVE out of the box — published, pickup on,
 * cash payment, open 24/7, email pre-verified, and a small ready menu — so a
 * reviewer can log in AND place a test order end-to-end.
 *
 * Password is passed as an ARG (never hard-coded / committed). Idempotent: if the
 * demo email already exists on the target DB it prints the creds and exits 0.
 *
 * Usage (DEV — current .env.local):
 *   npx tsx scripts/create-demo-restaurant.ts '<password>'
 * Usage (PROD — the DB the published app actually talks to):
 *   npx tsx scripts/run-on-prod.ts scripts/create-demo-restaurant.ts '<password>'
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaNeon } from "@prisma/adapter-neon";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

const NAME = "Fee Free Demo Restaurant";
const EMAIL = "demo@feefreeordering.com";
const OWNER = "Demo Owner";
const COUNTRY = "CA";
const TIMEZONE = "America/Toronto"; // CA default (regions.ts)
const CURRENCY = "cad";
const LANGUAGE = "en";

const password = process.argv[2];
const url = process.env.DATABASE_URL;
if (!password) {
  console.error("Usage: npx tsx scripts/create-demo-restaurant.ts '<password>'");
  process.exit(1);
}
if (!url) {
  console.error("No DATABASE_URL in env (.env.local / .env).");
  process.exit(1);
}

// Plain local slugify (avoid importing src/lib which uses @/ path aliases).
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const MENU: Array<{ category: string; items: Array<[string, number, string]> }> = [
  { category: "Pizzas", items: [
    ["Margherita Pizza", 12.99, "San Marzano tomato, fior di latte, fresh basil"],
    ["Pepperoni Pizza", 14.99, "Mozzarella, spicy pepperoni, tomato"],
    ["Quattro Formaggi", 15.99, "Mozzarella, gorgonzola, fontina, parmigiano"],
  ]},
  { category: "Pasta", items: [
    ["Spaghetti Bolognese", 13.99, "Slow-cooked beef & pork ragù"],
    ["Penne Arrabbiata", 12.49, "Garlic, chili, tomato, parsley"],
  ]},
  { category: "Drinks", items: [
    ["Coca-Cola", 2.49, "330ml can"],
    ["Sparkling Water", 1.99, "500ml bottle"],
  ]},
];

async function main() {
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url!);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url! }) : new PrismaPg({ connectionString: url! });
  const prisma = new PrismaClient({ adapter } as any);
  console.log(`DB: ${url!.replace(/:[^:@]+@/, ":***@")}  (${isNeon ? "Neon" : "Pg"})`);

  const existing = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true, restaurantId: true } });
  if (existing) {
    const r = existing.restaurantId
      ? await prisma.restaurant.findUnique({ where: { id: existing.restaurantId }, select: { slug: true } })
      : null;
    console.log(`\nℹ️  Demo account already exists on this DB — nothing to do.`);
    console.log(`   Email: ${EMAIL}   (slug: ${r?.slug ?? "?"})`);
    await prisma.$disconnect();
    return;
  }

  // Unique slug
  let slug = slugify(NAME);
  let n = 1;
  while (await prisma.restaurant.findUnique({ where: { slug } })) slug = `${slugify(NAME)}-${n++}`;

  const freePlan = await prisma.subscriptionPlan.findUnique({ where: { slug: "free" } }).catch(() => null);
  const now = new Date();

  const restaurant = await prisma.restaurant.create({
    data: {
      name: NAME, slug, subdomain: slug,
      phone: "+1 555 010 0001", email: EMAIL,
      address: "100 Demo Street", city: "Toronto", state: "ON", zip: "M5V 2T6", country: COUNTRY,
      timezone: TIMEZONE, currency: CURRENCY, defaultLanguage: LANGUAGE,
      cuisineType: "Italian", slogan: "A demo restaurant for app review",
      // LIVE out of the box (unlike real signup, which forces owner setup):
      acceptsPickup: true, acceptsDelivery: false, acceptsDineIn: false, acceptsReservations: false,
      paymentMethods: JSON.stringify(["cash"]),
      subscriptionStatus: "free", subscriptionPlanId: freePlan?.id || null,
      publishedAt: now, ownerEmailVerifiedAt: now,
    },
  });
  console.log(`✅ Restaurant ${restaurant.id}  slug=${slug}`);

  // Open every day, all day, so it's always "open" for a reviewer.
  for (let d = 0; d < 7; d++) {
    await prisma.openingHours.create({
      data: { restaurantId: restaurant.id, dayOfWeek: d, isOpen: true, openTime: "00:00", closeTime: "23:59" },
    });
  }
  console.log(`✅ Opening hours (open 24/7)`);

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: {
      email: EMAIL, name: OWNER, passwordHash, role: "restaurant_admin",
      restaurantId: restaurant.id, emailVerifiedAt: now,
      emailVerifyToken: crypto.randomBytes(32).toString("base64url"),
    },
  });
  console.log(`✅ Owner login ${EMAIL}`);

  let catSort = 0;
  for (const grp of MENU) {
    const cat = await prisma.menuCategory.create({
      data: { restaurantId: restaurant.id, name: grp.category, isActive: true, sortOrder: catSort++ },
    });
    let itemSort = 0;
    for (const [iname, price, desc] of grp.items) {
      await prisma.menuItem.create({
        data: {
          restaurantId: restaurant.id, categoryId: cat.id, name: iname, description: desc,
          price, isAvailable: true, isFeatured: itemSort === 0, forPickup: true, forDelivery: false,
          sortOrder: itemSort++,
        },
      });
    }
  }
  console.log(`✅ Menu (${MENU.length} categories, ${MENU.reduce((s, g) => s + g.items.length, 0)} items)`);

  console.log(`\n🎉 Demo restaurant ready.`);
  console.log(`   Login email:    ${EMAIL}`);
  console.log(`   Kitchen login:  https://feefreeordering.com/kitchen/login`);
  console.log(`   Ordering page:  https://feefreeordering.com/order/${slug}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
