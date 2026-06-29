/**
 * READ-ONLY order inspector — status + timing + reward-ledger rows for one
 * order. Verification aid (2026-06-29). Writes NOTHING.
 *
 * Usage (prod):
 *   npx tsx scripts/run-on-prod.ts scripts/inspect-order.ts <order-id-or-suffix>
 */
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });
dotenvConfig({ path: ".env" });

import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaNeon } from "@prisma/adapter-neon";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) { console.error("DATABASE_URL is not set."); process.exit(1); }
const isNeon = /\.neon\.tech([:/?]|$)/i.test(connectionString);
const prisma = new PrismaClient({
  adapter: isNeon ? new PrismaNeon({ connectionString }) : new PrismaPg({ connectionString }),
} as any);

const [, , idArg] = process.argv;
if (!idArg) { console.error("Usage: ... scripts/inspect-order.ts <order-id-or-suffix>"); process.exit(1); }

async function main() {
  const orders = await prisma.order.findMany({
    where: { id: { contains: idArg } },
    select: {
      id: true, orderNumber: true, status: true, paymentMethod: true, paymentStatus: true,
      refundStatus: true, refundedAmount: true, total: true, customerId: true, customerEmail: true,
      createdAt: true, notifiedAt: true, alertAt: true, rejectedAt: true, rejectionReason: true,
      placedWhileClosed: true,
    },
    take: 10,
  });
  if (!orders.length) { console.log(`No order matching "${idArg}".`); return; }
  for (const o of orders) {
    console.log(`\n=== ORDER #${o.orderNumber}  id=${o.id} ===`);
    console.log(`  status         : ${o.status}${o.rejectionReason ? `  ("${o.rejectionReason}")` : ""}`);
    console.log(`  payment        : ${o.paymentMethod} / ${o.paymentStatus}${o.refundStatus ? ` / refund ${o.refundStatus} $${o.refundedAmount ?? 0}` : ""}`);
    console.log(`  total          : $${o.total?.toFixed(2)}`);
    console.log(`  placedWhileClosed: ${o.placedWhileClosed}`);
    console.log(`  createdAt      : ${o.createdAt.toISOString()}`);
    console.log(`  notifiedAt     : ${o.notifiedAt?.toISOString() ?? "—"}`);
    console.log(`  alertAt        : ${o.alertAt?.toISOString() ?? "—"}`);
    console.log(`  rejectedAt     : ${o.rejectedAt?.toISOString() ?? "—"}`);
    const reward = await prisma.rewardLedger.findMany({
      where: { orderId: o.id },
      select: { amount: true, reason: true, status: true, balanceAfter: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    console.log(`  reward ledger rows for this order (${reward.length}):`);
    if (!reward.length) console.log("    (none)");
    for (const r of reward) {
      console.log(`    ${r.createdAt.toISOString().slice(0, 19).replace("T", " ")}  ${(r.amount < 0 ? "-$" : " $") + Math.abs(r.amount).toFixed(2)}  ${r.reason} ${r.status ?? ""}  →bal $${r.balanceAfter.toFixed(2)}`);
    }
  }
  console.log("");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
