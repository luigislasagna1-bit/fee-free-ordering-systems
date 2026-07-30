/** Read-only: dump the newest orders' notes/type for the notes-leak repro. */
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
  const p = new PrismaClient({ adapter } as any);
  const orders = await p.order.findMany({
    orderBy: { createdAt: "desc" },
    take: 3,
    select: { orderNumber: true, type: true, notes: true, deliveryAddress: true, customerName: true, createdAt: true },
  });
  for (const o of orders) {
    console.log(`#${o.orderNumber} [${o.type}] ${o.customerName} @ ${o.createdAt.toISOString()}`);
    console.log(`  address: ${JSON.stringify(o.deliveryAddress)}`);
    console.log(`  notes:   ${JSON.stringify(o.notes)}`);
  }
  await p.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
