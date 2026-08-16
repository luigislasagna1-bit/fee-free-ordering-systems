/**
 * READ-ONLY: why did Nabil offer a "daily deal" item today? Dumps the item,
 * its category, its fulfil windows, every MenuItemDeal pairing that points at
 * it, and what isFulfilableAt() says for NOW in the restaurant's timezone.
 *
 *   npx tsx scripts/_diag-nabil-day-deal-2026-08-16.ts --db prod --item <menuItemId>
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { fulfilWindowLabel, hasFulfilWindow, isFulfilableAt } from "@/lib/menu-fulfilment";

config({ path: ".env.local" });
config({ path: ".env" });

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const db = opt("--db", "dev");
const itemId = opt("--item", "");

function prodUrl(): string {
  const env = readFileSync(".env.local", "utf8");
  let url: string | null = null;
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^\s*#\s*DATABASE_URL\s*=\s*"([^"]+)"/);
    if (m) url = m[1];
  }
  if (!url) throw new Error("No commented-out production DATABASE_URL in .env.local");
  return url;
}

async function main() {
  if (!itemId) throw new Error("--item <menuItemId> required");
  const url = db === "prod" ? prodUrl() : process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  try {
    const it = await prisma.menuItem.findUnique({
      where: { id: itemId },
      include: { category: true, variants: { orderBy: { sortOrder: "asc" } } },
    });
    if (!it) throw new Error("item not found");
    const restaurant = await prisma.restaurant.findUnique({ where: { id: it.restaurantId }, select: { name: true, timezone: true } });
    const tz = restaurant?.timezone ?? undefined;
    const now = new Date();
    const pick = (o: any) => ({
      id: o.id, name: o.name, isAvailable: o.isAvailable, isSoldOut: o.isSoldOut, price: o.price,
      fulfilDays: o.fulfilDays, fulfilFrom: o.fulfilFrom, fulfilTo: o.fulfilTo, fulfilWindows: o.fulfilWindows,
      hasWindow: hasFulfilWindow(o), fulfilableNow: isFulfilableAt(o, now, tz),
      label: hasFulfilWindow(o) ? fulfilWindowLabel(o, (d: number) => ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d], (t: string) => t) : "(no window)",
    });
    console.log(`# ${restaurant?.name} tz=${tz} now=${now.toISOString()} local=${now.toLocaleString("en-CA", { timeZone: tz })}`);
    console.log("ITEM:", JSON.stringify(pick(it), null, 1));
    console.log("CATEGORY:", JSON.stringify(pick(it.category), null, 1));
    console.log("VARIANTS:", JSON.stringify(it.variants.map((v: any) => ({ id: v.id, name: v.name, price: v.price })), null, 0));
    const deals = await prisma.menuItemDeal.findMany({
      where: { restaurantId: it.restaurantId, OR: [{ dealItemId: itemId }, { standardItemId: itemId }] },
      include: { dealItem: { include: { category: true } }, standardItem: { include: { category: true } } },
    });
    for (const d of deals) {
      console.log(`DEAL PAIR active=${d.active}: standard "${d.standardItem?.name}" [${d.standardItemId}] ← deal "${d.dealItem?.name}" [${d.dealItemId}]`);
      console.log("   deal item:", JSON.stringify(pick(d.dealItem), null, 0));
      console.log("   deal category:", JSON.stringify(pick(d.dealItem?.category), null, 0));
    }
    // Every item in the restaurant whose name mentions a weekday or "special"/"deal"
    const named = await prisma.menuItem.findMany({
      where: { restaurantId: it.restaurantId, OR: [{ name: { contains: "special", mode: "insensitive" } }, { name: { contains: "deal", mode: "insensitive" } }, { name: { contains: "monday", mode: "insensitive" } }, { name: { contains: "sunday", mode: "insensitive" } }] },
      include: { category: true },
      take: 40,
    });
    console.log(`\nITEMS named special/deal/monday/sunday (${named.length}):`);
    for (const n of named) console.log(" -", JSON.stringify({ ...pick(n), category: n.category?.name, catWindow: hasFulfilWindow(n.category) ? pick(n.category).label : "(none)" }, null, 0));
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
