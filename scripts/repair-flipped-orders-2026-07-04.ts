/**
 * Repair the 3 orders a stale tablet wrongly auto-rejected at 18:40 (they
 * had been accepted at 9:01 and auto-completed at 10:02 — cmr6meaaq).
 * Restores status "completed" and clears the bogus rejection stamps.
 * Guarded: only touches these exact orders while they're still "rejected"
 * with the auto-reject reason.
 *   npx tsx scripts/run-on-prod.ts scripts/repair-flipped-orders-2026-07-04.ts
 */
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

  const upd = await prisma.order.updateMany({
    where: {
      orderNumber: { in: ["ORD-724296909", "ORD-116497279", "ORD-366702546"] },
      status: "rejected",
      rejectionReason: { startsWith: "Auto-rejected:" },
    },
    data: { status: "completed", rejectedAt: null, rejectionReason: null },
  });
  console.log(`✅ restored ${upd.count} order(s) to completed`);
  const rows = await prisma.order.findMany({
    where: { orderNumber: { in: ["ORD-724296909", "ORD-116497279", "ORD-366702546"] } },
    select: { orderNumber: true, status: true, acceptedAt: true, completedAt: true, rejectedAt: true },
  });
  for (const r of rows) console.log(JSON.stringify(r));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
