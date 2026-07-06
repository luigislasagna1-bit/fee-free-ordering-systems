/* DEV-only: flag Tiramisu promoExcluded to reproduce the gift-card scenario. */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);

async function main() {
  if ((process.env.DATABASE_URL || "").includes("dawn-tree")) throw new Error("Refusing PROD");
  const flag = process.argv[2] !== "off";
  await prisma.menuItem.update({ where: { id: "cmoofqlys000x9kvh99jo9lw7" }, data: { promoExcluded: flag } });
  console.log(`✓ Tiramisu promoExcluded = ${flag}`);
}
main().finally(() => prisma.$disconnect());
