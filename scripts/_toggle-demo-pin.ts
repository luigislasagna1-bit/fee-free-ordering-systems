/** DEV-only: pin demo "Spaghetti Bolognese" + accent the Pasta category red.
 *    npx tsx scripts/_toggle-demo-pin.ts on|off */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);

async function main() {
  if ((process.env.DATABASE_URL || "").includes("dawn-tree")) throw new Error("Refusing PROD");
  const on = process.argv[2] !== "off";
  const r = await prisma.restaurant.findUnique({ where: { slug: "demo-pizza-palace" }, select: { id: true } });
  if (!r) throw new Error("demo not found");
  await prisma.menuItem.updateMany({ where: { restaurantId: r.id, name: "Spaghetti Bolognese" }, data: { pinnedToTop: on } });
  await prisma.menuCategory.updateMany({ where: { restaurantId: r.id, name: "Pasta" }, data: { accentColor: on ? "#dc2626" : null } });
  console.log(`✓ pin=${on} accent=${on ? "#dc2626" : "cleared"}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
