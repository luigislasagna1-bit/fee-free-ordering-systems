/** DEV-only: recreate Fabrizio's stale-promo state on the demo store to test
 *  the promo-editor stale-menu notice.
 *    make-stale — duplicate the active menu, then flip isActive DIRECTLY
 *                 (bypassing activateMenu so promos are NOT remapped): every
 *                 existing promo now references the inactive original.
 *    revert     — reactivate the original and delete the test copy.
 *  Prints a promo id to open in /admin/promotions/<id>/edit.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);
const COPY_NAME = "ZZ Stale-Promo Test Copy";

async function main() {
  if ((process.env.DATABASE_URL || "").includes("dawn-tree")) throw new Error("Refusing PROD");
  const mode = process.argv[2];
  const rest = await prisma.restaurant.findUnique({ where: { slug: "demo-pizza-palace" }, select: { id: true } });
  if (!rest) throw new Error("demo restaurant not found");

  if (mode === "make-stale") {
    const orig = await prisma.menu.findFirst({ where: { restaurantId: rest.id, isActive: true }, select: { id: true, name: true } });
    if (!orig) throw new Error("no active menu");
    // Dynamic import AFTER dotenv — src/lib/db.ts reads DATABASE_URL at import time.
    const { duplicateMenu } = await import("../src/lib/menu");
    const copyId = await duplicateMenu(rest.id, orig.id, COPY_NAME);
    // Direct flips — deliberately NOT activateMenu, so promos keep pointing
    // at the (now inactive) original. This is exactly Fabrizio's DB state.
    await prisma.menu.update({ where: { id: orig.id }, data: { isActive: false } });
    await prisma.menu.update({ where: { id: copyId }, data: { isActive: true } });
    const promo = await prisma.promotion.findFirst({
      where: { restaurantId: rest.id, isActive: true, ruleConfig: { not: null } },
      select: { id: true, name: true },
      orderBy: { createdAt: "desc" },
    });
    console.log(`✅ stale state ready. original=${orig.id} copy=${copyId}`);
    console.log(`Open: /admin/promotions/${promo?.id}/edit  (${promo?.name})`);
  } else if (mode === "revert") {
    const copy = await prisma.menu.findFirst({ where: { restaurantId: rest.id, name: COPY_NAME }, select: { id: true } });
    const orig = await prisma.menu.findFirst({ where: { restaurantId: rest.id, isActive: false, name: { not: COPY_NAME } }, orderBy: { updatedAt: "desc" }, select: { id: true } });
    if (copy) {
      const cats = await prisma.menuCategory.findMany({ where: { menuId: copy.id }, select: { id: true } });
      await prisma.menuItem.deleteMany({ where: { categoryId: { in: cats.map((c) => c.id) } } });
      await prisma.menuCategory.deleteMany({ where: { menuId: copy.id } });
      await prisma.menu.delete({ where: { id: copy.id } });
    }
    if (orig) await prisma.menu.update({ where: { id: orig.id }, data: { isActive: true } });
    const active = await prisma.menu.findFirst({ where: { restaurantId: rest.id, isActive: true }, select: { id: true, name: true } });
    console.log(`✅ reverted. active menu = ${active?.name} (${active?.id})`);
  } else {
    throw new Error("mode = make-stale | revert");
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
