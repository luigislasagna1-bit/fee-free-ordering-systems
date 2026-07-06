/**
 * DEV-ONLY: toggle ShipDay dispatch on Luigi's dev restaurant so the
 * prepaid-delivery checkout behaviour can be verified.
 *   npx tsx scripts/_toggle-demo-shipday.ts on|off
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const url = process.env.DATABASE_URL!;
  if (/dawn-tree/.test(url)) throw new Error("PROD url — dev-only script, aborting.");
  const on = process.argv[2] !== "off";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) } as any);
  const r = await prisma.restaurant.findFirst({ where: { name: { contains: "Lasagna" } }, select: { id: true, name: true, slug: true } });
  if (!r) throw new Error("restaurant not found");
  await prisma.shipdayConfig.upsert({
    where: { restaurantId: r.id },
    create: {
      restaurantId: r.id,
      enabled: on,
      deliverySource: on ? "shipday" : "own",
      apiKeyEnc: on ? "test" : null,
      apiKeyIv: on ? "test" : null,
      apiKeyTag: on ? "test" : null,
    },
    update: on
      ? { enabled: true, deliverySource: "shipday", apiKeyEnc: "test", apiKeyIv: "test", apiKeyTag: "test" }
      : { enabled: false, deliverySource: "own", apiKeyEnc: null, apiKeyIv: null, apiKeyTag: null },
  });
  console.log(`✅ shipday ${on ? "ON" : "OFF"} for ${r.name} (/order/${r.slug})`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
