// Backfill lat/lng on RestaurantCustomerAddress rows that were saved without
// coordinates (pre-2026-06-30 rows physically couldn't have them; later rows
// only get them when a suggestion was picked). Coordinate-less saved defaults
// are what dead-ended a live checkout on 2026-08-01 (see COSTS→no,
// checkout-address-gate.ts — the b2648ac7 regression).
//
// Idempotent + additive: only rows with lat IS NULL are touched, only on a
// successful geocode; failures are logged and left as-is (checkout's text
// geocode / pin hatch still cover them). Nominatim policy: max 1 req/s —
// hard-throttled below. Run off-peak.
//
//   npx tsx scripts/backfill-address-coords.ts            (dev DATABASE_URL)
//   npx tsx scripts/run-on-prod.ts scripts/backfill-address-coords.ts   (prod)
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { geocodeAddress } from "../src/lib/geocode";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const rows = await prisma.restaurantCustomerAddress.findMany({
    where: { OR: [{ lat: null }, { lng: null }] },
    orderBy: { createdAt: "asc" },
    take: 500, // safety cap per run; re-run if it reports a remainder
  });
  console.log(`Coordinate-less saved addresses: ${rows.length}`);
  let ok = 0, fail = 0;
  for (const row of rows) {
    const full = [row.street, row.city, row.state, row.zip, row.country]
      .filter(Boolean)
      .join(", ");
    const coords = await geocodeAddress(full);
    if (coords) {
      await prisma.restaurantCustomerAddress.update({
        where: { id: row.id },
        data: { lat: coords.lat, lng: coords.lng },
      });
      ok++;
      console.log(`  ✓ ${row.id}  ${full} → ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`);
    } else {
      fail++;
      console.log(`  ✗ ${row.id}  ${full} → no geocode result (left as-is)`);
    }
    await sleep(1100); // Nominatim usage policy: ≤1 req/s
  }
  const remaining = await prisma.restaurantCustomerAddress.count({
    where: { OR: [{ lat: null }, { lng: null }] },
  });
  console.log(`Done. healed=${ok} unresolvable=${fail} still-null=${remaining}`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
