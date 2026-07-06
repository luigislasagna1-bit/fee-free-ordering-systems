/* DEV-only: give Pizzas a category image so banner-vs-plain mixing is testable. */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);

async function main() {
  if ((process.env.DATABASE_URL || "").includes("dawn-tree")) throw new Error("Refusing PROD");
  await prisma.menuCategory.update({
    where: { id: "cmoofqlws000g9kvh9dyj20fz" },
    data: { imageUrl: "/marketing/hero-funnel-v2.webp" },
  });
  console.log("✓ Pizzas category image set");
}
main().finally(() => prisma.$disconnect());
