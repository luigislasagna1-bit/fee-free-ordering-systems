/**
 * Backfill geocodes for the marketplace 15km radius filter: any active restaurant
 * with an address but no lat/lng gets geocoded (OpenStreetMap/Nominatim). Restaurants
 * without coordinates can't be placed on the map, so they wouldn't appear in a
 * location-based marketplace view. Idempotent — only fills nulls. Rate-limited to
 * respect Nominatim (1 req/sec).
 *   npx tsx scripts/backfill-marketplace-geocodes.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { geocodeAddress } from "../src/lib/geocode";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);
  const targets = await prisma.restaurant.findMany({
    where: { isActive: true, OR: [{ lat: null }, { lng: null }] },
    select: { id: true, name: true, address: true, city: true, state: true, zip: true },
  });
  console.log(`${targets.length} restaurant(s) missing coordinates.`);
  let filled = 0;
  for (const r of targets) {
    const addr = [r.address, r.city, r.state, r.zip].filter(Boolean).join(", ");
    if (!addr) {
      console.log(`  · ${r.name}: no address — skipped`);
      continue;
    }
    const geo = await geocodeAddress(addr);
    if (geo) {
      await prisma.restaurant.update({ where: { id: r.id }, data: { lat: geo.lat, lng: geo.lng } });
      console.log(`  ✓ ${r.name}: ${geo.lat.toFixed(4)}, ${geo.lng.toFixed(4)}`);
      filled++;
    } else {
      console.log(`  ✗ ${r.name}: geocode failed for "${addr}"`);
    }
    await sleep(1100); // Nominatim courtesy limit
  }
  console.log(`✅ Filled ${filled}/${targets.length}.`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
