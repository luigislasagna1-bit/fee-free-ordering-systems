/** Read-only: is the dilpreetsinging test signup still there and still reseller-attributed? */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  const users = await prisma.user.findMany({
    where: { email: { contains: "dilpreet", mode: "insensitive" } },
    select: { id: true, email: true, restaurantId: true },
  });
  console.log("users:", JSON.stringify(users));
  for (const u of users) {
    if (!u.restaurantId) continue;
    const r = await prisma.restaurant.findUnique({
      where: { id: u.restaurantId },
      select: { id: true, name: true, slug: true, resellerProfileId: true, createdAt: true,
        resellerProfile: { select: { companyName: true } } },
    });
    console.log("restaurant:", JSON.stringify(r));
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
