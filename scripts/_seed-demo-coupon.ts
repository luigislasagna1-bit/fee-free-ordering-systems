/* DEV-only: seed a hidden coupon-code promo (TEST1, 10% off) on the demo
 * restaurant to verify the checkout Apply button fix. Idempotent by name. */
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
  const cfg = { discountPercent: 10, groups: [] };
  const existing = await prisma.promotion.findFirst({ where: { restaurantId: r.id, name: "TEST1 Coupon Check" } });
  const data = {
    restaurantId: r.id,
    name: "TEST1 Coupon Check",
    description: "Dev-only: checkout Apply button verification",
    promotionType: "percentage_off",
    isActive: true,
    autoApply: false,
    couponCode: "TEST1",
    displayMode: "hidden_coupon_only",
    showOnBanner: false,
    rules: JSON.stringify(cfg),
    ruleConfig: cfg,
  };
  const p = existing
    ? await prisma.promotion.update({ where: { id: existing.id }, data })
    : await prisma.promotion.create({ data });
  console.log(`✓ coupon promo ${p.id} ready (code TEST1)`);
}
main().finally(() => prisma.$disconnect());
