import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) } as any);
  const r = await prisma.restaurant.findFirst({ where: { slug: "demo-pizza-palace" }, select: { id: true, acceptsPickup: true } });
  const item = await prisma.menuItem.findFirst({
    where: { restaurantId: r!.id, isSoldOut: false, hasVariants: false },
    select: { id: true, name: true, price: true },
  });
  console.log(JSON.stringify({ restaurant: r, item }));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
