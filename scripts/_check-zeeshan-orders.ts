/** READ-ONLY re-check of the three 2026-08-17 orders. */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const nums = ["ORD-906017021", "ORD-459250906", "ORD-599530704"];
  const rows = await prisma.order.findMany({
    where: { orderNumber: { in: nums } },
    select: {
      orderNumber: true, status: true, paymentStatus: true, notifiedAt: true,
      acceptedAt: true, cancelledBy: true, rejectionReason: true, createdAt: true,
      updatedAt: true, total: true, creditApplied: true, paymentIntentId: true,
    },
    orderBy: { createdAt: "desc" },
  });
  console.log("now =", new Date().toISOString());
  for (const r of rows) console.log(JSON.stringify(r));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
