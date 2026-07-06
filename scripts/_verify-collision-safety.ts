/** DEV-only: verify the hardened resolver rules with synthetic promos.
 *  Requires _toggle-demo-stale-promo.ts make-stale state (original inactive,
 *  copy live). Cases:
 *   A hidden twin never mapped
 *   B name-equal twin preferred over a different-name visible twin
 *   C no name-equal → ALL visible twins appended
 *   D windowed (day-part) stale menu is NOT resolved (fails closed)
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);

async function main() {
  if ((process.env.DATABASE_URL || "").includes("dawn-tree")) throw new Error("Refusing PROD");
  const { resolvePromoMenuRefsForServing } = await import("../src/lib/menu");
  const rest = await prisma.restaurant.findUnique({ where: { slug: "demo-pizza-palace" }, select: { id: true } });

  // S1 = Spaghetti on the STALE (inactive, unwindowed) original menu.
  const s1: any = await prisma.menuItem.findFirst({
    where: { restaurantId: rest!.id, name: "Spaghetti Bolognese", category: { menu: { isActive: false } } },
    select: { id: true, lineageId: true, name: true, category: { select: { menu: { select: { id: true, isActive: true } } } } },
  });
  if (!s1) throw new Error("stale Spaghetti not found — run make-stale first");
  const lin = s1.lineageId ?? s1.id;
  // S2 = its live copy (same lineage) + that copy's category for planting twins.
  const s2: any = await prisma.menuItem.findFirst({
    where: { restaurantId: rest!.id, lineageId: lin, id: { not: s1.id }, category: { menu: { isActive: true } } },
    select: { id: true, name: true, categoryId: true },
  });
  if (!s2) throw new Error("live twin not found");

  const promo = () => ({ ruleConfig: { groups: [{ itemIds: [s1.id] }] } });
  const resolvedIds = async () => {
    const [r]: any[] = await resolvePromoMenuRefsForServing(rest!.id, [promo()]);
    return (r.ruleConfig?.groups?.[0]?.itemIds ?? []).map(String) as string[];
  };

  // Case A — hidden twin excluded.
  const s3 = await prisma.menuItem.create({
    data: { restaurantId: rest!.id, categoryId: s2.categoryId, name: "ZZ Wrong Dish", price: 99, lineageId: lin, isHidden: true, sortOrder: 999 },
    select: { id: true },
  });
  let ids = await resolvedIds();
  const caseA = ids.includes(s2.id) && !ids.includes(s3.id);
  console.log(`A hidden twin excluded:        ${caseA ? "✅" : "❌"} (${JSON.stringify(ids)})`);

  // Case B — name-equal beats different-name visible twin.
  await prisma.menuItem.update({ where: { id: s3.id }, data: { isHidden: false } });
  ids = await resolvedIds();
  const caseB = ids.includes(s2.id) && !ids.includes(s3.id);
  console.log(`B name-equal preferred:        ${caseB ? "✅" : "❌"} (${JSON.stringify(ids)})`);

  // Case C — no name-equal → all visible twins.
  await prisma.menuItem.update({ where: { id: s2.id }, data: { name: "Spaghetti Renamed" } });
  ids = await resolvedIds();
  const caseC = ids.includes(s2.id) && ids.includes(s3.id);
  console.log(`C all visible twins on rename: ${caseC ? "✅" : "❌"} (${JSON.stringify(ids)})`);

  // Case D — windowed stale menu is NOT dead → no resolution.
  const staleMenuId = s1.category.menu.id;
  await prisma.menu.update({ where: { id: staleMenuId }, data: { availableFrom: "11:00", availableTo: "14:00" } });
  ids = await resolvedIds();
  const caseD = ids.length === 1 && ids[0] === s1.id;
  console.log(`D windowed menu fails closed:  ${caseD ? "✅" : "❌"} (${JSON.stringify(ids)})`);

  // Cleanup.
  await prisma.menu.update({ where: { id: staleMenuId }, data: { availableFrom: null, availableTo: null } });
  await prisma.menuItem.update({ where: { id: s2.id }, data: { name: s2.name } });
  await prisma.menuItem.delete({ where: { id: s3.id } });
  console.log(`\nOVERALL: ${caseA && caseB && caseC && caseD ? "✅ all collision rules hold" : "❌ FAILURE"}`);
  await prisma.$disconnect();
  if (!(caseA && caseB && caseC && caseD)) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
