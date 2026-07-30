/** Read-only: list restaurants owned by Fabrizio (fabr* emails) + platform maps key presence. */
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
  const users = await p.user.findMany({
    where: { email: { contains: "fabr", mode: "insensitive" } },
    select: { email: true, restaurantId: true },
  });
  console.log("users:", JSON.stringify(users));
  const ids = users.map((u) => u.restaurantId).filter(Boolean) as string[];
  const rests = await p.restaurant.findMany({
    where: { OR: [{ id: { in: ids } }, { email: { contains: "fabr", mode: "insensitive" } }] },
    select: { id: true, slug: true, name: true, publishedAt: true, isActive: true, acceptsDelivery: true, currency: true, lat: true, lng: true, address: true, city: true, country: true },
  });
  for (const r of rests) console.log(`${r.slug} — "${r.name}" lat=${r.lat} lng=${r.lng} addr="${r.address}, ${r.city}" country=${r.country} (delivery=${r.acceptsDelivery}, ${r.currency})`);
  const ps = await p.platformSettings.findFirst({ select: { googleMapsApiKey: true } });
  console.log("platform maps key set:", ps?.googleMapsApiKey ? `yes (len ${ps.googleMapsApiKey.length}, ends ...${ps.googleMapsApiKey.slice(-4)})` : "NO");
  await p.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
