import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) } as any);
  const r = await prisma.restaurant.findFirst({ where: { slug: "demo-pizza-palace" }, select: { id: true } });
  const cfg = await prisma.shipdayConfig.findUnique({ where: { restaurantId: r!.id } });
  console.log(JSON.stringify({ enabled: cfg?.enabled, deliverySource: cfg?.deliverySource, hasKey: !!cfg?.apiKeyEnc, activeDispatchMode: cfg?.activeDispatchMode }, null, 1));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
