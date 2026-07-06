import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) } as any);
  const r = await prisma.restaurant.findFirst({
    where: { slug: "demo-pizza-palace" },
    select: { id: true, paymentMethods: true, paypalAccountStatus: true },
  });
  const provider = await prisma.paymentProvider.findUnique({
    where: { restaurantId: r!.id },
    select: { isActive: true, publishableKey: true },
  });
  console.log(JSON.stringify({
    paymentMethods: r?.paymentMethods,
    paypal: r?.paypalAccountStatus,
    providerActive: provider?.isActive,
    hasPubKey: !!provider?.publishableKey,
  }, null, 1));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
