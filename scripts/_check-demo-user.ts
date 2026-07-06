/* DEV-only: inspect + unlock the demo admin user for local verification. */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { compare } from "bcryptjs";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);

async function main() {
  if ((process.env.DATABASE_URL || "").includes("dawn-tree")) throw new Error("Refusing PROD");
  const u = await prisma.user.findUnique({
    where: { email: "owner@pizzapalace.com" },
    select: { id: true, role: true, failedLoginCount: true, lockedUntil: true, passwordHash: true, restaurantId: true },
  });
  if (!u) { console.log("user not found"); return; }
  console.log({
    role: u.role,
    failedLoginCount: u.failedLoginCount,
    lockedUntil: u.lockedUntil,
    hasRestaurant: !!u.restaurantId,
    passwordMatches: await compare("restaurant123", u.passwordHash || ""),
  });
  if (u.lockedUntil || (u.failedLoginCount ?? 0) > 0) {
    await prisma.user.update({ where: { id: u.id }, data: { failedLoginCount: 0, lockedUntil: null } });
    console.log("→ reset lockout");
  }
}
main().finally(() => prisma.$disconnect());
