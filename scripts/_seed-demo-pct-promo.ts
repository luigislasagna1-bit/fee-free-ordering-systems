/* DEV-only: seed a percentage_off promo WITH item groups on the demo restaurant
 * so the promo "Get it Now" screen renders eligible-item rows (steppers +
 * category grouping). Idempotent by name. */
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
    discountPercent: 20,
    groups: [{
      id: "g1_steppertest",
      label: "",
      categoryIds: [
        "cmoofqlws000g9kvh9dyj20fz", // Pizzas (requiresChoice → Customize)
        "cmoofqlws000h9kvhkk13k0fy", // Pasta (simple → stepper)
        "cmoofqlws000i9kvhwu0j7q15", // Salads (simple → stepper)
      ],
      itemIds: [],
    }],
  };
  const rules = JSON.stringify(cfg);
  const existing = await prisma.promotion.findFirst({ where: { restaurantId: r.id, name: "20% Stepper Test" } });
  const data = {
    restaurantId: r.id,
    name: "20% Stepper Test",
    description: "Dev-only: verifies promo-screen qty steppers",
    promotionType: "percentage_off",
    isActive: true,
    showOnBanner: true,
    displayMode: "menu_visible",
    rules,
    ruleConfig: cfg, // the modal prefers this JSON column over the legacy string
  };
  const p = existing
    ? await prisma.promotion.update({ where: { id: existing.id }, data })
    : await prisma.promotion.create({ data });
  console.log(`✓ promo ${p.id} ready`);
}
main().finally(() => prisma.$disconnect());
