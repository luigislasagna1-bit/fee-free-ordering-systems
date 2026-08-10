/**
 * READ-ONLY: print-storm diagnosis. Dumps PrintLog rows for luigis-lasagna-pizzeria
 * last 48h (grouped per order) + PrinterSettings, to see how many print jobs each
 * voice order generated and via which path.
 *   npx tsx scripts/run-on-prod.ts scripts/_diag-print-storm-2026-08-10.ts
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

  const r = await prisma.restaurant.findFirst({ where: { slug: "luigis-lasagna-pizzeria" }, select: { id: true } });
  if (!r) { console.log("restaurant not found"); return; }
  const since = new Date(Date.now() - 48 * 3600 * 1000);

  const logs = await (prisma as any).printLog.findMany({
    where: { restaurantId: r.id, createdAt: { gte: since } },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  console.log(`=== PrintLog rows last 48h: ${logs.length} (showing up to 200) ===`);
  const byOrder: Record<string, any[]> = {};
  for (const l of logs) {
    const k = l.orderId ?? l.orderNumber ?? "(none)";
    (byOrder[k] ??= []).push(l);
  }
  for (const [k, rows] of Object.entries(byOrder)) {
    console.log(`--- order ${k}: ${rows.length} print jobs ---`);
    for (const l of rows.slice(0, 30)) {
      const { id, restaurantId, payload, ...rest } = l;
      console.log(JSON.stringify(rest));
    }
  }

  const ps = await (prisma as any).printerSettings.findMany({ where: { restaurantId: r.id } });
  console.log(`=== PrinterSettings: ${JSON.stringify(ps, null, 1)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
