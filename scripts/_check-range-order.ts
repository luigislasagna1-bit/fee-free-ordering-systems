/** Dev-only: verify the range test order got scheduledSlotMinutes stamped. */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) } as any);
  const o = await prisma.order.findFirst({
    where: { customerEmail: "rangetest@example.com" },
    orderBy: { createdAt: "desc" },
    select: { id: true, orderNumber: true, scheduledFor: true, scheduledSlotMinutes: true, status: true, type: true, createdAt: true },
  });
  console.log(JSON.stringify(o, null, 2));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
