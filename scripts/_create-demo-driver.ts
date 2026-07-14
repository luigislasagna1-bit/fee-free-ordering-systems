/**
 * DEV-ONLY: ensure a demo Driver exists for exercising the /driver PWA locally.
 *   npx tsx scripts/_create-demo-driver.ts
 * Prints the login credentials. homeRestaurant = demo-pizza-palace.
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

config({ path: ".env.local" });
config({ path: ".env" });

const EMAIL = "driver@demo.com";
const PASSWORD = "driver1234";

async function main() {
  const url = process.env.DATABASE_URL!;
  if (/dawn-tree/.test(url)) throw new Error("PROD url — dev-only script, aborting.");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) } as any);
  const home = await prisma.restaurant.findFirst({ where: { slug: "demo-pizza-palace" }, select: { id: true } });
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const driver = await prisma.driver.upsert({
    where: { email: EMAIL },
    create: { email: EMAIL, name: "Demo Driver", passwordHash, homeRestaurantId: home?.id ?? null, isActive: true, hourlyRateCents: 2000 },
    update: { passwordHash, isActive: true, homeRestaurantId: home?.id ?? null },
  });
  console.log(`✅ Demo driver ready: ${EMAIL} / ${PASSWORD}  (id ${driver.id})`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
