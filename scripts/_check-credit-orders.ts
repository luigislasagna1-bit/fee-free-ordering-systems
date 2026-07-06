import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) } as any);
  const rows = await prisma.order.findMany({
    where: { creditApplied: { gt: 0 } },
    select: { orderNumber: true, total: true, creditApplied: true, createdAt: true, paymentMethod: true, status: true },
    take: 5,
    orderBy: { createdAt: "desc" },
  });
  console.log(rows.length ? JSON.stringify(rows, null, 1) : "no credit-paid orders on this branch");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
