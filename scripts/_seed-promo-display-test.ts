/**
 * DEV-ONLY: stage the promo-surface display states for report cmr80t9rk —
 * a SOLD-OUT dish and an item-level WINDOWED dish inside promo-eligible
 * categories, so the promo modal + bundle composer rows can be verified.
 * Refuses to run against PROD (same guard as the other _seed scripts).
 *   npx tsx scripts/_seed-promo-display-test.ts [slug]
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

  const restaurant = await prisma.restaurant.findUnique({ where: { slug }, select: { id: true, name: true } });
  if (!restaurant) throw new Error(`restaurant ${slug} not found`);
  const activeMenu = await prisma.menu.findFirst({ where: { restaurantId: restaurant.id, isActive: true }, select: { id: true }, orderBy: { updatedAt: "desc" } });

  const spaghetti = await prisma.menuItem.findFirst({
    where: { restaurantId: restaurant.id, name: { contains: "Spaghetti" }, ...(activeMenu ? { category: { menuId: activeMenu.id } } : {}) },
    select: { id: true, name: true },
  });
  const penne = await prisma.menuItem.findFirst({
    where: { restaurantId: restaurant.id, name: { contains: "Penne" }, ...(activeMenu ? { category: { menuId: activeMenu.id } } : {}) },
    select: { id: true, name: true },
  });
  if (spaghetti) await prisma.menuItem.update({ where: { id: spaghetti.id }, data: { isSoldOut: true } });
  if (penne) {
    await prisma.menuItem.update({
      where: { id: penne.id },
      data: {
        fulfilDays: JSON.stringify([1, 3, 5]),
        fulfilFrom: "10:00",
        fulfilTo: "20:00",
      },
    });
  }
  console.log(`✓ ${restaurant.name}: SOLD-OUT="${spaghetti?.name ?? "-"}", WINDOWED (Mon,Wed,Fri 10-20)="${penne?.name ?? "-"}"`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
