/** DEV utility: print 3 orderable demo-pizza-palace items for API tests. */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

(async () => {
  const p = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) } as any);
  const r = await p.restaurant.findUnique({ where: { slug: "demo-pizza-palace" }, select: { id: true } });
  const items = await p.menuItem.findMany({
    where: { restaurantId: r!.id, isAvailable: true, isSoldOut: false, price: { gt: 5 } },
    select: { id: true, name: true, price: true, categoryId: true },
    take: 3,
  });
  console.log(JSON.stringify(items, null, 1));
  await p.$disconnect();
})();
