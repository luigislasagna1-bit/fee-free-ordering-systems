/** READ-ONLY: today's StripeWebhookEvent rows (payment_intent.*) — which
 *  events arrived, when, and whether the handler processed or failed. */
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

  const rows = await prisma.stripeWebhookEvent.findMany({
    where: {
      receivedAt: { gte: new Date("2026-08-10T15:00:00Z") },
    },
    orderBy: { receivedAt: "asc" },
    take: 60,
    select: { receivedAt: true, eventType: true, status: true, errorMessage: true, processedAt: true },
  });
  for (const r of rows) {
    console.log(
      `${r.receivedAt.toISOString()} ${r.eventType.padEnd(44)} ${r.status.padEnd(10)} ` +
      `done=${r.processedAt?.toISOString() ?? "-"} err=${r.errorMessage ?? "-"}`
    );
  }
  console.log(`(${rows.length} rows)`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
