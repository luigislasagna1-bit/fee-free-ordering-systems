import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);
(async () => {
  const item = await prisma.menuItem.findUnique({ where: { id: "cmoofqlxu000p9kvhu0ppa1pr" }, select: { categoryId: true } });
  const cat = await prisma.menuCategory.findUnique({
    where: { id: item!.categoryId },
    select: { name: true, visibilityMode: true, visibleWindows: true, isHidden: true, isActive: true,
      menuItems: { select: { name: true, isHidden: true, visibilityMode: true, isAvailable: true, isSoldOut: true } } },
  });
  console.log(JSON.stringify(cat, null, 1));
  await prisma.$disconnect();
})();
