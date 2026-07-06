/** Dev-only: mark demo "Penne Arrabbiata" sold out (on) / back in stock (off).
 *  npx tsx scripts/_toggle-demo-sold-out.ts on|off */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const on = process.argv[2] !== "off";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) } as any);
  const r = await prisma.restaurant.findUnique({ where: { slug: "demo-pizza-palace" }, select: { id: true } });
  if (!r) throw new Error("demo not found");
  const res = await prisma.menuItem.updateMany({
    where: { restaurantId: r.id, name: "Penne Arrabbiata" },
    data: { isSoldOut: on },
  });
  console.log(`✓ Penne Arrabbiata isSoldOut=${on} (${res.count} row)`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
