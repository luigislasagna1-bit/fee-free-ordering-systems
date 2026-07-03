/* READ-ONLY: inspect stacking rules of Luigi's 50%/20OFF promos on prod. */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  try {
    const r = await prisma.restaurant.findUnique({ where: { slug: "luigis-lasagna-pizzeria" }, select: { id: true } });
    if (!r) { console.log("restaurant not found"); return; }
    const promos = await prisma.promotion.findMany({
      where: { restaurantId: r.id, isActive: true, OR: [{ name: { contains: "50" } }, { couponCode: "20OFF" }, { name: { contains: "20" } }] },
      select: { name: true, couponCode: true, stackingRule: true, promotionType: true, autoApply: true, displayMode: true },
    });
    for (const p of promos) console.log(JSON.stringify(p));
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
