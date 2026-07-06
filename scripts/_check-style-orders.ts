/** Dev-only: verify scheduledSlotMinutes stamping per scheduledStyle. */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) } as any);
  const os = await prisma.order.findMany({
    where: { orderNumber: { in: ["ORD-394440173", "ORD-397054031"] } },
    select: { orderNumber: true, customerName: true, scheduledFor: true, scheduledSlotMinutes: true },
  });
  console.log(JSON.stringify(os, null, 2));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
