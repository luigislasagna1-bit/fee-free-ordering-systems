/* DEV-only: full eligibility fields of the BOGO promo. */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);

async function main() {
  if ((process.env.DATABASE_URL || "").includes("dawn-tree")) throw new Error("Refusing PROD");
  const p = await prisma.promotion.findUnique({ where: { id: "cmpr805mp000300vhq7ggi3uy" } });
  const { rules, ruleConfig, ...rest } = p as any;
  console.log(JSON.stringify(rest));
  console.log("ruleConfig:", JSON.stringify(ruleConfig).slice(0, 400));
}
main().finally(() => prisma.$disconnect());
