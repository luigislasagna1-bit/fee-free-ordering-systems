/**
 * DEV-ONLY: stage Fabrizio's exclusive-stacking repro (TODO 🔴 2026-07-08) —
 * flips an existing meal-bundle promo to stackingRule=EXCLUSIVE and upserts a
 * STANDARD auto-apply "20% TAKEAWAY TEST" with a €10-style minimum, so the
 * committed-exclusive block + nudge suppression can be verified end-to-end.
 * Refuses to run against PROD (same guard as the other _seed scripts).
 *   npx tsx scripts/_seed-exclusive-stacking-test.ts [slug]
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

  // 1. An existing composable meal-bundle promo → force EXCLUSIVE + active.
  const bundle = await prisma.promotion.findFirst({
    where: { restaurantId: restaurant.id, promotionType: { in: ["meal_bundle", "meal_bundle_speciality"] } },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, stackingRule: true, isActive: true },
  });
  if (!bundle) throw new Error("no meal_bundle promo on this restaurant — compose one in admin first");
  await prisma.promotion.update({
    where: { id: bundle.id },
    data: { isActive: true, stackingRule: "exclusive", startsAt: null, endsAt: null },
  });

  // 2. STANDARD auto-apply 20% with a minimum → the ASPORTO stand-in.
  const existing = await prisma.promotion.findFirst({
    where: { restaurantId: restaurant.id, name: "20% TAKEAWAY TEST" },
    select: { id: true },
  });
  const stdData = {
    restaurantId: restaurant.id,
    name: "20% TAKEAWAY TEST",
    description: "Stacking-test stand-in for Fabrizio's 20% ASPORTO",
    promotionType: "percentage_off",
    isActive: true,
    stackingRule: "standard",
    orderType: "both",
    customerType: "any",
    minimumOrder: 10,
    autoApply: true,
    couponCode: null,
    displayMode: "menu_visible",
    showOnBanner: true,
    // "Add $X more to unlock" nudge fires within $10 of the minimum —
    // reproduces Fabrizio's "€10 more" symptom surface.
    highlightThreshold: 10,
    ruleConfig: { discountPercent: 20 },
    rules: "{}",
  } as any;
  const std = existing
    ? await prisma.promotion.update({ where: { id: existing.id }, data: stdData, select: { id: true } })
    : await prisma.promotion.create({ data: stdData, select: { id: true } });

  console.log(`✓ ${restaurant.name}`);
  console.log(`  EXCLUSIVE bundle: "${bundle.name}" (${bundle.id}) — was stackingRule=${bundle.stackingRule}, active=${bundle.isActive}`);
  console.log(`  STANDARD 20% min-$10 auto-apply: ${std.id}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
