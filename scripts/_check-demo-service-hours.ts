/** Dev-only: list demo restaurant per-service OpeningHours rows. */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) } as any);
  const r = await prisma.restaurant.findUnique({
    where: { slug: "demo-pizza-palace" },
    select: { openingHours: { where: { NOT: { service: null } }, select: { service: true, dayOfWeek: true, openTime: true, closeTime: true } } },
  });
  console.log("per-service rows:", JSON.stringify(r?.openingHours ?? [], null, 2));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
