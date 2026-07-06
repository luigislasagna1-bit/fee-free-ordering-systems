import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);
(async () => {
  const it: any = await prisma.menuItem.findUnique({
    where: { id: "cmoofqlxu000p9kvhu0ppa1pr" },
    select: { visibilityMode: true, visibleDays: true, visibleFrom: true, visibleTo: true, visibleWindows: true,
      fulfilDays: true, fulfilFrom: true, fulfilTo: true, fulfilWindows: true, pinnedToTop: true },
  });
  console.log(JSON.stringify(it));
  await prisma.$disconnect();
})();
