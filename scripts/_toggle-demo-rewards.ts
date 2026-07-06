/* DEV-only: read or set demo restaurant's rewardsEnabled.
 *   npx tsx scripts/_toggle-demo-rewards.ts        -> print current
 *   npx tsx scripts/_toggle-demo-rewards.ts on|off -> set */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);

async function main() {
  if ((process.env.DATABASE_URL || "").includes("dawn-tree")) throw new Error("Refusing PROD");
  const arg = process.argv[2];
  if (arg === "on" || arg === "off") {
    await prisma.restaurant.update({ where: { slug: "demo-pizza-palace" }, data: { rewardsEnabled: arg === "on" } });
  }
  const r = await prisma.restaurant.findUnique({ where: { slug: "demo-pizza-palace" }, select: { rewardsEnabled: true } });
  console.log("rewardsEnabled:", (r as any)?.rewardsEnabled);
}
main().finally(() => prisma.$disconnect());
