/* DEV-only: reset the demo admin password to the documented seed value. */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "bcryptjs";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);

async function main() {
  if ((process.env.DATABASE_URL || "").includes("dawn-tree")) throw new Error("Refusing PROD");
  await prisma.user.update({
    where: { email: "owner@pizzapalace.com" },
    data: { passwordHash: await hash("restaurant123", 10), failedLoginCount: 0, lockedUntil: null },
  });
  await prisma.user.update({
    where: { email: "admin@feefreeordering.com" },
    data: { passwordHash: await hash("admin123", 10), failedLoginCount: 0, lockedUntil: null },
  });
  await prisma.user.update({
    where: { email: "kitchen@pizzapalace.com" },
    data: { passwordHash: await hash("kitchen123", 10), failedLoginCount: 0, lockedUntil: null },
  }).catch(() => console.log("(no kitchen user)"));
  console.log("passwords reset");
}
main().finally(() => prisma.$disconnect());
