/* DEV-only: seed a 3-slot meal bundle + a payment_reward promo on the demo
 * restaurant to verify the bundle step wizard + the whole-cart CTA. Idempotent. */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);

async function upsertByName(restaurantId: string, name: string, data: any) {
  const existing = await prisma.promotion.findFirst({ where: { restaurantId, name } });
  return existing
    ? prisma.promotion.update({ where: { id: existing.id }, data })
    : prisma.promotion.create({ data: { restaurantId, name, ...data } });
}

async function main() {
  if ((process.env.DATABASE_URL || "").includes("dawn-tree")) throw new Error("Refusing PROD");
  const r = await prisma.restaurant.findUnique({ where: { slug: "demo-pizza-palace" }, select: { id: true } });
  if (!r) throw new Error("no demo restaurant");
  const bundleCfg = {
    bundlePrice: 29.99,
    groups: [
      { id: "b1", label: "Pick a pizza", categoryIds: ["cmoofqlws000g9kvh9dyj20fz"], itemIds: [], minCount: 1, maxCount: 1 },
      { id: "b2", label: "Pick a pasta", categoryIds: ["cmoofqlws000h9kvhkk13k0fy"], itemIds: [], minCount: 1, maxCount: 1 },
      { id: "b3", label: "Pick a drink", categoryIds: ["cmoofqlws000j9kvhy2fk57wj"], itemIds: [], minCount: 1, maxCount: 1 },
    ],
  };
  const b = await upsertByName(r.id, "Family Meal Deal Test", {
    description: "Dev-only: bundle wizard verification",
    promotionType: "meal_bundle",
    isActive: true,
    autoApply: true,
    showOnBanner: true,
    displayMode: "menu_visible",
    rules: JSON.stringify(bundleCfg),
    ruleConfig: bundleCfg,
  });
  const payCfg = { discountPercent: 5, paymentMethod: "online_card", groups: [] };
  const p = await upsertByName(r.id, "5% Pay Online Test", {
    description: "Dev-only: payment_reward CTA verification",
    promotionType: "payment_reward",
    isActive: true,
    autoApply: true,
    showOnBanner: true,
    displayMode: "menu_visible",
    rules: JSON.stringify(payCfg),
    ruleConfig: payCfg,
  });
  console.log(`✓ bundle ${b.id} + payment_reward ${p.id} ready`);
}
main().finally(() => prisma.$disconnect());
