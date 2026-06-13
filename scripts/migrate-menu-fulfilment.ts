/**
 * One-time migration onto the Phase 2 Fulfilment Time model (Luigi 2026-06-12).
 * Idempotent — only touches rows still on the legacy availabilityMode="show"
 * path (the "visible but order-restricted" items Phase 1 deliberately left
 * behind, see migrate-menu-visibility.ts).
 *
 *   availabilityMode="show" + day/time window
 *        → fulfilDays / fulfilFrom / fulfilTo, and the legacy availability
 *          fields are cleared so ONLY the fulfilment system governs the item.
 *   availabilityMode="show" with no real window
 *        → just clear availabilityMode (it was a no-op restriction).
 *
 * After this runs no item has availabilityMode="show", so a second run is a
 * no-op. Run against BOTH Neon branches:
 *
 *   npx tsx scripts/migrate-menu-fulfilment.ts                       (current DATABASE_URL)
 *   npx tsx scripts/run-on-prod.ts scripts/migrate-menu-fulfilment.ts (prod branch)
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaNeon } from "@prisma/adapter-neon";

config({ path: ".env.local" });
config({ path: ".env" });

function parseDays(raw: string | null): number[] | null {
  if (!raw) return null;
  try { const a = JSON.parse(raw); if (Array.isArray(a) && a.length > 0) return a.map(Number); } catch { /* */ }
  return null;
}

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const items = await prisma.menuItem.findMany({
    where: { availabilityMode: "show" },
    select: { id: true, availableDays: true, availableFrom: true, availableTo: true },
  });

  let withWindow = 0, cleared = 0;
  for (const it of items) {
    const days = parseDays(it.availableDays);
    const hasDay = !!days && days.length > 0 && days.length < 7;
    const hasTime = !!(it.availableFrom && it.availableTo);

    if (!hasDay && !hasTime) {
      // "show" with no real restriction — just retire the flag.
      await prisma.menuItem.update({ where: { id: it.id }, data: { availabilityMode: null } });
      cleared++;
      continue;
    }

    await prisma.menuItem.update({
      where: { id: it.id },
      data: {
        fulfilDays: hasDay ? JSON.stringify(days) : null,
        fulfilFrom: hasTime ? it.availableFrom : null,
        fulfilTo: hasTime ? it.availableTo : null,
        // The fulfilment fields now own the order window — clear the legacy ones
        // so isItemAvailableNow no longer greys/blocks the item.
        availableDays: null, availableFrom: null, availableTo: null, availabilityMode: null,
      },
    });
    withWindow++;
  }

  console.log(`✓ fulfilment migrated (with window): ${withWindow}, show-flag cleared (no window): ${cleared}, total "show" scanned: ${items.length}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
