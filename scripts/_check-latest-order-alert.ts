import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) } as any);
  const r = await prisma.restaurant.findFirst({
    where: { slug: "luigis-lasagna-pizzeria" },
    select: { id: true, name: true, timezone: true },
  });
  const orders = await prisma.order.findMany({
    where: { restaurantId: r!.id },
    orderBy: { createdAt: "desc" },
    take: 3,
    select: {
      orderNumber: true, status: true, type: true, paymentMethod: true,
      createdAt: true, scheduledFor: true,
      alertAt: true, notifiedAt: true,
    } as any,
  });
  console.log(`now=${new Date().toISOString()} tz=${r!.timezone}`);
  console.log(JSON.stringify(orders, null, 1));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
