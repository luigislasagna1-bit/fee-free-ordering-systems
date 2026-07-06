/**
 * Dev-DB parity for the platform-key-only maps model (Luigi 2026-07-04):
 * copies the Google Maps key that was sitting on the demo restaurant's own
 * googleMapsApiKey into PlatformSettings.googleMapsApiKey (the ONLY key the
 * app reads now), then clears the restaurant-own field.
 *   npx tsx scripts/_seed-dev-platform-maps-key.ts   (dev DB only)
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const url = process.env.DATABASE_URL!;
  if (/dawn-tree/.test(url)) throw new Error("This is the PROD url — dev-only script, aborting.");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) } as any);

  const r = await prisma.restaurant.findFirst({
    where: { googleMapsApiKey: { not: null } },
    select: { id: true, name: true, googleMapsApiKey: true },
  });
  if (!r?.googleMapsApiKey) throw new Error("No restaurant-own key found to promote.");

  await prisma.platformSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", googleMapsApiKey: r.googleMapsApiKey },
    update: { googleMapsApiKey: r.googleMapsApiKey },
  });
  const cleared = await prisma.restaurant.updateMany({
    where: { googleMapsApiKey: { not: null } },
    data: { googleMapsApiKey: null },
  });
  console.log(`✅ platform key set from "${r.name}" (${r.googleMapsApiKey.slice(0, 12)}…); cleared ${cleared.count} restaurant-own key(s)`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
