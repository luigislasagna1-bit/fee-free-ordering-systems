import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
config({ path: ".env.local" });
config({ path: ".env" });
async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) } as any);
  const mi = await prisma.menuItem.findFirst({ where: { name: "Penne Arrabbiata" }, select: { id: true, name: true, price: true } });
  console.log("PENNE", JSON.stringify(mi));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
