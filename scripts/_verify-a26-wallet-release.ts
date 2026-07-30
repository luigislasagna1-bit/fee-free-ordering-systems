/** Read-only PROD check: RewardLedger rows for the customer-cancelled test
 *  order ORD-828880777 — the spend row must be "released" (credit returned). */
import { readFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

const env = readFileSync(".env.local", "utf8");
const urls: string[] = [];
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^\s*#?\s*DATABASE_URL\s*=\s*"([^"]+)"/);
  if (m && !urls.includes(m[1])) urls.push(m[1]);
}

async function main() {
  for (const url of urls) {
    const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
    const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
    const p = new PrismaClient({ adapter } as any);
    try {
      const order = await p.order.findFirst({
        where: { orderNumber: "ORD-828880777" },
        select: { id: true },
      });
      if (!order) continue;
      const rows = await p.rewardLedger.findMany({
        where: { orderId: order.id },
        orderBy: { createdAt: "asc" },
        select: { amount: true, balanceAfter: true, reason: true, status: true, createdAt: true },
      });
      console.log(`ledger rows for ORD-828880777 (${rows.length}):`);
      for (const r of rows) {
        console.log(` ${r.createdAt.toISOString().slice(0, 16)} ${r.reason} amount=${r.amount} status=${r.status} balAfter=${r.balanceAfter}`);
      }
    } catch (e: any) {
      console.log(`DB error: ${String(e?.message).slice(0, 120)}`);
    } finally {
      await p.$disconnect();
    }
  }
}
main();
