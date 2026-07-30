/** DEV-only: set a known password on owner@pizzapalace.com (local demo) so the
 *  /driver dispatch-view logout can be verified through the real login flow. */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

async function main() {
  if ((process.env.DATABASE_URL || "").includes("dawn-tree")) throw new Error("Refusing PROD");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);
  const email = "owner@pizzapalace.com";
  const u = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true, restaurantId: true } });
  if (!u) throw new Error(`no ${email}`);
  await prisma.user.update({ where: { id: u.id }, data: { passwordHash: await bcrypt.hash("Verify123!", 12), emailVerifiedAt: new Date() } });
  console.log(`✓ ${email} pw=Verify123! role=${u.role} restaurantId=${u.restaurantId}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
