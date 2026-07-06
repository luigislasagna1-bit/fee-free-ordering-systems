/** DEV-only e2e fixture for multi-window testing on demo Spaghetti Bolognese.
 *  Positions windows relative to the restaurant's CURRENT local time so the
 *  customer page can be checked live. Usage:
 *    npx tsx scripts/_toggle-demo-multi-windows.ts vis-on-now    // 2 vis windows, now INSIDE window 2 → item shows
 *    npx tsx scripts/_toggle-demo-multi-windows.ts vis-off-now   // 2 vis windows, now OUTSIDE both → item hidden
 *    npx tsx scripts/_toggle-demo-multi-windows.ts fulfil-off-now // 2 fulfil windows, now OUTSIDE both → greyed + label
 *    npx tsx scripts/_toggle-demo-multi-windows.ts fulfil-on-now  // 2 fulfil windows, now INSIDE window 2 → orderable
 *    npx tsx scripts/_toggle-demo-multi-windows.ts reset          // clear everything
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient, Prisma } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { buildVisibilityData } from "../src/lib/menu-visibility";
import { buildFulfilData } from "../src/lib/menu-fulfilment";
import { localDowAndHHMM } from "../src/lib/restaurant-hours";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);
const ITEM_ID = "cmoofqlxu000p9kvhu0ppa1pr"; // demo Spaghetti Bolognese

function hhmmShift(hhmm: string, deltaMin: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const t = Math.min(Math.max(h * 60 + m + deltaMin, 0), 23 * 60 + 59);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

async function main() {
  if ((process.env.DATABASE_URL || "").includes("dawn-tree")) throw new Error("Refusing PROD");
  const mode = process.argv[2];
  const rest = await prisma.restaurant.findUnique({ where: { slug: "demo-pizza-palace" }, select: { timezone: true } });
  const tz = rest?.timezone || "America/Toronto";
  const { dow, hhmm } = localDowAndHHMM(new Date(), tz);
  const otherDay1 = (dow + 2) % 7;
  const otherDay2 = (dow + 3) % 7;
  // Window 2 covers "now" with a ±2h band (clamped to the day).
  const onNow = { days: [dow], from: hhmmShift(hhmm, -120), to: hhmmShift(hhmm, 120) };
  // Off-now: both windows on other days entirely (from<to so no overnight spill).
  const offA = { days: [otherDay1], from: "10:00", to: "15:00" };
  const offB = { days: [otherDay2], from: "15:00", to: "20:00" };
  console.log(`tz=${tz} now: dow=${dow} ${hhmm} → onNow=${JSON.stringify(onNow)}`);

  const data: Record<string, unknown> = {};
  if (mode === "vis-on-now" || mode === "vis-off-now") {
    const v = buildVisibilityData({
      mode: "show_only_from",
      days: offA.days, from: offA.from, to: offA.to,
      extraWindows: [mode === "vis-on-now" ? onNow : offB],
    } as any);
    if (!v.ok) throw new Error(v.error);
    Object.assign(data, v.data, { visibleWindows: v.data.visibleWindows ?? Prisma.DbNull });
  } else if (mode === "fulfil-on-now" || mode === "fulfil-off-now") {
    const f = buildFulfilData({ windows: [offA, mode === "fulfil-on-now" ? onNow : offB] });
    if (!f.ok) throw new Error(f.error);
    Object.assign(data, f.data, { fulfilWindows: f.data.fulfilWindows ?? Prisma.DbNull });
  } else if (mode === "reset") {
    const v = buildVisibilityData(null);
    const f = buildFulfilData(null);
    if (!v.ok || !f.ok) throw new Error("reset build failed");
    Object.assign(data, v.data, { visibleWindows: Prisma.DbNull }, f.data, { fulfilWindows: Prisma.DbNull });
  } else {
    throw new Error("mode = vis-on-now | vis-off-now | fulfil-on-now | fulfil-off-now | reset");
  }

  await prisma.menuItem.update({ where: { id: ITEM_ID }, data });
  const after: any = await prisma.menuItem.findUnique({
    where: { id: ITEM_ID },
    select: { name: true, visibilityMode: true, visibleDays: true, visibleFrom: true, visibleTo: true, visibleWindows: true, fulfilDays: true, fulfilFrom: true, fulfilTo: true, fulfilWindows: true },
  });
  console.log(`✅ ${mode} applied:`, JSON.stringify(after));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
