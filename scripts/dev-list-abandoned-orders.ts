/**
 * Read-only audit: list every order matching the "abandoned" pattern
 * (status=pending, paymentStatus=pending, notifiedAt=null) older than
 * the given window. Use to verify nothing else is silently stuck
 * before the new sweeper kicks in.
 *
 * Usage:
 *   npx tsx scripts/dev-list-abandoned-orders.ts [minutes] [database-url]
 *   default minutes = 30
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const minutes = parseInt(process.argv[2] ?? "30", 10);
  const url = process.argv[3] ?? process.env.DATABASE_URL;
  if (!url) { console.error("No DATABASE_URL"); process.exit(1); }
  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const cutoff = new Date(Date.now() - minutes * 60 * 1000);
  const stuck = await prisma.order.findMany({
    where: { status: "pending", paymentStatus: "pending", notifiedAt: null, createdAt: { lt: cutoff } },
    orderBy: { createdAt: "desc" },
    select: { orderNumber: true, id: true, createdAt: true, total: true, restaurant: { select: { slug: true } } },
  });
  console.log(`Found ${stuck.length} abandoned-payment order(s) older than ${minutes} min:`);
  for (const o of stuck) {
    const age = Math.floor((Date.now() - o.createdAt.getTime()) / 60000);
    console.log(`  ${o.orderNumber}  ${o.restaurant.slug}  $${o.total.toFixed(2)}  ${age} min ago`);
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
