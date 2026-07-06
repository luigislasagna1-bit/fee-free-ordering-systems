import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) } as any);
  const s = await prisma.platformSettings.findUnique({ where: { id: "singleton" }, select: { googleMapsApiKey: true } });
  console.log("dev PlatformSettings key:", s?.googleMapsApiKey ? s.googleMapsApiKey.slice(0, 12) + "…" : "(empty)");
  console.log("env NEXT_PUBLIC key:", (process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY || "(empty)").slice(0, 12) + "…");
  const r = await prisma.restaurant.findFirst({ where: { slug: "demo-pizza-palace" }, select: { googleMapsApiKey: true } });
  console.log("demo restaurant own key:", r?.googleMapsApiKey ? r.googleMapsApiKey.slice(0, 12) + "…" : "(empty)");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
