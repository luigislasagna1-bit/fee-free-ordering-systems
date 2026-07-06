import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);
async function main() {
  const users = await prisma.user.findMany({ select: { email: true, role: true, restaurantId: true }, take: 12 });
  console.log("USERS", JSON.stringify(users, null, 1));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
