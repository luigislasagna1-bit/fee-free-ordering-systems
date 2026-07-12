/**
 * READ-ONLY debug: ask ShipDay's API what active orders it has for this
 * restaurant's account — settles whether a "dispatched" order actually exists
 * on ShipDay's side. Decrypts the stored key in memory only; never prints it.
 *   npx tsx scripts/run-on-prod.ts scripts/_check-shipday-orders.ts <restaurantId>
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { decrypt } from "../src/lib/encrypt";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const rid = process.argv[2];
  if (!rid) throw new Error("pass the restaurant id");
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const cfg = await prisma.shipdayConfig.findUnique({
    where: { restaurantId: rid },
    select: { apiKeyEnc: true, apiKeyIv: true, apiKeyTag: true },
  });
  if (!cfg?.apiKeyEnc || !cfg.apiKeyIv || !cfg.apiKeyTag) throw new Error("no stored key");
  const apiKey = decrypt(cfg.apiKeyEnc, cfg.apiKeyIv, cfg.apiKeyTag);

  const res = await fetch("https://api.shipday.com/orders", {
    headers: { Authorization: `Basic ${apiKey}`, "Content-Type": "application/json" },
  });
  const text = await res.text();
  console.log(`GET /orders -> HTTP ${res.status}`);
  try {
    const arr = JSON.parse(text);
    if (Array.isArray(arr)) {
      console.log(`ShipDay reports ${arr.length} order(s):`);
      for (const o of arr.slice(0, 10)) {
        console.log(`  shipdayId=${o.orderId ?? "?"} number=${o.orderNumber ?? "?"} status=${o.orderStatus?.orderState ?? o.orderStatus ?? "?"} customer=${o.customer?.name ?? "?"} placed=${o.activityLog?.placementTime ?? "?"}`);
      }
    } else {
      console.log(text.slice(0, 800));
    }
  } catch {
    console.log(text.slice(0, 800));
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
