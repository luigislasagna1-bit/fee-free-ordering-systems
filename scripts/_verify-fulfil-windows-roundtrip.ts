/** DEV-only: round-trip the multi-window fulfilment write path exactly as the
 *  items PATCH route does (buildFulfilData → prisma update w/ DbNull), then
 *  read back and evaluate with the runtime checker. */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient, Prisma } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { buildFulfilData, isFulfilableAt, fulfilWindowsOf } from "../src/lib/menu-fulfilment";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);
const ID = "cmoofqlxu000p9kvhu0ppa1pr"; // demo Spaghetti Bolognese

async function main() {
  if ((process.env.DATABASE_URL || "").includes("dawn-tree")) throw new Error("Refusing PROD");

  // 1. Write TWO windows exactly like the PATCH route.
  const f = buildFulfilData({ windows: [
    { days: [1, 2, 3, 4], from: "10:00", to: "15:00" },
    { days: [5, 6, 0], from: "15:00", to: "20:00" },
  ] });
  if (!f.ok) throw new Error(f.error);
  await prisma.menuItem.update({ where: { id: ID }, data: { ...f.data, fulfilWindows: f.data.fulfilWindows ?? Prisma.DbNull } });
  const after: any = await prisma.menuItem.findUnique({ where: { id: ID }, select: { fulfilDays: true, fulfilFrom: true, fulfilTo: true, fulfilWindows: true } });
  console.log("STORED:", JSON.stringify(after));
  console.log("parsed windows:", fulfilWindowsOf(after).length);
  console.log("Tue 12:00 orderable:", isFulfilableAt(after, new Date("2026-06-16T12:00:00Z"), "UTC")); // expect true
  console.log("Tue 16:00 orderable:", isFulfilableAt(after, new Date("2026-06-16T16:00:00Z"), "UTC")); // expect false
  console.log("Sat 16:00 orderable:", isFulfilableAt(after, new Date("2026-06-20T16:00:00Z"), "UTC")); // expect true

  // 2. Clear (0 windows) — DbNull must wipe the JSON column + legacy triple.
  const clear = buildFulfilData({ windows: [] });
  if (!clear.ok) throw new Error(clear.error);
  await prisma.menuItem.update({ where: { id: ID }, data: { ...clear.data, fulfilWindows: clear.data.fulfilWindows ?? Prisma.DbNull } });
  const cleared: any = await prisma.menuItem.findUnique({ where: { id: ID }, select: { fulfilDays: true, fulfilFrom: true, fulfilTo: true, fulfilWindows: true } });
  console.log("CLEARED:", JSON.stringify(cleared));
  console.log("VERDICT:", after.fulfilWindows && Array.isArray(after.fulfilWindows) && after.fulfilWindows.length === 2 &&
    cleared.fulfilWindows === null && cleared.fulfilDays === null ? "✅ round-trip OK" : "❌ mismatch");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
