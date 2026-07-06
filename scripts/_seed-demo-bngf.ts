/* DEV-only: replica of Luigi's "Buy 3 Pastas, get 1 PIZZA FREE" promo
 * (paid Pasta min3/max3 + free Pizzas, strategy cheapest). Idempotent. */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);

async function main() {
  if ((process.env.DATABASE_URL || "").includes("dawn-tree")) throw new Error("Refusing PROD");
  const r = await prisma.restaurant.findUnique({ where: { slug: "demo-pizza-palace" }, select: { id: true } });
  if (!r) throw new Error("no demo restaurant");
  const cfg = {
    discountStrategy: "cheapest",
    cheapestDiscount: 100,
    groups: [
      { id: "g1", role: "paid", label: "", categoryIds: ["cmoofqlws000h9kvhkk13k0fy"], itemIds: [], minCount: 3, maxCount: 3 },
      { id: "g2", role: "free", label: "", categoryIds: ["cmoofqlws000g9kvh9dyj20fz"], itemIds: [] },
    ],
  };
  const existing = await prisma.promotion.findFirst({ where: { restaurantId: r.id, name: "Buy 3 Pastas get 1 Pizza FREE Test" } });
  const data = {
    restaurantId: r.id,
    name: "Buy 3 Pastas get 1 Pizza FREE Test",
    description: "Dev-only: bngf multi-pick + chosen-freebie verification",
    promotionType: "buy_n_get_free",
    isActive: true,
    autoApply: true,
    showOnBanner: true,
    displayMode: "menu_visible",
    rules: JSON.stringify(cfg),
    ruleConfig: cfg,
  };
  const p = existing
    ? await prisma.promotion.update({ where: { id: existing.id }, data })
    : await prisma.promotion.create({ data });
  console.log(`✓ bngf promo ${p.id} ready`);
}
main().finally(() => prisma.$disconnect());
