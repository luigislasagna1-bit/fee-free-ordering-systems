/** READ-ONLY: is the customer SMS / branded-app push path live anywhere? */
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

  const rows = await prisma.restaurantAddOn.findMany({
    where: { status: { in: ["active", "trialing"] } },
    select: { restaurantId: true, addOn: { select: { slug: true, enabledFeatures: true } } },
  });
  const counts: Record<string, Set<string>> = {};
  for (const r of rows) {
    let feats: string[] = [];
    const raw = (r.addOn as any)?.enabledFeatures;
    if (Array.isArray(raw)) feats = raw as string[];
    else if (typeof raw === "string") { try { feats = JSON.parse(raw); } catch { feats = []; } }
    for (const f of feats) (counts[f] ??= new Set()).add(r.restaurantId);
  }
  for (const k of ["customer_sms", "app_store_listing"]) {
    console.log(k + ": " + (counts[k]?.size ?? 0) + " restaurant(s)");
  }
  console.log("active add-on rows: " + rows.length);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
