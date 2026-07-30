/**
 * READ-ONLY: fetch Luigi's restaurant slug + one visible menu item (id, name,
 * price) from PROD so the apply-promos preview proof can build a realistic cart.
 * Prod URL from the commented line in .env.local (never printed).
 * Run: npx tsx <this file>  (cwd = repo root)
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const envText = readFileSync(".env.local", "utf8");
const m = envText.match(/^#\s*DATABASE_URL="(postgresql:\/\/[^"]*ep-dawn-tree[^"]*)"/m);
if (!m) throw new Error("Prod URL line not found");

async function main() {
  const p = new PrismaClient({ adapter: new PrismaNeon({ connectionString: m![1] }) } as any);
  const promo = await p.promotion.findFirst({
    where: { campaignRef: "kickstarter_first_buy", isActive: true },
    select: { restaurantId: true, ruleConfig: true, promotionType: true },
  });
  if (!promo) throw new Error("No active FIRSTBUY promo on prod");
  const r = await p.restaurant.findUnique({
    where: { id: promo.restaurantId },
    select: { slug: true, name: true, currency: true },
  });
  const item = await p.menuItem.findFirst({
    where: { restaurantId: promo.restaurantId, isAvailable: true, price: { gt: 5 } },
    orderBy: { price: "asc" },
    select: { id: true, name: true, price: true, categoryId: true },
  });
  console.log(JSON.stringify({ restaurant: r, ruleConfig: promo.ruleConfig, type: promo.promotionType, item }, null, 2));
  await p.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
