/** DEV: dump demo-pizza-palace promotions (shape + which have eligible-item groups) for Get-it-Now verify.
 *    npx tsx scripts/_dump-demo-promos.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  const r = await prisma.restaurant.findUnique({ where: { slug: "demo-pizza-palace" }, select: { id: true, name: true } });
  if (!r) { console.log("no demo-pizza-palace"); await prisma.$disconnect(); return; }
  const promos = await prisma.promotion.findMany({ where: { restaurantId: r.id } });
  console.log(`${r.name}: ${promos.length} promos`);
  if (promos[0]) console.log("FIELDS:", Object.keys(promos[0]).join(", "));
  for (const p of promos as any[]) {
    const rules = p.rules ?? p.ruleConfig ?? p.config ?? null;
    const rulesStr = rules ? JSON.stringify(rules) : "(none)";
    console.log(`\n[${p.isActive ? "ON " : "off"}] ${p.promotionType}  "${p.name}"  id=${p.id}`);
    console.log(`   rules=${rulesStr.slice(0, 280)}`);
  }
  // also list categories + a couple items per category (to confirm 2+ categories exist for grouping)
  const cats = await prisma.category.findMany({ where: { restaurantId: r.id }, select: { id: true, name: true, menuItems: { select: { id: true, name: true }, take: 2 } }, take: 6 });
  console.log(`\nCATEGORIES (${cats.length}):`);
  for (const c of cats) console.log(`   ${c.name} (${c.id}) — ${c.menuItems.map((m) => m.name).join(", ")}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
