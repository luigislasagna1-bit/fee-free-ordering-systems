/* DEV-only: make the seeded BOGO promo auto-apply (it was autoApply:false with
 * no coupon code — inert). */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);

async function main() {
  if ((process.env.DATABASE_URL || "").includes("dawn-tree")) throw new Error("Refusing PROD");
  await prisma.promotion.update({ where: { id: "cmpr805mp000300vhq7ggi3uy" }, data: { autoApply: true } });
  console.log("✓ BOGO Pizza / Pasta set to autoApply");
}
main().finally(() => prisma.$disconnect());
