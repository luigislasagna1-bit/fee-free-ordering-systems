/* DEV-only: seed an approved reseller + login user to verify the reseller
 * VIES flow end-to-end. Idempotent. Login: reseller-test@dev.local / reseller123 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "bcryptjs";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);

async function main() {
  if ((process.env.DATABASE_URL || "").includes("dawn-tree")) throw new Error("Refusing PROD");
  const passwordHash = await hash("reseller123", 10);
  const user = await prisma.user.upsert({
    where: { email: "reseller-test@dev.local" },
    create: { email: "reseller-test@dev.local", name: "Dev Reseller", role: "reseller_partner", passwordHash },
    update: { role: "reseller_partner", passwordHash, failedLoginCount: 0, lockedUntil: null },
  });
  const existing = await prisma.resellerProfile.findFirst({ where: { userId: user.id }, select: { id: true } });
  const profile = existing
    ? await prisma.resellerProfile.update({ where: { id: existing.id }, data: { status: "approved", companyName: "Dev Test Partners" } })
    : await prisma.resellerProfile.create({ data: { userId: user.id, status: "approved", companyName: "Dev Test Partners" } });
  console.log(`✓ reseller-test@dev.local / reseller123 — profile ${profile.id}`);
}
main().finally(() => prisma.$disconnect());
