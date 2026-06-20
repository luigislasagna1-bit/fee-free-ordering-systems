/**
 * Polish the existing demo restaurant (demo@feefreeordering.com) so it LOOKS
 * like a real, branded storefront for visitors who click "See a live storefront"
 * and for app-store reviewers — instead of an unstyled, image-less menu.
 *
 * What it sets (all cosmetic — never touches the login, services, or publish
 * state, so the Play/App Store reviewer flow keeps working):
 *   • themeSettings  — a warm Italian-pizzeria palette (tomato red + basil green
 *                      on cream), grid menu layout, large banner, category images
 *   • bannerUrl      — a restaurant hero photo
 *   • slogan         — a real one-liner
 *   • MenuCategory.imageUrl  — a photo per category
 *   • MenuItem.imageUrl      — a matching food photo per item
 *
 * Images are hot-linked Unsplash CDN URLs (all verified 200/image-jpeg). The
 * customer ordering page renders item/category images with a plain <img>, so no
 * next/image remotePatterns entry is needed.
 *
 * Idempotent — safe to re-run; it just re-sets the same values. Matches the
 * menu created by create-demo-restaurant.ts (by category/item name); any item
 * it doesn't recognise is skipped, never deleted.
 *
 * NOTE — the half/half PIZZA BUILDER is intentionally NOT scripted here. It
 * needs library modifier groups (crust/sauce/cheese/toppings) wired into the
 * item's pizzaConfig + attachments, which is exactly what the admin Menu →
 * Pizza Builder editor does with live validation. Enable it there on the
 * "Margherita Pizza" item (2 min) so it can be verified visually.
 *
 * Usage (PROD — the DB the live site + published apps talk to):
 *   npx tsx scripts/run-on-prod.ts scripts/polish-demo-restaurant.ts
 * Usage (local dev DB):
 *   npx tsx scripts/polish-demo-restaurant.ts
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaNeon } from "@prisma/adapter-neon";
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

const EMAIL = "demo@feefreeordering.com";
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("No DATABASE_URL in env (.env.local / .env).");
  process.exit(1);
}

const img = (id: string, w = 900) =>
  `https://images.unsplash.com/photo-${id}?w=${w}&q=80&auto=format&fit=crop`;

// All IDs verified live (200 image/jpeg) on 2026-06-20.
const BANNER = img("1517248135467-4c7edcad34c4", 1600); // restaurant interior

const CATEGORY_IMG: Record<string, string> = {
  Pizzas: img("1513104890138-7c749659a591"),
  Pasta: img("1551183053-bf91a1d81141"),
  Drinks: img("1554866585-cd94860890b7"),
};

const ITEM_IMG: Record<string, string> = {
  "Margherita Pizza": img("1513104890138-7c749659a591"),
  "Pepperoni Pizza": img("1628840042765-356cda07504e"),
  "Quattro Formaggi": img("1571407970349-bc81e7e96d47"),
  "Spaghetti Bolognese": img("1551183053-bf91a1d81141"),
  "Penne Arrabbiata": img("1612874742237-6526221588e3"),
  "Coca-Cola": img("1554866585-cd94860890b7"),
  "Sparkling Water": img("1437418747212-8d9709afab22"),
};

// parseTheme() merges over DEFAULT_THEME, so a partial object is fine — but we
// set a coherent, branded set so the storefront looks intentional.
const THEME = {
  primaryColor: "#C1272D", // rich tomato red
  accentColor: "#1E7A46", // basil green
  backgroundColor: "#FBF7F0", // warm cream
  cardBackground: "#FFFFFF",
  textColor: "#1F2330",
  bannerHeight: "lg",
  bannerOpacity: 45,
  bannerPosition: "center",
  headerLayout: "center",
  showCategoryImages: true,
  menuLayout: "grid",
  mobileCollapsibleCategories: false,
  reservationFullBg: false,
};

const SLOGAN = "Wood-fired pizza & fresh pasta — order direct, zero fees.";

async function main() {
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url!);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url! }) : new PrismaPg({ connectionString: url! });
  const prisma = new PrismaClient({ adapter } as any);
  console.log(`DB: ${url!.replace(/:[^:@]+@/, ":***@")}  (${isNeon ? "Neon" : "Pg"})`);

  const owner = await prisma.user.findUnique({ where: { email: EMAIL }, select: { restaurantId: true } });
  if (!owner?.restaurantId) {
    console.error(`\n❌ No demo restaurant for ${EMAIL} on this DB. Run create-demo-restaurant.ts first.`);
    await prisma.$disconnect();
    process.exit(1);
  }
  const restaurantId = owner.restaurantId;

  await prisma.restaurant.update({
    where: { id: restaurantId },
    data: { themeSettings: JSON.stringify(THEME), bannerUrl: BANNER, slogan: SLOGAN },
  });
  console.log(`✅ Theme + banner + slogan set`);

  const cats = await prisma.menuCategory.findMany({
    where: { restaurantId },
    select: { id: true, name: true, menuItems: { select: { id: true, name: true } } },
  });

  let catN = 0;
  let itemN = 0;
  for (const cat of cats) {
    const cImg = CATEGORY_IMG[cat.name];
    if (cImg) {
      await prisma.menuCategory.update({ where: { id: cat.id }, data: { imageUrl: cImg } });
      catN++;
    }
    for (const item of cat.menuItems) {
      const iImg = ITEM_IMG[item.name];
      if (iImg) {
        await prisma.menuItem.update({ where: { id: item.id }, data: { imageUrl: iImg } });
        itemN++;
      }
    }
  }
  console.log(`✅ Category images: ${catN}   Item images: ${itemN}`);

  const r = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { slug: true } });
  console.log(`\n🎉 Demo polished. View: https://feefreeordering.com/order/${r?.slug ?? "?"}`);
  console.log(`\n👉 Last step (admin UI, ~2 min): log in as ${EMAIL} → Menu → "Margherita Pizza"`);
  console.log(`   → Pizza Builder → add Crust / Sauce / Cheese / Toppings and turn ON Half & Half`);
  console.log(`   on the Toppings group, so customers can build a split pizza.`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
