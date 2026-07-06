import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);
(async () => {
  const rest = await prisma.restaurant.findUnique({ where: { slug: "demo-pizza-palace" }, select: { id: true } });
  const promos = await prisma.promotion.findMany({
    where: { restaurantId: rest!.id, isActive: true, ruleConfig: { not: null } },
    select: { id: true, name: true, promotionType: true },
    orderBy: { createdAt: "desc" },
  });
  console.log(JSON.stringify(promos));
  await prisma.$disconnect();
})();
