/* DEV-only: find an approved reseller + its login user for UI verification. */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);

async function main() {
  if ((process.env.DATABASE_URL || "").includes("dawn-tree")) throw new Error("Refusing PROD");
  const profiles = await prisma.resellerProfile.findMany({
    where: { status: "approved" },
    select: { id: true, companyName: true, companyVatId: true, user: { select: { email: true, role: true } } },
    take: 5,
  });
  console.log(JSON.stringify(profiles, null, 2));
}
main().finally(() => prisma.$disconnect());
