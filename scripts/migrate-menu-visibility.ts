/**
 * One-time migration of existing menu items/categories onto the new
 * GloriaFood-style visibility model (Phase 1, Luigi 2026-06-12). Idempotent —
 * only touches rows where visibilityMode IS NULL.
 *
 *   isHidden=true            → visibilityMode "hide_from_menu"
 *   day/time-window items    → "show_only_from" (visible only in window); the
 *     (availabilityMode≠show)  old availableDays/From/To move to visible*, and
 *                              the legacy availability fields are cleared.
 *   availabilityMode="show"  → LEFT untouched (that's fulfilment — Phase 2).
 *
 *   npx tsx scripts/run-on-prod.ts scripts/migrate-menu-visibility.ts
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

  // ── Categories ───────────────────────────────────────────────────────────
  const cats = await prisma.menuCategory.findMany({
    where: { visibilityMode: null, isHidden: true },
    select: { id: true },
  });
  for (const c of cats) {
    await prisma.menuCategory.update({ where: { id: c.id }, data: { visibilityMode: "hide_from_menu" } });
  }

  // ── Items ────────────────────────────────────────────────────────────────
  const items = await prisma.menuItem.findMany({
    where: { visibilityMode: null },
    select: {
      id: true, isHidden: true, availabilityMode: true,
      availableDays: true, availableFrom: true, availableTo: true,
    },
  });
  let hidden = 0, windowed = 0;
  for (const it of items) {
    if (it.isHidden) {
      await prisma.menuItem.update({ where: { id: it.id }, data: { visibilityMode: "hide_from_menu" } });
      hidden++;
      continue;
    }
    // availabilityMode "show" = fulfilment (visible but blocked) → leave for Phase 2.
    if (it.availabilityMode === "show") continue;

    const days = parseDays(it.availableDays);
    const hasDayRestriction = !!days && days.length > 0 && days.length < 7;
    const hasTimeRestriction = !!(it.availableFrom && it.availableTo);
    if (!hasDayRestriction && !hasTimeRestriction) continue; // no real restriction → stays "always visible"

    await prisma.menuItem.update({
      where: { id: it.id },
      data: {
        visibilityMode: "show_only_from",
        visibleDays: hasDayRestriction ? JSON.stringify(days) : null,
        visibleFrom: hasTimeRestriction ? it.availableFrom : null,
        visibleTo: hasTimeRestriction ? it.availableTo : null,
        // Clear the legacy availability window now that visibility owns it.
        availableDays: null, availableFrom: null, availableTo: null, availabilityMode: null,
      },
    });
    windowed++;
  }

  console.log(`✓ categories hidden→visibility: ${cats.length}`);
  console.log(`✓ items hide_from_menu: ${hidden}, show_only_from (from window): ${windowed}, total scanned: ${items.length}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
