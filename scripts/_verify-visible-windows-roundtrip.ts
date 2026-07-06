/** DEV-only: round-trip the multi-window VISIBILITY write path exactly as the
 *  menu routes do (buildVisibilityData → prisma update w/ DbNull) for BOTH a
 *  MenuItem and a MenuCategory, then read back and evaluate with isVisibleNow. */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient, Prisma } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { buildVisibilityData, isVisibleNow, visibleWindowsOf } from "../src/lib/menu-visibility";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);
const ITEM_ID = "cmoofqlxu000p9kvhu0ppa1pr"; // demo Spaghetti Bolognese

const TWO_WINDOWS = {
  mode: "show_only_from",
  days: [1, 2, 3, 4], from: "10:00", to: "15:00",
  extraWindows: [{ days: [5, 6, 0], from: "15:00", to: "20:00" }],
};

async function roundTrip(label: string, update: (data: Record<string, unknown>) => Promise<void>, read: () => Promise<any>) {
  const v = buildVisibilityData(TWO_WINDOWS as any);
  if (!v.ok) throw new Error(v.error);
  await update({ ...v.data, visibleWindows: v.data.visibleWindows ?? Prisma.DbNull });
  const after = await read();
  console.log(`${label} STORED:`, JSON.stringify({ mode: after.visibilityMode, days: after.visibleDays, from: after.visibleFrom, to: after.visibleTo, windows: after.visibleWindows }));
  const okStore = Array.isArray(after.visibleWindows) && after.visibleWindows.length === 2 && visibleWindowsOf(after).length === 2;
  const tueNoon = isVisibleNow(after, new Date("2026-06-16T12:00:00Z"), "UTC"); // expect true
  const tue16 = isVisibleNow(after, new Date("2026-06-16T16:00:00Z"), "UTC");   // expect false
  const sat16 = isVisibleNow(after, new Date("2026-06-20T16:00:00Z"), "UTC");   // expect true
  console.log(`${label} eval: Tue12=${tueNoon} Tue16=${tue16} Sat16=${sat16}`);

  // Drop to ONE window — DbNull must wipe the JSON column.
  const single = buildVisibilityData({ mode: "show_only_from", days: [1, 2, 3, 4], from: "10:00", to: "15:00" });
  if (!single.ok) throw new Error(single.error);
  await update({ ...single.data, visibleWindows: single.data.visibleWindows ?? Prisma.DbNull });
  const cleared = await read();
  // Back to always-visible — every visibility column must clear.
  const always = buildVisibilityData(null);
  if (!always.ok) throw new Error("always failed");
  await update({ ...always.data, visibleWindows: always.data.visibleWindows ?? Prisma.DbNull });
  const reset = await read();
  const ok = okStore && tueNoon && !tue16 && sat16 && cleared.visibleWindows === null && cleared.visibleDays === "[1,2,3,4]" &&
    reset.visibilityMode === null && reset.visibleWindows === null && reset.visibleDays === null;
  console.log(`${label} VERDICT: ${ok ? "✅ round-trip OK" : "❌ mismatch"} (cleared.windows=${JSON.stringify(cleared.visibleWindows)}, reset.mode=${reset.visibilityMode})`);
  return ok;
}

async function main() {
  if ((process.env.DATABASE_URL || "").includes("dawn-tree")) throw new Error("Refusing PROD");
  const SELECT = { visibilityMode: true, visibleDays: true, visibleFrom: true, visibleTo: true, visibleWindows: true, isHidden: true } as const;

  const itemOk = await roundTrip("ITEM",
    (data) => prisma.menuItem.update({ where: { id: ITEM_ID }, data }).then(() => {}),
    () => prisma.menuItem.findUnique({ where: { id: ITEM_ID }, select: SELECT }));

  const item = await prisma.menuItem.findUnique({ where: { id: ITEM_ID }, select: { categoryId: true } });
  const catOk = await roundTrip("CATEGORY",
    (data) => prisma.menuCategory.update({ where: { id: item!.categoryId }, data }).then(() => {}),
    () => prisma.menuCategory.findUnique({ where: { id: item!.categoryId }, select: SELECT }));

  console.log(`\nOVERALL: ${itemOk && catOk ? "✅ item + category both OK" : "❌ FAILURE"}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
