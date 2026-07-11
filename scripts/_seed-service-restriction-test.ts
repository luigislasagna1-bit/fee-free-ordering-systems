/**
 * DEV-ONLY: seed the demo restaurant with every service-restriction state the
 * Fabrizio fixes must handle, so the customer page + admin can be verified in
 * the browser. Refuses to run against PROD (same guard as _seed-comp-addon).
 *   npx tsx scripts/_seed-service-restriction-test.ts [slug] [label|hide]
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const slug = process.argv[2] || "demo-pizza-palace";
  const displayMode = process.argv[3] === "hide" ? "hide" : "label";
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("no DATABASE_URL");
  try {
    const envLocal = readFileSync(".env.local", "utf8");
    const m = envLocal.match(/^\s*#\s*DATABASE_URL\s*=\s*"([^"]+)"/m);
    if (m && url === m[1]) throw new Error("REFUSING to run: active DATABASE_URL is the PROD database.");
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("REFUSING")) throw e;
  }

  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: { id: true, name: true, themeSettings: true },
  });
  if (!restaurant) throw new Error(`restaurant ${slug} not found`);

  // Force the label display mode (or hide for the second pass).
  let theme: Record<string, unknown> = {};
  try { theme = restaurant.themeSettings ? JSON.parse(restaurant.themeSettings as string) : {}; } catch {}
  theme.serviceRestrictedDisplay = displayMode;
  await prisma.restaurant.update({ where: { id: restaurant.id }, data: { themeSettings: JSON.stringify(theme) } });

  // Scope to the ACTIVE menu — the demo has duplicate category names across
  // menu versions and only the active menu renders on the order page.
  const activeMenu = await prisma.menu.findFirst({
    where: { restaurantId: restaurant.id, isActive: true },
    select: { id: true },
    orderBy: { updatedAt: "desc" },
  });
  const cats = await prisma.menuCategory.findMany({
    where: { restaurantId: restaurant.id, isHidden: false, ...(activeMenu ? { menuId: activeMenu.id } : {}) },
    orderBy: { sortOrder: "asc" },
    take: 4,
    select: { id: true, name: true, menuItems: { take: 2, select: { id: true, name: true } } },
  });
  if (cats.length < 4) throw new Error(`need 4 visible categories, found ${cats.length}`);

  // cat[0]: PICKUP-ONLY + TWO fulfil windows; first item also pickup-only
  // (duplicate-suppression: the item pill must NOT repeat the header's).
  await prisma.menuCategory.update({
    where: { id: cats[0].id },
    data: {
      forPickup: true, forDelivery: false,
      fulfilDays: JSON.stringify([1, 2, 3]), fulfilFrom: "10:00", fulfilTo: "15:00",
      fulfilWindows: [
        { days: [1, 2, 3], from: "10:00", to: "15:00" },
        { days: [5, 6], from: "15:00", to: "20:00" },
      ],
    },
  });
  if (cats[0].menuItems[0]) {
    await prisma.menuItem.update({ where: { id: cats[0].menuItems[0].id }, data: { forPickup: true, forDelivery: false } });
  }

  // cat[1]: DELIVERY-ONLY.
  await prisma.menuCategory.update({ where: { id: cats[1].id }, data: { forPickup: false, forDelivery: true } });

  // cat[2]: unrestricted; its first item PICKUP-ONLY (informational item pill).
  await prisma.menuCategory.update({ where: { id: cats[2].id }, data: { forPickup: true, forDelivery: true } });
  if (cats[2].menuItems[0]) {
    await prisma.menuItem.update({ where: { id: cats[2].menuItems[0].id }, data: { forPickup: true, forDelivery: false } });
  }

  // cat[3]: legacy BOTH-FALSE + a both-false item — must render NO pill and be
  // fully orderable under both services after the fix.
  await prisma.menuCategory.update({ where: { id: cats[3].id }, data: { forPickup: false, forDelivery: false } });
  if (cats[3].menuItems[0]) {
    await prisma.menuItem.update({ where: { id: cats[3].menuItems[0].id }, data: { forPickup: false, forDelivery: false } });
  }

  console.log(`✓ ${restaurant.name} seeded (display mode: ${displayMode})`);
  console.log(`  PICKUP-ONLY + 2 windows: "${cats[0].name}" (item: ${cats[0].menuItems[0]?.name ?? "-"} also pickup-only)`);
  console.log(`  DELIVERY-ONLY:           "${cats[1].name}"`);
  console.log(`  UNRESTRICTED:            "${cats[2].name}" (item: ${cats[2].menuItems[0]?.name ?? "-"} pickup-only)`);
  console.log(`  LEGACY BOTH-FALSE:       "${cats[3].name}" (item: ${cats[3].menuItems[0]?.name ?? "-"} both-false)`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
